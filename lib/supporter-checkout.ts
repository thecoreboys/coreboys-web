import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";

type CheckoutAttemptRow = {
  attempt_id: string;
  amount_cents: number;
  state: "creating" | "open" | "completed" | "expired" | "failed";
  stripe_session_id: string | null;
  stripe_session_url: string | null;
  expires_at: Date | string;
};

export type SupporterCheckoutReservation =
  | { kind: "reserved"; attemptId: string }
  | { kind: "reused"; amountCents: number; url: string; expiresAt: string }
  | { kind: "reconcile"; amountCents: number; sessionId: string }
  | { kind: "busy"; amountCents: number; state: "creating" | "open" };

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/**
 * Atomically reserve the one allowed in-flight Checkout for an account.
 * A crashed `creating` reservation self-releases after the caller-supplied
 * deadline; an `open` reservation remains locked until its Stripe expiry.
 */
export async function reserveSupporterCheckout(input: {
  userId: string;
  amountCents: number;
  creatingExpiresAt: Date;
}): Promise<SupporterCheckoutReservation> {
  const attemptId = randomUUID();
  const inserted = await query<CheckoutAttemptRow>(
    `INSERT INTO supporter_checkout_attempts (
       user_id, attempt_id, amount_cents, state, expires_at
     ) VALUES ($1, $2, $3, 'creating', $4)
     ON CONFLICT (user_id) DO UPDATE SET
       attempt_id = EXCLUDED.attempt_id,
       amount_cents = EXCLUDED.amount_cents,
       state = 'creating',
       stripe_session_id = NULL,
       stripe_session_url = NULL,
       expires_at = EXCLUDED.expires_at,
       created_at = now(),
       updated_at = now()
     WHERE supporter_checkout_attempts.state IN ('completed', 'expired', 'failed')
        OR (supporter_checkout_attempts.state = 'creating' AND supporter_checkout_attempts.expires_at <= now())
     RETURNING attempt_id, amount_cents, state, stripe_session_id, stripe_session_url, expires_at`,
    [input.userId, attemptId, input.amountCents, input.creatingExpiresAt],
  );
  if (inserted.rows[0]?.attempt_id === attemptId) return { kind: "reserved", attemptId };

  const existing = await query<CheckoutAttemptRow>(
    `SELECT attempt_id, amount_cents, state, stripe_session_id, stripe_session_url, expires_at
       FROM supporter_checkout_attempts
      WHERE user_id = $1`,
    [input.userId],
  );
  const row = existing.rows[0];
  const existingExpiresAt = row ? new Date(row.expires_at).getTime() : Number.NaN;
  if (row?.state === "open" && row.stripe_session_url && existingExpiresAt > Date.now() && row.amount_cents === input.amountCents) {
    return { kind: "reused", amountCents: row.amount_cents, url: row.stripe_session_url, expiresAt: iso(row.expires_at) };
  }
  if (row?.state === "open" && row.stripe_session_id && existingExpiresAt <= Date.now()) {
    return { kind: "reconcile", amountCents: row.amount_cents, sessionId: row.stripe_session_id };
  }
  if (row?.state === "creating" || row?.state === "open") {
    return { kind: "busy", amountCents: row.amount_cents, state: row.state };
  }
  throw new Error("checkout_reservation_failed");
}

export async function openSupporterCheckout(input: {
  userId: string;
  attemptId: string;
  amountCents: number;
  sessionId: string;
  sessionUrl: string;
  expiresAt: Date;
}, client?: PoolClient) {
  const sql =
    `UPDATE supporter_checkout_attempts
        SET state = 'open', stripe_session_id = $3, stripe_session_url = $4,
            expires_at = $5, updated_at = now()
      WHERE user_id = $1 AND attempt_id = $2 AND amount_cents = $6 AND state = 'creating'`;
  const params = [input.userId, input.attemptId, input.sessionId, input.sessionUrl, input.expiresAt, input.amountCents];
  const result = client ? await client.query(sql, params) : await query(sql, params);
  if (result.rowCount !== 1) throw new Error("checkout_reservation_lost");
}

export async function failSupporterCheckout(userId: string, attemptId: string, client?: PoolClient) {
  const sql =
    `UPDATE supporter_checkout_attempts
        SET state = 'failed', stripe_session_url = NULL, expires_at = now(), updated_at = now()
      WHERE user_id = $1 AND attempt_id = $2 AND state = 'creating'`;
  const params = [userId, attemptId];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}

export async function finishSupporterCheckoutSession(
  sessionId: string,
  state: "completed" | "expired",
) {
  await query(
    `UPDATE supporter_checkout_attempts
        SET state = $2, stripe_session_url = NULL, expires_at = now(), updated_at = now()
      WHERE stripe_session_id = $1 AND state IN ('creating', 'open')`,
    [sessionId, state],
  );
}

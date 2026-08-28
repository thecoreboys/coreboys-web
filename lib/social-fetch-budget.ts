import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

const PROVIDER = "social_fetch" as const;
const MAX_CONFIGURABLE_CREDITS = 1_000_000;

export type SocialFetchCreditReservationDenialReason =
  | "paused"
  | "monthly_cap_reached"
  | "unavailable";

export type SocialFetchCreditReservation = {
  ok: true;
  reservationId: string;
  reservedCredits: number;
  monthCreditsAfterReservation: number;
  monthlyCreditCap: number;
};

export type SocialFetchCreditReservationDecision =
  | SocialFetchCreditReservation
  | { ok: false; reason: SocialFetchCreditReservationDenialReason };

export type SocialFetchBudgetStatus = {
  enabled: boolean;
  paused: boolean;
  monthlyCreditCap: number;
  creditsCharged: number;
  confirmedCreditsCharged: number;
  estimatedCreditsCharged: number;
  creditsReserved: number;
  creditsCommitted: number;
  creditsRemaining: number;
  requestsCompleted: number;
  requestsReserved: number;
  updatedAt: string;
};

type ControlRow = {
  enabled: boolean;
  monthly_credit_cap: number;
  updated_at: Date | string;
};

type UsageRow = {
  credits_charged: string;
  confirmed_credits_charged: string;
  estimated_credits_charged: string;
  credits_reserved: string;
  requests_completed: string;
  requests_reserved: string;
};

export type SocialFetchBudgetAdapter = {
  reserve: typeof reserveSocialFetchCredits;
  settle: typeof settleSocialFetchCredits;
};

function boundedPositiveInteger(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const integer = Math.ceil(value);
  return integer <= MAX_CONFIGURABLE_CREDITS ? integer : null;
}

function boundedNonNegativeInteger(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const integer = Math.ceil(value);
  return integer <= MAX_CONFIGURABLE_CREDITS ? integer : null;
}

function safeLedgerLabel(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return (normalized || fallback).slice(0, 300);
}

function numberFromAggregate(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("social_fetch_budget_invalid_usage");
  }
  return parsed;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function socialFetchReservationDenial(input: {
  enabled: boolean;
  monthlyCreditCap: number;
  creditsCommitted: number;
  requestedCredits: number;
}): SocialFetchCreditReservationDenialReason | null {
  if (!input.enabled) return "paused";
  if (
    !Number.isSafeInteger(input.monthlyCreditCap)
    || !Number.isSafeInteger(input.creditsCommitted)
    || !Number.isSafeInteger(input.requestedCredits)
    || input.monthlyCreditCap < 0
    || input.creditsCommitted < 0
    || input.requestedCredits <= 0
  ) {
    return "unavailable";
  }
  return input.creditsCommitted + input.requestedCredits > input.monthlyCreditCap
    ? "monthly_cap_reached"
    : null;
}

/**
 * Read the provider's authoritative charge from a response payload. Invalid
 * or missing metadata returns null so callers conservatively retain the
 * amount reserved before the request.
 */
export function readSocialFetchCreditsCharged(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as { creditsCharged?: unknown }).creditsCharged;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const text = typeof raw === "string" ? raw.trim() : null;
  if (text === "") return null;
  const parsed = typeof raw === "number" ? raw : Number(text);
  return boundedNonNegativeInteger(parsed);
}

/**
 * Atomically reserve credits before an outbound Social Fetch request. The
 * singleton control row is locked for the whole decision, serializing every
 * replica's cap check and ledger insert. A database/control failure denies the
 * call: callers must never fall through to the paid provider on an error.
 */
export async function reserveSocialFetchCredits(input: {
  feature: string;
  requestKey: string;
  estimatedCredits?: number;
}): Promise<SocialFetchCreditReservationDecision> {
  const estimatedCredits = boundedPositiveInteger(input.estimatedCredits ?? 1);
  if (estimatedCredits === null) return { ok: false, reason: "unavailable" };
  const reservationId = randomUUID();

  try {
    return await withTransaction(async (client) => {
      const controls = await client.query<ControlRow>(
        `SELECT enabled, monthly_credit_cap, updated_at
           FROM social_fetch_provider_control
          WHERE provider = $1
          FOR UPDATE`,
        [PROVIDER],
      );
      const control = controls.rows[0];
      if (!control) return { ok: false as const, reason: "unavailable" as const };

      const usage = await client.query<{ credits_committed: string }>(
        `SELECT COALESCE(SUM(
           CASE
             WHEN status = 'reserved' THEN estimated_credits
             WHEN status = 'completed' THEN COALESCE(actual_credits, estimated_credits)
             ELSE 0
           END
         ), 0)::text AS credits_committed
           FROM social_fetch_credit_events
          WHERE provider = $1
            AND created_at >= date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC'
            AND status IN ('reserved', 'completed')`,
        [PROVIDER],
      );
      const committed = numberFromAggregate(usage.rows[0]?.credits_committed);
      const denial = socialFetchReservationDenial({
        enabled: control.enabled,
        monthlyCreditCap: control.monthly_credit_cap,
        creditsCommitted: committed,
        requestedCredits: estimatedCredits,
      });
      if (denial) {
        return { ok: false as const, reason: denial };
      }

      await client.query(
        `INSERT INTO social_fetch_credit_events
          (id, provider, feature, request_key, estimated_credits, status)
         VALUES ($1, $2, $3, $4, $5, 'reserved')`,
        [
          reservationId,
          PROVIDER,
          safeLedgerLabel(input.feature, "unknown"),
          safeLedgerLabel(input.requestKey, "unknown"),
          estimatedCredits,
        ],
      );

      return {
        ok: true as const,
        reservationId,
        reservedCredits: estimatedCredits,
        monthCreditsAfterReservation: committed + estimatedCredits,
        monthlyCreditCap: control.monthly_credit_cap,
      };
    });
  } catch (error) {
    console.error("[social-fetch-budget] reservation failed closed", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Complete a reservation. When the response included meta.creditsCharged it
 * replaces the estimate; otherwise the original reservation remains the
 * conservative committed charge. This update is idempotent.
 */
export async function settleSocialFetchCredits(
  reservationId: string,
  actualCredits: number | null,
): Promise<void> {
  const reportedCredits = actualCredits === null
    ? null
    : boundedNonNegativeInteger(actualCredits);
  await query(
    `UPDATE social_fetch_credit_events
        SET actual_credits = $2,
            provider_reported = $3,
            status = 'completed',
            completed_at = now()
      WHERE id = $1
        AND provider = $4
        AND status = 'reserved'`,
    [reservationId, reportedCredits, reportedCredits !== null, PROVIDER],
  );
}

/** Admin-only status source; public feed components never read this data. */
export async function getSocialFetchBudgetStatus(): Promise<SocialFetchBudgetStatus> {
  const [controls, usage] = await Promise.all([
    query<ControlRow>(
      `SELECT enabled, monthly_credit_cap, updated_at
         FROM social_fetch_provider_control
        WHERE provider = $1`,
      [PROVIDER],
    ),
    query<UsageRow>(
      `SELECT
         COALESCE(SUM(COALESCE(actual_credits, estimated_credits))
           FILTER (WHERE status = 'completed'), 0)::text AS credits_charged,
         COALESCE(SUM(actual_credits)
           FILTER (WHERE status = 'completed' AND provider_reported), 0)::text AS confirmed_credits_charged,
         COALESCE(SUM(estimated_credits)
           FILTER (WHERE status = 'completed' AND NOT provider_reported), 0)::text AS estimated_credits_charged,
         COALESCE(SUM(estimated_credits)
           FILTER (WHERE status = 'reserved'), 0)::text AS credits_reserved,
         COUNT(*) FILTER (WHERE status = 'completed')::text AS requests_completed,
         COUNT(*) FILTER (WHERE status = 'reserved')::text AS requests_reserved
       FROM social_fetch_credit_events
       WHERE provider = $1
         AND created_at >= date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC'`,
      [PROVIDER],
    ),
  ]);
  const control = controls.rows[0];
  if (!control) throw new Error("social_fetch_budget_unavailable");
  const month = usage.rows[0];
  const creditsCharged = numberFromAggregate(month?.credits_charged);
  const creditsReserved = numberFromAggregate(month?.credits_reserved);
  const creditsCommitted = creditsCharged + creditsReserved;
  return {
    enabled: control.enabled,
    paused: !control.enabled,
    monthlyCreditCap: control.monthly_credit_cap,
    creditsCharged,
    confirmedCreditsCharged: numberFromAggregate(month?.confirmed_credits_charged),
    estimatedCreditsCharged: numberFromAggregate(month?.estimated_credits_charged),
    creditsReserved,
    creditsCommitted,
    creditsRemaining: Math.max(0, control.monthly_credit_cap - creditsCommitted),
    requestsCompleted: numberFromAggregate(month?.requests_completed),
    requestsReserved: numberFromAggregate(month?.requests_reserved),
    updatedAt: iso(control.updated_at),
  };
}

/** Update the global switch/cap and retain an immutable admin audit record. */
export async function updateSocialFetchBudgetSettings(input: {
  actorId: string;
  enabled: boolean;
  monthlyCreditCap: number;
}): Promise<SocialFetchBudgetStatus> {
  const monthlyCreditCap = boundedNonNegativeInteger(input.monthlyCreditCap);
  if (monthlyCreditCap === null || !Number.isInteger(input.monthlyCreditCap)) {
    throw new Error("invalid_social_fetch_monthly_credit_cap");
  }

  await withTransaction(async (client) => {
    const current = await client.query<ControlRow>(
      `SELECT enabled, monthly_credit_cap, updated_at
         FROM social_fetch_provider_control
        WHERE provider = $1
        FOR UPDATE`,
      [PROVIDER],
    );
    const before = current.rows[0];
    if (!before) throw new Error("social_fetch_budget_unavailable");
    const after = { enabled: input.enabled, monthlyCreditCap };
    await client.query(
      `UPDATE social_fetch_provider_control
          SET enabled = $2,
              monthly_credit_cap = $3,
              updated_by = $4,
              updated_at = now()
        WHERE provider = $1`,
      [PROVIDER, input.enabled, monthlyCreditCap, input.actorId],
    );
    await client.query(
      `INSERT INTO social_fetch_provider_control_audit
        (provider, actor_id, before, after)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        PROVIDER,
        input.actorId,
        JSON.stringify({
          enabled: before.enabled,
          monthlyCreditCap: before.monthly_credit_cap,
        }),
        JSON.stringify(after),
      ],
    );
  });

  return getSocialFetchBudgetStatus();
}

export const socialFetchBudgetAdapter: SocialFetchBudgetAdapter = {
  reserve: reserveSocialFetchCredits,
  settle: settleSocialFetchCredits,
};

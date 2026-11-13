import "server-only";
import { query } from "@/lib/db";

/**
 * Complimentary ("whitelisted") access to the creator-tag / on-screen
 * detection enhancement. Grants are append-only admin events in
 * fan_subscription_events; lib/subscriptions/store.ts reads the latest event
 * per account, so a revoke is simply a newer event. Billing rows are never
 * touched.
 */
export const GRANTABLE_FEATURE_ID = "player.creator_tags" as const;

export type FeatureGrantRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: "active" | "expired" | "revoked";
  expiresAt: string | null;
  note: string | null;
  changedAt: string;
};

export class FeatureGrantError extends Error {
  constructor(readonly code: "account_not_found" | "invalid_expiry") {
    super(code);
    this.name = "FeatureGrantError";
  }
}

type LatestGrantRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  event_type: string;
  expires_at: string | null;
  note: string | null;
  occurred_at: Date | string;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Latest administrative decision per account, newest first. */
export async function listFeatureGrants(now = new Date()): Promise<FeatureGrantRow[]> {
  const { rows } = await query<LatestGrantRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (e.user_id)
              e.user_id, u.email, u.display_name, e.event_type,
              e.payload->>'expiresAt' AS expires_at,
              e.payload->>'note' AS note,
              e.occurred_at
         FROM fan_subscription_events e
         JOIN fan_users u ON u.id = e.user_id
        WHERE e.actor_type = 'admin'
          AND e.event_type IN ('feature_entitlement_granted', 'feature_entitlement_revoked')
          AND e.payload->>'featureId' = $1
        ORDER BY e.user_id, e.id DESC
     ) latest
     ORDER BY occurred_at DESC
     LIMIT 500`,
    [GRANTABLE_FEATURE_ID],
  );
  return rows.map((row) => {
    const expiry = row.expires_at ? Date.parse(row.expires_at) : null;
    const status: FeatureGrantRow["status"] = row.event_type !== "feature_entitlement_granted"
      ? "revoked"
      : expiry !== null && (!Number.isFinite(expiry) || expiry <= now.getTime())
        ? "expired"
        : "active";
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      status,
      expiresAt: row.expires_at,
      note: row.note,
      changedAt: iso(row.occurred_at),
    };
  });
}

async function resolveAccount(input: { userId?: string; email?: string }): Promise<string> {
  const { rows } = input.userId
    ? await query<{ id: string }>(`SELECT id FROM fan_users WHERE id = $1 LIMIT 1`, [input.userId])
    : await query<{ id: string }>(`SELECT id FROM fan_users WHERE lower(email) = lower($1) LIMIT 1`, [input.email ?? ""]);
  const id = rows[0]?.id;
  if (!id) throw new FeatureGrantError("account_not_found");
  return id;
}

export async function grantFeatureAccess(input: {
  email?: string;
  userId?: string;
  expiresAt: string | null;
  note?: string;
  staffId: string;
  now?: Date;
}): Promise<string> {
  if (input.expiresAt !== null) {
    const expiry = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= (input.now ?? new Date()).getTime()) {
      throw new FeatureGrantError("invalid_expiry");
    }
  }
  const userId = await resolveAccount(input);
  await query(
    `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
     VALUES ($1, 'feature_entitlement_granted', 'admin', $2::jsonb)`,
    [userId, JSON.stringify({
      featureId: GRANTABLE_FEATURE_ID,
      expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
      note: input.note?.trim() || null,
      staffId: input.staffId,
    })],
  );
  return userId;
}

export async function revokeFeatureAccess(input: { userId: string; staffId: string }): Promise<void> {
  const userId = await resolveAccount({ userId: input.userId });
  await query(
    `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
     VALUES ($1, 'feature_entitlement_revoked', 'admin', $2::jsonb)`,
    [userId, JSON.stringify({ featureId: GRANTABLE_FEATURE_ID, staffId: input.staffId })],
  );
}

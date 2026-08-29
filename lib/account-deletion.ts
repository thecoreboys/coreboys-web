import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { getSubscriptionStorageSnapshot } from "@/lib/subscriptions/store";

export const ACCOUNT_DELETION_GRACE_DAYS = 14;

export type AccountDeletionRequest = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  status: "scheduled" | "cancelled" | "completed";
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
};

export async function ensureAccountDeletionSchema() {
  await ensureFanOauthSchema();
  await query(`
    CREATE TABLE IF NOT EXISTS fan_account_deletion_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
      requested_at timestamptz NOT NULL DEFAULT now(),
      scheduled_for timestamptz NOT NULL,
      cancelled_at timestamptz,
      UNIQUE (user_id, status)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS fan_account_deletion_due_idx ON fan_account_deletion_requests (status, scheduled_for)`);
}

function mapRow(row: Record<string, unknown>): AccountDeletionRequest {
  return {
    id: String(row.id), userId: String(row.user_id), email: String(row.email), displayName: String(row.display_name),
    status: row.status as AccountDeletionRequest["status"], requestedAt: new Date(String(row.requested_at)).toISOString(),
    scheduledFor: new Date(String(row.scheduled_for)).toISOString(), cancelledAt: row.cancelled_at ? new Date(String(row.cancelled_at)).toISOString() : null,
  };
}

export async function getAccountDeletionRequest(userId: string) {
  await ensureAccountDeletionSchema();
  const result = await query(`SELECT r.*, u.email, u.display_name FROM fan_account_deletion_requests r JOIN fan_users u ON u.id=r.user_id WHERE r.user_id=$1 AND r.status='scheduled' LIMIT 1`, [userId]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function requestAccountDeletion(userId: string) {
  const snapshot = await getSubscriptionStorageSnapshot(userId);
  const subscription = snapshot.subscription;
  if (subscription && !subscription.cancelAtPeriodEnd && ["active", "trialing", "past_due", "paused"].includes(subscription.status)) {
    throw new Error("Cancel your renewing subscription in Billing before requesting account deletion.");
  }
  await ensureAccountDeletionSchema();
  const existing = await getAccountDeletionRequest(userId);
  if (existing) return existing;
  const result = await query(`INSERT INTO fan_account_deletion_requests (user_id, scheduled_for) VALUES ($1, now() + interval '14 days') RETURNING id`, [userId]);
  return getAccountDeletionRequest(userId).then((request) => request ?? { id: String(result.rows[0]?.id), userId, email: "", displayName: "", status: "scheduled", requestedAt: new Date().toISOString(), scheduledFor: new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 86400000).toISOString(), cancelledAt: null });
}

export async function cancelAccountDeletion(userId: string) {
  await ensureAccountDeletionSchema();
  await query(`UPDATE fan_account_deletion_requests SET status='cancelled', cancelled_at=now() WHERE user_id=$1 AND status='scheduled'`, [userId]);
}

export async function listAccountDeletionRequests() {
  await ensureAccountDeletionSchema();
  const result = await query(`SELECT r.*, u.email, u.display_name FROM fan_account_deletion_requests r JOIN fan_users u ON u.id=r.user_id WHERE r.status='scheduled' ORDER BY r.scheduled_for ASC`);
  return result.rows.map(mapRow);
}

export async function scheduleAccountDeletionByAdmin(userId: string) {
  const snapshot = await getSubscriptionStorageSnapshot(userId);
  if (snapshot.subscription && !snapshot.subscription.cancelAtPeriodEnd && ["active", "trialing", "past_due", "paused"].includes(snapshot.subscription.status)) {
    throw new Error("The user must cancel the renewing subscription before deletion can be scheduled.");
  }
  await ensureAccountDeletionSchema();
  const result = await query(`INSERT INTO fan_account_deletion_requests (user_id, scheduled_for) VALUES ($1, now() + interval '14 days') ON CONFLICT (user_id, status) DO UPDATE SET scheduled_for=EXCLUDED.scheduled_for RETURNING id`, [userId]);
  return result.rows[0]?.id ?? null;
}

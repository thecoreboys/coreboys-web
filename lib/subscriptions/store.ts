import { query, withTransaction } from "@/lib/db";
import {
  isAddOnId,
  isLifetimeSku,
  isPlanId,
  METER_IDS,
  SUBSCRIPTION_STATUSES,
  type AddOnId,
  type LifetimeSku,
  type MeterId,
  type PlanId,
  type SubscriptionStatus,
} from "./catalog";

export type StoredSubscription = {
  planId: PlanId;
  status: SubscriptionStatus;
  source: "manual_local" | "future_billing" | "support" | "migration";
  billingInterval: "none" | "month" | "year" | "lifetime";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  externalCustomerRef?: string | null;
  externalContractRef?: string | null;
};

export type StoredAddOn = {
  id: string;
  addOnId: AddOnId;
  status: "active" | "expired" | "revoked";
  quantity: number;
  startsAt: string;
  expiresAt: string | null;
};

export type StoredLifetimeEntitlement = {
  sku: LifetimeSku;
  status: "active" | "revoked";
  grantedAt: string;
  revokedAt: string | null;
};

export type StoredMeterUsage = {
  meterId: MeterId;
  periodKey: string;
  used: number;
};

export type SubscriptionStorageSnapshot = {
  state: "ready" | "migration_required";
  subscription: StoredSubscription | null;
  addOns: StoredAddOn[];
  lifetime: StoredLifetimeEntitlement | null;
  usage: StoredMeterUsage[];
};

type SubscriptionRow = {
  plan_id: string;
  status: string;
  source: string;
  billing_interval: string;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  trial_ends_at: Date | string | null;
  cancel_at_period_end: boolean;
  external_customer_ref: string | null;
  external_contract_ref: string | null;
};

type AddOnRow = {
  id: string;
  addon_id: string;
  status: string;
  quantity: number;
  starts_at: Date | string;
  expires_at: Date | string | null;
};

type LifetimeRow = {
  sku: string;
  status: string;
  granted_at: Date | string;
  revoked_at: Date | string | null;
};

type UsageRow = {
  meter_id: string;
  period_key: string;
  used: string | number;
};

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

function emptySnapshot(state: SubscriptionStorageSnapshot["state"]): SubscriptionStorageSnapshot {
  return { state, subscription: null, addOns: [], lifetime: null, usage: [] };
}

/** Read account billing state. No payment provider is contacted. */
export async function getSubscriptionStorageSnapshot(
  userId: string,
): Promise<SubscriptionStorageSnapshot> {
  try {
    const [subscriptionResult, addOnResult, lifetimeResult, usageResult] = await Promise.all([
      query<SubscriptionRow>(
        `SELECT plan_id, status, source, billing_interval, current_period_start,
                current_period_end, trial_ends_at, cancel_at_period_end,
                external_customer_ref, external_contract_ref
           FROM fan_subscriptions
          WHERE user_id = $1`,
        [userId],
      ),
      query<AddOnRow>(
        `SELECT id, addon_id, status, quantity, starts_at, expires_at
           FROM fan_subscription_addons
          WHERE user_id = $1
          ORDER BY starts_at ASC, id ASC`,
        [userId],
      ),
      query<LifetimeRow>(
        `SELECT sku, status, granted_at, revoked_at
           FROM fan_lifetime_entitlements
          WHERE user_id = $1 AND sku = 'local_pro_lifetime'`,
        [userId],
      ),
      query<UsageRow>(
        `SELECT meter_id, period_key, used
           FROM fan_entitlement_usage
          WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const rawSubscription = subscriptionResult.rows[0];
    const subscription = rawSubscription
      && isPlanId(rawSubscription.plan_id)
      && isSubscriptionStatus(rawSubscription.status)
      && ["manual_local", "future_billing", "support", "migration"].includes(rawSubscription.source)
      && ["none", "month", "year", "lifetime"].includes(rawSubscription.billing_interval)
      ? {
          planId: rawSubscription.plan_id,
          status: rawSubscription.status,
          source: rawSubscription.source as StoredSubscription["source"],
          billingInterval: rawSubscription.billing_interval as StoredSubscription["billingInterval"],
          currentPeriodStart: iso(rawSubscription.current_period_start),
          currentPeriodEnd: iso(rawSubscription.current_period_end),
          trialEndsAt: iso(rawSubscription.trial_ends_at),
          cancelAtPeriodEnd: rawSubscription.cancel_at_period_end,
          externalCustomerRef: rawSubscription.external_customer_ref,
          externalContractRef: rawSubscription.external_contract_ref,
        }
      : null;

    const addOns = addOnResult.rows.flatMap<StoredAddOn>((row) => {
      if (!isAddOnId(row.addon_id) || !["active", "expired", "revoked"].includes(row.status)) return [];
      const startsAt = iso(row.starts_at);
      if (!startsAt) return [];
      return [{
        id: row.id,
        addOnId: row.addon_id,
        status: row.status as StoredAddOn["status"],
        quantity: Math.max(1, Math.trunc(Number(row.quantity) || 1)),
        startsAt,
        expiresAt: iso(row.expires_at),
      }];
    });

    const rawLifetime = lifetimeResult.rows[0];
    const grantedAt = rawLifetime ? iso(rawLifetime.granted_at) : null;
    const lifetime = rawLifetime
      && grantedAt
      && isLifetimeSku(rawLifetime.sku)
      && ["active", "revoked"].includes(rawLifetime.status)
      ? {
          sku: rawLifetime.sku,
          status: rawLifetime.status as StoredLifetimeEntitlement["status"],
          grantedAt,
          revokedAt: iso(rawLifetime.revoked_at),
        }
      : null;

    const usage = usageResult.rows.flatMap<StoredMeterUsage>((row) => {
      if (!(METER_IDS as readonly string[]).includes(row.meter_id)) return [];
      return [{
        meterId: row.meter_id as MeterId,
        periodKey: row.period_key,
        used: Math.max(0, Math.trunc(Number(row.used) || 0)),
      }];
    });

    return { state: "ready", subscription, addOns, lifetime, usage };
  } catch (error) {
    // The account remains safely Free before the additive migration is run.
    if (isUndefinedTable(error)) return emptySnapshot("migration_required");
    throw error;
  }
}

export async function upsertStripeSubscription(input: {
  userId: string;
  customerId: string;
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO fan_subscriptions (
         user_id, plan_id, status, source, billing_interval, current_period_start,
         current_period_end, cancel_at_period_end, external_customer_ref, external_plan_ref, external_contract_ref
       ) VALUES ($1, 'plus', $2, 'future_billing', 'month', $3, $4, $5, $6, 'stripe_supporter_monthly', $7)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = 'plus', status = EXCLUDED.status, source = 'future_billing', billing_interval = 'month',
         current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         external_customer_ref = EXCLUDED.external_customer_ref, external_plan_ref = EXCLUDED.external_plan_ref,
         external_contract_ref = EXCLUDED.external_contract_ref, updated_at = now()`,
      [input.userId, input.status, input.currentPeriodStart, input.currentPeriodEnd, input.cancelAtPeriodEnd, input.customerId, input.subscriptionId],
    );
    await client.query(
      `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
       VALUES ($1, 'stripe_subscription_synced', 'future_provider', $2::jsonb)`,
      [input.userId, JSON.stringify({ subscriptionId: input.subscriptionId, status: input.status, cancelAtPeriodEnd: input.cancelAtPeriodEnd })],
    );
  });
}

export function periodKeyForMeter(meterId: MeterId, now = new Date()): string {
  if (meterId === "cloud_storage_mb" || meterId === "additional_profiles") return "lifetime";
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Atomically consume a metered entitlement after the service layer has
 * calculated its current account limit. Returns null when the limit would be
 * exceeded. This is the write primitive premium server routes should use.
 */
export async function consumeStoredMeter(input: {
  userId: string;
  meterId: MeterId;
  periodKey: string;
  amount: number;
  limit: number;
}): Promise<number | null> {
  const amount = Math.trunc(input.amount);
  const limit = Math.trunc(input.limit);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(limit) || amount <= 0 || limit < 0) {
    throw new Error("invalid_meter_amount");
  }
  if (amount > limit) return null;

  return withTransaction(async (client) => {
    const result = await client.query<{ used: string | number }>(
      `INSERT INTO fan_entitlement_usage (user_id, meter_id, period_key, used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, meter_id, period_key) DO UPDATE
         SET used = fan_entitlement_usage.used + EXCLUDED.used,
             updated_at = now()
       WHERE fan_entitlement_usage.used + EXCLUDED.used <= $5
       RETURNING used`,
      [input.userId, input.meterId, input.periodKey, amount, limit],
    );
    const row = result.rows[0];
    return row ? Math.max(0, Math.trunc(Number(row.used) || 0)) : null;
  });
}

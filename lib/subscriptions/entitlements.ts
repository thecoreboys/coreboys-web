import {
  ADD_ONS,
  ALWAYS_FREE_FEATURE_IDS,
  FEATURE_IDS,
  LOCAL_LIFETIME_PRODUCT,
  METER_IDS,
  PLANS,
  higherPlan,
  minimumPlanForFeature,
  planIncludesFeature,
  type FeatureId,
  type MeterId,
  type PlanId,
  type SubscriptionStatus,
} from "./catalog";
import { resolveLocalPlanOverride, type LocalOverrideEnvironment } from "./local-override";
import {
  consumeStoredMeter,
  getSubscriptionStorageSnapshot,
  periodKeyForMeter,
  type SubscriptionStorageSnapshot,
} from "./store";
import { membershipBillingConfigured } from "./billing";

export type EffectiveSubscriptionSource =
  | "free"
  | "subscription"
  | "local_lifetime"
  | "development_override";

export type EntitlementMeter = {
  meterId: MeterId;
  periodKey: string;
  limit: number;
  used: number;
  remaining: number;
};

export type AccountSubscriptionState = {
  account: {
    effectivePlanId: PlanId;
    effectivePlanName: string;
    status: SubscriptionStatus | "free";
    source: EffectiveSubscriptionSource;
    storedPlanId: PlanId | null;
    hasManagedSubscription: boolean;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    storageState: SubscriptionStorageSnapshot["state"];
    developmentOverrideActive: boolean;
    billingConfigured: boolean;
  };
  entitlements: {
    allowed: FeatureId[];
    denied: FeatureId[];
    alwaysFree: readonly FeatureId[];
  };
  meters: Record<MeterId, EntitlementMeter>;
  addOns: SubscriptionStorageSnapshot["addOns"];
  lifetime: SubscriptionStorageSnapshot["lifetime"];
};

export type EntitlementDecision = {
  featureId: FeatureId;
  allowed: boolean;
  effectivePlanId: PlanId;
  requiredPlanId: PlanId | null;
  reason: "included" | "always_free" | "plan_required";
};

const ACTIVE_STATUSES = new Set<SubscriptionStatus>(["active", "trialing"]);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(["canceled", "expired"]);

const METER_FEATURE: Readonly<Record<MeterId, FeatureId>> = {
  semantic_queries_monthly: "search.semantic",
  automation_runs_monthly: "automation.rules",
  cloud_storage_mb: "cloud.extended_storage",
  additional_profiles: "profiles.additional",
};

function instant(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function subscriptionIsEntitled(
  snapshot: SubscriptionStorageSnapshot,
  now: Date,
): boolean {
  const subscription = snapshot.subscription;
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;
  const periodEnd = instant(subscription.currentPeriodEnd);
  if (periodEnd !== null && periodEnd <= now.getTime()) return false;
  const trialEnd = instant(subscription.trialEndsAt);
  if (subscription.status === "trialing" && trialEnd !== null && trialEnd <= now.getTime()) return false;
  return true;
}

function addOnIsActive(
  addOn: SubscriptionStorageSnapshot["addOns"][number],
  now: Date,
): boolean {
  if (addOn.status !== "active") return false;
  const startsAt = instant(addOn.startsAt);
  const expiresAt = instant(addOn.expiresAt);
  return (startsAt === null || startsAt <= now.getTime())
    && (expiresAt === null || expiresAt > now.getTime());
}

export function resolveSubscriptionSnapshot(input: {
  snapshot: SubscriptionStorageSnapshot;
  now?: Date;
  overridePlanId?: PlanId | null;
}): AccountSubscriptionState {
  const now = input.now ?? new Date();
  const { snapshot } = input;
  let effectivePlanId: PlanId = "free";
  let source: EffectiveSubscriptionSource = "free";
  let status: SubscriptionStatus | "free" = snapshot.subscription?.status ?? "free";

  if (subscriptionIsEntitled(snapshot, now) && snapshot.subscription) {
    effectivePlanId = snapshot.subscription.planId;
    source = "subscription";
  }

  if (snapshot.lifetime?.status === "active") {
    const withLifetime = higherPlan(effectivePlanId, LOCAL_LIFETIME_PRODUCT.grantsPlanId);
    if (withLifetime !== effectivePlanId || source === "free") source = "local_lifetime";
    effectivePlanId = withLifetime;
    status = "active";
  }

  if (input.overridePlanId) {
    effectivePlanId = input.overridePlanId;
    source = "development_override";
    status = "active";
  }

  const allowed = FEATURE_IDS.filter((featureId) => planIncludesFeature(effectivePlanId, featureId));
  const denied = FEATURE_IDS.filter((featureId) => !planIncludesFeature(effectivePlanId, featureId));
  const activeAddOns = snapshot.addOns.filter((addOn) => addOnIsActive(addOn, now));

  const meters = Object.fromEntries(METER_IDS.map((meterId) => {
    const periodKey = periodKeyForMeter(meterId, now);
    const addOnUnits = activeAddOns.reduce((total, addOn) => {
      const definition = ADD_ONS[addOn.addOnId];
      return definition.meterId === meterId
        ? total + definition.unitsPerPack * addOn.quantity
        : total;
    }, 0);
    const limit = PLANS[effectivePlanId].limits[meterId] + addOnUnits;
    const used = snapshot.usage
      .filter((entry) => entry.meterId === meterId && entry.periodKey === periodKey)
      .reduce((total, entry) => total + entry.used, 0);
    return [meterId, {
      meterId,
      periodKey,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    } satisfies EntitlementMeter];
  })) as Record<MeterId, EntitlementMeter>;

  return {
    account: {
      effectivePlanId,
      effectivePlanName: PLANS[effectivePlanId].name,
      status,
      source,
      storedPlanId: snapshot.subscription?.planId ?? null,
      hasManagedSubscription: Boolean(
        snapshot.subscription?.externalContractRef
        && !TERMINAL_SUBSCRIPTION_STATUSES.has(snapshot.subscription.status),
      ),
      currentPeriodEnd: snapshot.subscription?.currentPeriodEnd ?? null,
      trialEndsAt: snapshot.subscription?.trialEndsAt ?? null,
      cancelAtPeriodEnd: snapshot.subscription?.cancelAtPeriodEnd ?? false,
      storageState: snapshot.state,
      developmentOverrideActive: source === "development_override",
      billingConfigured: membershipBillingConfigured(),
    },
    entitlements: {
      allowed,
      denied,
      alwaysFree: ALWAYS_FREE_FEATURE_IDS,
    },
    meters,
    addOns: snapshot.addOns,
    lifetime: snapshot.lifetime,
  };
}

export async function getAccountSubscriptionState(input: {
  userId: string;
  requestHostname: string;
  now?: Date;
  env?: LocalOverrideEnvironment;
}): Promise<AccountSubscriptionState> {
  const snapshot = await getSubscriptionStorageSnapshot(input.userId);
  const override = resolveLocalPlanOverride({
    env: input.env ?? process.env,
    requestHostname: input.requestHostname,
    userId: input.userId,
  });
  return resolveSubscriptionSnapshot({
    snapshot,
    now: input.now,
    overridePlanId: override.active ? override.planId : null,
  });
}

export function entitlementDecision(
  state: AccountSubscriptionState,
  featureId: FeatureId,
): EntitlementDecision {
  const alwaysFree = (ALWAYS_FREE_FEATURE_IDS as readonly string[]).includes(featureId);
  const allowed = alwaysFree || state.entitlements.allowed.includes(featureId);
  return {
    featureId,
    allowed,
    effectivePlanId: state.account.effectivePlanId,
    requiredPlanId: minimumPlanForFeature(featureId),
    reason: alwaysFree ? "always_free" : allowed ? "included" : "plan_required",
  };
}

export class EntitlementDeniedError extends Error {
  readonly code: "plan_required" | "usage_limit_exceeded";
  readonly featureId: FeatureId;
  readonly requiredPlanId: PlanId | null;

  constructor(input: {
    code: "plan_required" | "usage_limit_exceeded";
    featureId: FeatureId;
    requiredPlanId: PlanId | null;
  }) {
    super(input.code);
    this.name = "EntitlementDeniedError";
    this.code = input.code;
    this.featureId = input.featureId;
    this.requiredPlanId = input.requiredPlanId;
  }
}

/** Server routes call this before executing a paid software utility. */
export async function requireAccountEntitlement(input: {
  userId: string;
  requestHostname: string;
  featureId: FeatureId;
  now?: Date;
}): Promise<AccountSubscriptionState> {
  const state = await getAccountSubscriptionState(input);
  const decision = entitlementDecision(state, input.featureId);
  if (!decision.allowed) {
    throw new EntitlementDeniedError({
      code: "plan_required",
      featureId: input.featureId,
      requiredPlanId: decision.requiredPlanId,
    });
  }
  return state;
}

/**
 * Authoritative metered-use check and atomic consumption. Client-side counters
 * are display-only and must not replace this server operation.
 */
export async function consumeAccountMeter(input: {
  userId: string;
  requestHostname: string;
  meterId: MeterId;
  amount?: number;
  now?: Date;
}): Promise<{ used: number; remaining: number; limit: number; periodKey: string }> {
  const featureId = METER_FEATURE[input.meterId];
  const state = await requireAccountEntitlement({
    userId: input.userId,
    requestHostname: input.requestHostname,
    featureId,
    now: input.now,
  });
  const meter = state.meters[input.meterId];
  const amount = Math.trunc(input.amount ?? 1);
  if (amount <= 0 || meter.remaining < amount) {
    throw new EntitlementDeniedError({
      code: "usage_limit_exceeded",
      featureId,
      requiredPlanId: minimumPlanForFeature(featureId),
    });
  }
  const used = await consumeStoredMeter({
    userId: input.userId,
    meterId: input.meterId,
    periodKey: meter.periodKey,
    amount,
    limit: meter.limit,
  });
  if (used === null) {
    throw new EntitlementDeniedError({
      code: "usage_limit_exceeded",
      featureId,
      requiredPlanId: minimumPlanForFeature(featureId),
    });
  }
  return {
    used,
    remaining: Math.max(0, meter.limit - used),
    limit: meter.limit,
    periodKey: meter.periodKey,
  };
}

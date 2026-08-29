/**
 * Product and entitlement catalog for the independent software service.
 *
 * This module is deliberately provider- and creator-neutral. It describes
 * original account, sync, discovery, and workspace utilities. Access to public
 * creator content is never sold by this catalog and every playback capability
 * is part of the free plan.
 */

// `plus` is retained as the persisted ID for backwards-compatible database
// migrations. It is presented to people as the single Supporter membership.
export const PLAN_IDS = ["free", "plus", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
  "expired",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const FEATURE_IDS = [
  "playback.public",
  "playback.live",
  "playback.embedded",
  "catalog.browse",
  "guide.standard",
  "search.basic",
  "lists.basic",
  "playback.controls",
  "accessibility.controls",
  "privacy.controls",
  "account.security",
  "account.data_export",
  "account.data_deletion",
  "sync.watch_history",
  "sync.saved_items",
  "sync.preferences",
  "history.extended",
  "history.manual_correction",
  "lists.multiple",
  "lists.folders",
  "filters.advanced",
  "guide.personalized",
  "notifications.advanced",
  "recommendations.personalized",
  "profiles.additional",
  "queue.smart",
  "queue.cloud_sync",
  "queue.templates",
  "search.saved",
  "search.semantic",
  "search.fuzzy_advanced",
  "search.moments",
  "recommendations.advanced",
  "recommendations.controls",
  "recommendations.explanations",
  "analytics.personal",
  "automation.rules",
  "multiview.expanded",
  "multiview.saved_layouts",
  "chat.saved_layouts",
  "rooms.private",
  "player.advanced_preferences",
  "bookmarks.timestamps",
  "guide.custom_channels",
  "channels.smart",
  "notes.private",
  "cloud.extended_storage",
  "collaboration.shared_queues",
  "community.roles",
  "themes.neutral",
  "supporter.neutral_badge",
  "chat.site_user_badge",
  "community.private_lounges",
  "dvr.extended_retention",
  "history.continue_watching_extended",
  "player.custom_skins",
  "passport.card_customization",
  "economy.cosmetics",
  "support.priority",
  "workspace.team",
  "workspace.roles",
  "analytics.aggregate",
  "catalog.authorized_management",
  "exports.business",
  "support.business",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const ALWAYS_FREE_FEATURE_IDS = [
  "playback.public",
  "playback.live",
  "playback.embedded",
  "catalog.browse",
  "guide.standard",
  "search.basic",
  "search.fuzzy_advanced",
  "lists.basic",
  "playback.controls",
  "accessibility.controls",
  "privacy.controls",
  "account.security",
  "account.data_export",
  "account.data_deletion",
] as const satisfies readonly FeatureId[];

export const METER_IDS = [
  "semantic_queries_monthly",
  "automation_runs_monthly",
  "cloud_storage_mb",
  "additional_profiles",
] as const;
export type MeterId = (typeof METER_IDS)[number];

export const ADD_ON_IDS = [
  "semantic_search_pack_100",
  "automation_pack_1000",
  "cloud_storage_pack_25gb",
] as const;
export type AddOnId = (typeof ADD_ON_IDS)[number];

export const LIFETIME_SKUS = ["local_pro_lifetime"] as const;
export type LifetimeSku = (typeof LIFETIME_SKUS)[number];

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  rank: number;
  planningPrice: {
    currency: "USD";
    monthlyCents: number | null;
    label: string;
    /** No checkout is attached to these planning values. */
    status: "planning_only";
  };
  features: readonly FeatureId[];
  limits: Readonly<Record<MeterId, number>>;
};

const FREE_FEATURES = [...ALWAYS_FREE_FEATURE_IDS] as const;
const PLUS_FEATURES = [
  ...FREE_FEATURES,
  "sync.watch_history",
  "sync.saved_items",
  "sync.preferences",
  "history.extended",
  "history.manual_correction",
  "lists.multiple",
  "lists.folders",
  "filters.advanced",
  "notifications.advanced",
  "queue.cloud_sync",
  "queue.templates",
  "search.saved",
  "search.semantic",
  "search.moments",
  "notes.private",
  "multiview.expanded",
  "multiview.saved_layouts",
  "rooms.private",
  "collaboration.shared_queues",
  "analytics.personal",
  "themes.neutral",
  "supporter.neutral_badge",
  "chat.site_user_badge",
  "community.private_lounges",
  "dvr.extended_retention",
  "history.continue_watching_extended",
  "player.custom_skins",
  "passport.card_customization",
  "economy.cosmetics",
  "player.advanced_preferences",
] as const satisfies readonly FeatureId[];
const PRO_FEATURES = [
  ...PLUS_FEATURES,
] as const satisfies readonly FeatureId[];
const BUSINESS_FEATURES = [
  ...PRO_FEATURES,
  "workspace.team",
  "workspace.roles",
  "analytics.aggregate",
  "catalog.authorized_management",
  "exports.business",
  "support.business",
] as const satisfies readonly FeatureId[];

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = {
  free: {
    id: "free",
    name: "Free",
    description: "Watch public content and use the standard catalog and guide.",
    rank: 0,
    planningPrice: { currency: "USD", monthlyCents: 0, label: "Free", status: "planning_only" },
    features: FREE_FEATURES,
    limits: {
      semantic_queries_monthly: 0,
      automation_runs_monthly: 0,
      cloud_storage_mb: 0,
      additional_profiles: 0,
    },
  },
  plus: {
    id: "plus",
    name: "CORE Membership",
    description: "One monthly membership for the enhanced CORE player, private community spaces, and Passport customization.",
    rank: 1,
    planningPrice: { currency: "USD", monthlyCents: 500, label: "$5 / month", status: "planning_only" },
    features: PLUS_FEATURES,
    limits: {
      semantic_queries_monthly: 0,
      automation_runs_monthly: 0,
      cloud_storage_mb: 0,
      additional_profiles: 0,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Legacy plan alias. New memberships use Supporter.",
    rank: 2,
    planningPrice: { currency: "USD", monthlyCents: 700, label: "$7 / month", status: "planning_only" },
    features: PRO_FEATURES,
    limits: {
      semantic_queries_monthly: 0,
      automation_runs_monthly: 0,
      cloud_storage_mb: 0,
      additional_profiles: 0,
    },
  },
  business: {
    id: "business",
    name: "Business",
    description: "Authorized team workspaces, aggregate analytics, and administrative tools.",
    rank: 3,
    planningPrice: { currency: "USD", monthlyCents: 4_900, label: "From $49 / month", status: "planning_only" },
    features: BUSINESS_FEATURES,
    limits: {
      semantic_queries_monthly: 2_000,
      automation_runs_monthly: 10_000,
      cloud_storage_mb: 102_400,
      additional_profiles: 50,
    },
  },
};

export type AddOnDefinition = {
  id: AddOnId;
  name: string;
  description: string;
  meterId: MeterId;
  unitsPerPack: number;
  availability: "planned";
  /** Hidden legacy SKUs remain readable for persisted purchases and migrations. */
  publiclyListed: boolean;
};

export const ADD_ONS: Readonly<Record<AddOnId, AddOnDefinition>> = {
  semantic_search_pack_100: {
    id: "semantic_search_pack_100",
    name: "100 semantic searches",
    description: "Adds reusable search capacity to an eligible account.",
    meterId: "semantic_queries_monthly",
    unitsPerPack: 100,
    availability: "planned",
    publiclyListed: false,
  },
  automation_pack_1000: {
    id: "automation_pack_1000",
    name: "1,000 automation runs",
    description: "Adds automation capacity to an eligible account.",
    meterId: "automation_runs_monthly",
    unitsPerPack: 1_000,
    availability: "planned",
    publiclyListed: true,
  },
  cloud_storage_pack_25gb: {
    id: "cloud_storage_pack_25gb",
    name: "25 GB cloud storage",
    description: "Adds storage for original account data and private workspace assets.",
    meterId: "cloud_storage_mb",
    unitsPerPack: 25 * 1_024,
    availability: "planned",
    publiclyListed: true,
  },
};

export const LOCAL_LIFETIME_PRODUCT = {
  sku: "local_pro_lifetime" as const,
  name: "Local Pro lifetime license",
  description: "A planned one-time license for original software utilities on one local installation.",
  grantsPlanId: "pro" as const,
  planningPrice: {
    currency: "USD" as const,
    oneTimeCents: 4_900,
    label: "$49 one time",
    status: "planning_only" as const,
  },
  availability: "planned" as const,
};

export const INDEPENDENT_SERVICE_DISCLOSURES = {
  productCategory: "independent_software_service" as const,
  affiliation: "Independent fan-made software. Not affiliated with, endorsed by, sponsored by, or operated by featured creators or third-party platforms.",
  paymentPurpose: "Any future payment is for original software utilities, hosting, sync, personalization, storage, automation, or support—not access to creator content.",
  publicContentAccess: "Public videos, streams, broadcasts, and standard playback remain available without a paid software plan.",
  creatorCompensation: "No payment goes to a featured creator unless that relationship is expressly and separately disclosed.",
  ownership: "Names, logos, media, and trademarks remain the property of their respective owners.",
  platformTerms: "Playback and interactions remain subject to each originating platform's terms and availability.",
} as const;

export const BILLING_FOUNDATION = {
  mode: "stripe_membership" as const,
  checkoutAvailable: true,
  chargesEnabled: true,
  deploymentReady: true,
  minimumMonthlyCents: 500,
  message: "Supporter memberships are optional monthly payments for independent app development and operating costs. Cancel anytime from Billing.",
} as const;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && (FEATURE_IDS as readonly string[]).includes(value);
}

export function isAddOnId(value: unknown): value is AddOnId {
  return typeof value === "string" && (ADD_ON_IDS as readonly string[]).includes(value);
}

export function isLifetimeSku(value: unknown): value is LifetimeSku {
  return typeof value === "string" && (LIFETIME_SKUS as readonly string[]).includes(value);
}

export function planIncludesFeature(planId: PlanId, featureId: FeatureId): boolean {
  if ((ALWAYS_FREE_FEATURE_IDS as readonly string[]).includes(featureId)) return true;
  return PLANS[planId].features.includes(featureId);
}

export function higherPlan(left: PlanId, right: PlanId): PlanId {
  return PLANS[left].rank >= PLANS[right].rank ? left : right;
}

export function minimumPlanForFeature(featureId: FeatureId): PlanId | null {
  if ((ALWAYS_FREE_FEATURE_IDS as readonly string[]).includes(featureId)) return null;
  return PLAN_IDS.find((planId) => PLANS[planId].features.includes(featureId)) ?? null;
}

export function catalogForClient() {
  return {
    plans: PLAN_IDS.map((id) => PLANS[id]),
    addOns: ADD_ON_IDS.map((id) => ADD_ONS[id]).filter((addOn) => addOn.publiclyListed),
    lifetime: LOCAL_LIFETIME_PRODUCT,
    disclosures: INDEPENDENT_SERVICE_DISCLOSURES,
    billing: BILLING_FOUNDATION,
  };
}

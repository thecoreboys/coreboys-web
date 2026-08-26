import { isPlanId, type PlanId } from "./catalog";

export const LOCAL_OVERRIDE_ACKNOWLEDGEMENT = "LOCAL_ONLY_NO_BILLING";

export type LocalOverrideEnvironment = Readonly<Record<string, string | undefined>>;

export type LocalPlanOverrideResult =
  | { active: true; planId: PlanId; reason: "active" }
  | {
      active: false;
      planId: null;
      reason:
        | "disabled"
        | "not_development"
        | "deployment_runtime"
        | "non_loopback_request"
        | "non_loopback_database"
        | "acknowledgement_missing"
        | "target_missing"
        | "user_mismatch"
        | "invalid_plan";
    };

const DEPLOYMENT_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "CF_PAGES",
  "CF_PAGES_BRANCH",
  "WEBSITE_INSTANCE_ID",
  "RENDER",
  "RAILWAY_ENVIRONMENT",
  "FLY_APP_NAME",
] as const;

function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close >= 0 ? trimmed.slice(1, close) : trimmed;
  }
  return trimmed.replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isLoopbackHostname(value: string): boolean {
  const hostname = normalizeHostname(value);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLoopbackDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve a non-persistent development override.
 *
 * Every condition is mandatory. In particular, a local browser pointed at a
 * remote database is refused so a development flag cannot silently elevate a
 * shared or deployed account. The override never writes subscription state.
 */
export function resolveLocalPlanOverride(input: {
  env: LocalOverrideEnvironment;
  requestHostname: string;
  userId: string;
}): LocalPlanOverrideResult {
  const { env, requestHostname, userId } = input;
  if (env.SUBSCRIPTION_DEV_OVERRIDE_ENABLED !== "true") {
    return { active: false, planId: null, reason: "disabled" };
  }
  if (env.NODE_ENV !== "development") {
    return { active: false, planId: null, reason: "not_development" };
  }
  if (DEPLOYMENT_MARKERS.some((key) => Boolean(env[key]))) {
    return { active: false, planId: null, reason: "deployment_runtime" };
  }
  if (!isLoopbackHostname(requestHostname)) {
    return { active: false, planId: null, reason: "non_loopback_request" };
  }
  if (!isLoopbackDatabaseUrl(env.DATABASE_URL)) {
    return { active: false, planId: null, reason: "non_loopback_database" };
  }
  if (env.SUBSCRIPTION_DEV_OVERRIDE_ACK !== LOCAL_OVERRIDE_ACKNOWLEDGEMENT) {
    return { active: false, planId: null, reason: "acknowledgement_missing" };
  }
  const target = env.SUBSCRIPTION_DEV_OVERRIDE_USER_ID?.trim();
  if (!target || target === "*") {
    return { active: false, planId: null, reason: "target_missing" };
  }
  if (target !== userId) {
    return { active: false, planId: null, reason: "user_mismatch" };
  }
  const planId = env.SUBSCRIPTION_DEV_OVERRIDE_PLAN;
  if (!isPlanId(planId)) {
    return { active: false, planId: null, reason: "invalid_plan" };
  }
  return { active: true, planId, reason: "active" };
}

import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import type {
  MediaAnalysisEligibility,
  MediaAnalysisMode,
  MediaRightsStatus,
  MediaSourcePolicy,
} from "./types";

type PolicyOverride = Partial<Pick<
  MediaSourcePolicy,
  "rights" | "requestedMode" | "mediaAccessAllowed" | "retentionDays" | "reason"
>> & { version?: string };

const DEEP_RIGHTS = new Set<MediaRightsStatus>(["owned", "licensed"]);
const DEFAULT_RETENTION_DAYS = 30;

function boundedRetention(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.trunc(parsed))) : DEFAULT_RETENTION_DAYS;
}

function sourceKey(item: WatchItem): string {
  const owner = item.accountLabel?.trim() || item.memberSlug || item.memberLabel || "unknown";
  return `${item.platform}:${owner.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function defaultPolicy(platform: WatchPlatform): Omit<MediaSourcePolicy, "key"> {
  if (platform === "house") {
    return {
      platform,
      rights: "owned",
      requestedMode: "deep",
      mediaAccessAllowed: true,
      retentionDays: 90,
      version: "default-v1",
      reason: "First-party CORE media may be deeply analyzed when a stable source artifact is available.",
    };
  }
  return {
    platform,
    rights: "public-metadata",
    requestedMode: "metadata-only",
    mediaAccessAllowed: false,
    retentionDays: DEFAULT_RETENTION_DAYS,
    version: "default-v1",
    reason: "Provider media is indexed from public metadata only unless an operator records owned or licensed rights.",
  };
}

export function parseSourcePolicyOverrides(raw: string | undefined): Record<string, PolicyOverride> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const output: Record<string, PolicyOverride> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const rights = (["owned", "licensed", "public-metadata", "restricted", "unknown"] as const)
        .find((candidate) => candidate === row.rights);
      const requestedMode = (["deep", "metadata-only", "skip"] as const)
        .find((candidate) => candidate === row.requestedMode);
      output[key.toLowerCase()] = {
        rights,
        requestedMode,
        mediaAccessAllowed: typeof row.mediaAccessAllowed === "boolean" ? row.mediaAccessAllowed : undefined,
        retentionDays: row.retentionDays === undefined ? undefined : boundedRetention(row.retentionDays),
        reason: typeof row.reason === "string" ? row.reason.slice(0, 500) : undefined,
        version: typeof row.version === "string" ? row.version.slice(0, 80) : undefined,
      };
    }
    return output;
  } catch {
    return {};
  }
}

export function sourcePolicyFor(
  item: WatchItem,
  overrides: Record<string, PolicyOverride> = parseSourcePolicyOverrides(
    process.env.MEDIA_INTELLIGENCE_SOURCE_POLICIES_JSON,
  ),
): MediaSourcePolicy {
  const key = sourceKey(item);
  const defaults = defaultPolicy(item.platform);
  const override = overrides[key] ?? overrides[item.platform] ?? {};
  return {
    key,
    platform: item.platform,
    rights: override.rights ?? defaults.rights,
    requestedMode: override.requestedMode ?? defaults.requestedMode,
    mediaAccessAllowed: override.mediaAccessAllowed ?? defaults.mediaAccessAllowed,
    retentionDays: boundedRetention(override.retentionDays ?? defaults.retentionDays),
    version: override.version ?? defaults.version,
    reason: override.reason ?? defaults.reason,
  };
}

function hasStableDeepMediaInput(item: WatchItem): boolean {
  if (item.platform === "house") return Boolean(item.mediaUrl || item.sourceUrl);
  // A provider embed/permalink is not permission to download or copy media.
  // Non-house sources require an operator-authorized direct artifact.
  return Boolean(item.mediaUrl);
}

export function analysisEligibilityFor(
  item: WatchItem,
  policy = sourcePolicyFor(item),
): MediaAnalysisEligibility {
  const reasons: string[] = [policy.reason];
  if (policy.requestedMode === "skip" || policy.rights === "restricted") {
    reasons.push("The source policy prohibits analysis.");
    return { mode: "skip", deepMediaAllowed: false, policy, reasons };
  }
  if (item.kind === "live" || item.format === "live") {
    reasons.push("Live media is metadata-only; deep analysis waits for a stable replay artifact.");
    return { mode: "metadata-only", deepMediaAllowed: false, policy, reasons };
  }
  const rightsAllowDeep = DEEP_RIGHTS.has(policy.rights);
  const stableInput = hasStableDeepMediaInput(item);
  const deepMediaAllowed = policy.requestedMode === "deep"
    && rightsAllowDeep
    && policy.mediaAccessAllowed
    && stableInput;
  if (!deepMediaAllowed) {
    if (!rightsAllowDeep) reasons.push("Owned or licensed rights have not been recorded.");
    if (!policy.mediaAccessAllowed) reasons.push("Binary media access is disabled for this source.");
    if (!stableInput) reasons.push("No stable authorized media artifact is available.");
  }
  return {
    mode: deepMediaAllowed ? "deep" : "metadata-only",
    deepMediaAllowed,
    policy,
    reasons,
  };
}

export function policyModeLabel(mode: MediaAnalysisMode): string {
  if (mode === "deep") return "Deep media";
  if (mode === "metadata-only") return "Metadata only";
  return "Skipped";
}

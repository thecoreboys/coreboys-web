import type { Playable } from "./playable";

/** Keep queue URLs comfortably below common proxy/request-line limits. */
export const WATCH_QUEUE_EXCLUDE_LIMIT = 80;

/** The dedicated Shorts refill never needs the full Watch catalog at once. */
export const SHORT_FORM_QUEUE_DEFAULT_LIMIT = 32;
export const SHORT_FORM_QUEUE_MAX_LIMIT = 48;
export const SHORT_FORM_QUEUE_EXCLUDE_MAX = 5_000;
export const SHORT_FORM_QUEUE_FILTER = "short-form-playable";

export type WatchQueueResponseOptions = {
  excluded: Set<string>;
  shortFormOnly: boolean;
  responseLimit: number | null;
};

function boundedShortFormLimit(raw: string | null): number {
  if (!raw) return SHORT_FORM_QUEUE_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return SHORT_FORM_QUEUE_DEFAULT_LIMIT;
  return Math.min(SHORT_FORM_QUEUE_MAX_LIMIT, parsed);
}

/**
 * Parse response-shaping controls independently from recommendation hints.
 * In particular, `format=short` remains a similarity signal; only the
 * explicit `filter=short-form-playable` opt-in changes which items are sent.
 */
export function watchQueueResponseOptions(
  params: URLSearchParams,
  body?: { filter?: unknown; limit?: unknown; exclude?: unknown } | null,
): WatchQueueResponseOptions {
  const shortFormOnly = params.get("filter") === SHORT_FORM_QUEUE_FILTER
    || body?.filter === SHORT_FORM_QUEUE_FILTER;
  const rawLimit = params.get("limit") ?? (typeof body?.limit === "number" ? String(body.limit) : null);
  const rawExclude = Array.isArray(body?.exclude)
    ? body.exclude
    : (params.get("exclude") ?? "").split(",");
  const maxExcluded = Array.isArray(body?.exclude)
    ? SHORT_FORM_QUEUE_EXCLUDE_MAX
    : WATCH_QUEUE_EXCLUDE_LIMIT;
  const excluded = new Set(rawExclude
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .slice(0, maxExcluded));
  return {
    excluded,
    shortFormOnly,
    responseLimit: shortFormOnly ? boundedShortFormLimit(rawLimit) : null,
  };
}

/** Match the three provider types supported by the dedicated Shorts player. */
export function isShortFormQueuePlayable(
  item: Pick<Playable, "format" | "kind" | "platform">,
): boolean {
  if (item.format !== "short" || item.kind === "live" || item.kind === "post") return false;
  return item.platform === "youtube" || item.platform === "tiktok" || item.platform === "instagram";
}

import type { Playable } from "./playable";

/** Keep queue URLs comfortably below common proxy/request-line limits. */
export const WATCH_QUEUE_EXCLUDE_LIMIT = 80;

/** The dedicated Shorts refill never needs the full Watch catalog at once. */
export const SHORT_FORM_QUEUE_DEFAULT_LIMIT = 32;
export const SHORT_FORM_QUEUE_MAX_LIMIT = 48;
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
export function watchQueueResponseOptions(params: URLSearchParams): WatchQueueResponseOptions {
  const shortFormOnly = params.get("filter") === SHORT_FORM_QUEUE_FILTER;
  const excluded = new Set(
    (params.get("exclude") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, WATCH_QUEUE_EXCLUDE_LIMIT),
  );
  return {
    excluded,
    shortFormOnly,
    responseLimit: shortFormOnly ? boundedShortFormLimit(params.get("limit")) : null,
  };
}

/** Match the three provider types supported by the dedicated Shorts player. */
export function isShortFormQueuePlayable(
  item: Pick<Playable, "format" | "kind" | "platform">,
): boolean {
  if (item.format !== "short" || item.kind === "live" || item.kind === "post") return false;
  return item.platform === "youtube" || item.platform === "tiktok" || item.platform === "instagram";
}

import type { WatchItem } from "./watch/types";

/** Stable reference used for deduplication, not a replacement for the source link. */
export function originalSourceKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? path.slice(1) : url.searchParams.get("v") || /^\/(?:shorts|embed)\/([\w-]+)$/.exec(path)?.[1];
      return id && /^[\w-]{6,}$/.test(id) ? `youtube:${id}` : null;
    }
    if (host === "tiktok.com" || host === "m.tiktok.com") {
      const id = /^\/@[^/]+\/(?:video|photo)\/(\+?\d+)$/.exec(path)?.[1];
      return id ? `tiktok:${id}` : null;
    }
    if (host === "instagram.com") {
      const id = /^\/(?:[^/]+\/)?(?:reels?|p|tv)\/([\w-]+)(?:\/embed)?$/.exec(path)?.[1];
      return id ? `instagram:${id}` : null;
    }
    if (host === "twitch.tv" || host === "clips.twitch.tv") return `twitch:${host}${path}`;
    return `${host}${path}`;
  } catch { return null; }
}

const RULES: Record<string, readonly RegExp[]> = {
  "core-x-vegas": [/\bvegas\b/],
  "core-rug": [/\brug\b/],
  "basketball-segments": [/\bbasketball\b/, /\b(?:3v3|1v1)\b.*\b(?:court|hoops)\b/],
  "hot-ones": [/\bhot ones\b/],
  "caretakers": [/\bcaretakers?\b/],
  "stable-99-kill-lead": [/\b99 kill(?:s| lead)?\b/],
  "jason-the-ween": [/\bisland survivor\b/],
  "nms-boxing": [/\bnms\b.*\bboxing\b/, /\bboxing\b.*\bnms\b/],
  "stable-los-jynxzi-chained": [/\bchained together\b/],
  "core-po-box-openings": [/\bp\s*o\s*box\b/, /\b(?:fan mail|mail unboxing)\b/],
};

export function originalMatchReason(slug: string, item: Pick<WatchItem, "title" | "kind" | "format">): string | null {
  if (item.kind === "live" || item.kind === "post" || item.format === "photo") return null;
  const title = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return RULES[slug]?.some((rule) => rule.test(title))
    ? `Catalog title match (rules-v1): “${item.title.slice(0, 200)}”. Review before publishing.`
    : null;
}

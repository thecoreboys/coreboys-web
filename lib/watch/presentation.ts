import type { WatchItem } from "./types";

/** Display-only cleanup. The source title and permalink remain on the item. */
export function readableTitle(value: string, fallback = "Untitled post"): string {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  let title = value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
  title = title.replace(/https?:\/\/\S+/gi, "")
    .replace(/(?:^|\s)![a-z][\w-]*/gi, " ")
    .replace(/\[(?:twitter|insta|instagram|socials)[^\]]*\]/gi, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D]+/gu, " · ")
    .replace(/(?:\s+#[\p{L}\p{N}_]+)+\s*$/gu, "")
    .replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D|•·]+|[\s\p{Extended_Pictographic}\uFE0F\u200D|•·]+$/gu, "")
    .replace(/(?:\s*[·|•]\s*)+/g, " · ")
    .replace(/!{2,}/g, "!")
    .replace(/\s+/g, " ").trim();
  const letters = title.replace(/[^a-z]/gi, "");
  if (letters.length > 10 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.9) {
    title = title.toLowerCase().replace(/\b(core|irl|q&a|nba|nfl|gta|nyc|la|uk|usa|pov|asmr|cod|nms)\b/gi, (word) => word.toUpperCase());
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title || fallback;
}

/** Compact headings retain the full source title in the surrounding details. */
export function compactTitle(value: string, maxLength = 100): string {
  const title = readableTitle(value);
  if (title.length <= maxLength) return title;
  const cut = title.slice(0, maxLength - 1).replace(/\s+\S*$/, "").replace(/[\s·|]+$/, "");
  return `${cut || title.slice(0, maxLength - 1)}…`;
}

/** Keep complete opening topics in the mobile hero; its disclosure holds the full title. */
export function billboardHeadline(value: string, maxLength = 64): string {
  const title = readableTitle(value);
  if (title.length <= maxLength) return title;
  const topics = title.split(" · ");
  let headline = topics[0] ?? title;
  for (const topic of topics.slice(1)) {
    if (`${headline} · ${topic}`.length > maxLength) break;
    headline += ` · ${topic}`;
  }
  return compactTitle(headline, maxLength);
}

export function watchTitle(item: Pick<WatchItem, "title" | "memberLabel" | "format" | "kind">): string {
  return readableTitle(item.title, `${item.memberLabel || "Creator"} · ${item.format === "photo" ? "Photo" : item.kind === "post" ? "Post" : "Video"}`);
}

export function watchFormatLabel(item: Pick<WatchItem, "kind" | "format" | "platform" | "live"> & { title?: string }): string {
  if (item.kind === "live") return "Live";
  const carousel = item.platform === "instagram" ? /·\s*(\d+)\/(\d+)$/.exec(item.title ?? "") : null;
  if (carousel) return `Carousel · ${carousel[1]} of ${carousel[2]}`;
  if (item.format === "photo") return "Photo";
  if (item.kind === "post") return "Post";
  if (item.format === "short") return item.platform === "instagram" ? "Reel" : item.platform === "tiktok" ? "TikTok" : "Short";
  if (item.kind === "vod" || item.format === "live") return "Replay";
  return "Video";
}

export function isRecentItem(item: Pick<WatchItem, "publishedAt">, now = Date.now()): boolean {
  const age = now - Date.parse(item.publishedAt ?? "");
  return Number.isFinite(age) && age >= 0 && age < 48 * 60 * 60 * 1000;
}

/** Only merge long, identical short captions by the same creator near the same time. */
export function groupCrossposts(items: readonly WatchItem[]): WatchItem[] {
  const groups = new Map<string, WatchItem[]>();
  const result: WatchItem[] = [];
  for (const item of items) {
    const caption = readableTitle(item.title).toLowerCase()
      .replace(/\((?:twitch|ttv)[^)]*\)|\bttv\s*[:/|-]+\s*\S+/gi, "")
      .replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, "")
      .replace(/[^\p{L}\p{N}]/gu, "");
    const time = Date.parse(item.publishedAt ?? "");
    const eligible = item.format === "short" && item.memberSlug && caption.length >= 14 && Number.isFinite(time);
    const key = `${item.memberSlug}:${caption}`;
    const candidates = eligible ? groups.get(key) ?? [] : [];
    const match = candidates.find((other) => other.platform !== item.platform
      && Math.abs(time - Date.parse(other.publishedAt ?? "")) <= 24 * 60 * 60 * 1000
      && (!item.durationSeconds || !other.durationSeconds || Math.abs(item.durationSeconds - other.durationSeconds) <= 5));
    if (match) {
      const href = item.sourceUrl || item.href;
      if (!match.alternateSources?.some((source) => source.href === href)) {
        match.alternateSources = [...(match.alternateSources ?? []), { platform: item.platform, href }];
      }
    } else {
      const copy = { ...item, alternateSources: item.alternateSources ? [...item.alternateSources] : undefined };
      result.push(copy);
      if (eligible) groups.set(key, [...candidates, copy]);
    }
  }
  return result;
}

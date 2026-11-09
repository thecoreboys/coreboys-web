import type { WatchItem } from "./types";

/** Keep a post's original casing and emoji; replace only transport URLs. */
export function xPosterContent(item: Pick<WatchItem, "x" | "title" | "memberLabel" | "sourceUrl" | "href" | "publishedAt">) {
  const source = item.x?.statusUrl || item.sourceUrl || item.href;
  let handle = item.x?.authorHandle?.replace(/^@/, "") || "";
  if (!handle) {
    try {
      const url = new URL(source);
      if (["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(url.hostname)) {
        handle = /^\/([a-z0-9_]{1,15})\/status\//i.exec(url.pathname)?.[1] || "";
      }
    } catch { /* A missing handle doesn't make the post unreadable. */ }
  }
  const entities = item.x?.noteEntities?.urls || item.x?.entities?.urls || [];
  const text = (item.x?.noteText || item.title).replace(/https?:\/\/t\.co\/[^\s]+/gi, (token) => {
    const entity = entities.find((entry) => entry.url === token);
    const expanded = entity?.display_url || entity?.displayUrl || entity?.expanded_url || entity?.expandedUrl;
    return expanded && !/^https?:\/\/t\.co\//i.test(expanded) ? expanded.replace(/^https?:\/\//, "") : "";
  }).trim();
  const date = item.publishedAt ? new Date(item.publishedAt) : null;
  return {
    name: item.x?.authorName || item.memberLabel || handle || "Creator",
    handle,
    text: text || "Shared a post on X",
    avatar: item.x?.authorAvatarUrl,
    date: date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)
      : null,
  };
}

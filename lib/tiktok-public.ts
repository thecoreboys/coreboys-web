/**
 * Best-effort parser for TikTok's public profile document. This intentionally
 * has no credentials, cookies, or browser-session dependency: it only turns
 * post data already present in a public profile response into canonical post
 * ids that the official TikTok player can embed.
 *
 * TikTok can return an anti-bot or client-rendered shell. In that case this
 * parser returns no posts rather than guessing ids or fabricating content.
 */

export type PublicTikTokPost = {
  id: string;
  title: string;
  createdAt: number;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function videoId(value: unknown): string | null {
  const raw = typeof value === "number" ? String(value) : string(value);
  return raw && /^\d{12,24}$/.test(raw) ? raw : null;
}

function unixSeconds(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(string(value));
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  const seconds = numberValue > 10_000_000_000 ? Math.floor(numberValue / 1000) : Math.floor(numberValue);
  // Avoid accepting unrelated numeric ids as dates.
  return seconds > 1_400_000_000 && seconds < 4_200_000_000 ? seconds : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const found = string(value);
    if (found) return found;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function postFromRecord(value: JsonRecord, expectedHandle: string): PublicTikTokPost | null {
  const video = record(value.video) ?? record(value.videoInfo) ?? record(value.videoMeta);
  const id = videoId(value.id) ?? videoId(value.aweme_id) ?? videoId(value.awemeId) ?? videoId(value.itemId);
  const createdAt = unixSeconds(value.createTime) ?? unixSeconds(value.create_time) ?? unixSeconds(value.createdAt);
  // Requiring a video payload and timestamp keeps generic page config objects
  // out of the media feed.
  if (!video || !id || !createdAt) return null;

  const author = record(value.author) ?? record(value.authorInfo) ?? record(value.authorInfoV2);
  const authorHandle = firstString(author?.uniqueId, author?.unique_id, author?.secUidName)?.replace(/^@/, "").toLowerCase();
  if (authorHandle && authorHandle !== expectedHandle) return null;

  return {
    id,
    title: firstString(value.desc, value.description, value.title) ?? "TikTok video",
    createdAt,
    thumbnailUrl: firstString(
      video.cover,
      video.coverUrl,
      video.originCover,
      video.dynamicCover,
      value.cover,
      value.coverUrl,
    ),
    width: firstNumber(video.width, value.width),
    height: firstNumber(video.height, value.height),
  };
}

function jsonScripts(html: string): unknown[] {
  const parsed: unknown[] = [];
  const script = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = script.exec(html))) {
    try {
      parsed.push(JSON.parse(match[1] ?? ""));
    } catch {
      // Non-data JSON scripts are not useful for a profile feed.
    }
  }
  return parsed;
}

/** Extract recent, attributable public posts from a TikTok profile response. */
export function extractPublicTikTokPosts(html: string, handle: string, limit = 24): PublicTikTokPost[] {
  const expectedHandle = handle.replace(/^@+/, "").trim().toLowerCase();
  if (!expectedHandle || !html) return [];

  const posts = new Map<string, PublicTikTokPost>();
  const visit = (value: unknown, remaining: { nodes: number }) => {
    if (remaining.nodes-- <= 0 || posts.size >= limit) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, remaining);
      return;
    }
    const object = record(value);
    if (!object) return;
    const post = postFromRecord(object, expectedHandle);
    if (post && !posts.has(post.id)) posts.set(post.id, post);
    for (const child of Object.values(object)) visit(child, remaining);
  };

  // TikTok's public hydration schema changes frequently, so walk only parsed
  // application JSON and impose a strict node budget for predictable work.
  for (const root of jsonScripts(html)) visit(root, { nodes: 12_000 });
  return [...posts.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

import type { PatreonLockedItem } from "./types";

const API_ORIGIN = "https://www.patreon.com";
const API_PATH = "/api/posts";
const CAMPAIGN_ID = "15944831";
const POST_FIELDS = [
  "title",
  "published_at",
  "patreon_url",
  "post_type",
  "thumbnail",
  "current_user_can_view",
  "upgrade_url",
] as const;

type JsonObject = Record<string, unknown>;

export type PublicPatreonApiPage = {
  posts: PatreonLockedItem[];
  nextUrl: string | null;
};

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 180) : null;
}

function validDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function safePublicPatreonHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, API_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "patreon.com" && host !== "www.patreon.com")) return null;
    if (!/^\/(?:[A-Za-z0-9_-]+\/)?posts\//.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function safePublicPatreonThumbnail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const patreonCdn = host === "patreonusercontent.com" || host.endsWith(".patreonusercontent.com");
    if (url.protocol !== "https:" || (!patreonCdn && host !== "image.mux.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function findThumbnail(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") return safePublicPatreonThumbnail(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const thumbnail = findThumbnail(entry, depth + 1);
      if (thumbnail) return thumbnail;
    }
    return null;
  }
  const object = objectValue(value);
  if (!object) return null;
  const preferred = Object.entries(object).filter(([key]) => /thumbnail|default_large|original|url/i.test(key));
  const remaining = Object.entries(object).filter(([key]) => !/thumbnail|default_large|original|url/i.test(key));
  for (const [, entry] of [...preferred, ...remaining]) {
    const thumbnail = findThumbnail(entry, depth + 1);
    if (thumbnail) return thumbnail;
  }
  return null;
}

export function buildPublicPatreonApiUrl(cursor?: string | null): string {
  const url = new URL(API_PATH, API_ORIGIN);
  url.searchParams.set("filter[campaign_id]", CAMPAIGN_ID);
  url.searchParams.set("filter[contains_exclusive_posts]", "true");
  url.searchParams.set("filter[is_draft]", "false");
  url.searchParams.set("filter[include_lives]", "true");
  url.searchParams.set("filter[include_drops]", "true");
  url.searchParams.set("filter[media_types]", "video");
  url.searchParams.set("fields[post]", POST_FIELDS.join(","));
  url.searchParams.set("page[count]", "100");
  if (cursor) url.searchParams.set("page[cursor]", cursor);
  url.searchParams.set("sort", "-published_at");
  url.searchParams.set("json-api-use-default-includes", "false");
  url.searchParams.set("json-api-version", "1.0");
  return url.toString();
}

function cursorFromSameHostNextUrl(value: unknown, currentUrl: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const current = new URL(currentUrl);
    const next = new URL(value, current);
    if (next.protocol !== "https:" || next.hostname !== current.hostname || next.pathname !== API_PATH) return null;
    return paginationCursor(next.searchParams.get("page[cursor]"));
  } catch {
    return null;
  }
}

function paginationCursor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cursor = value.trim();
  if (!cursor || cursor.length > 2_000 || /[\u0000-\u001f\u007f]/.test(cursor)) return null;
  return cursor;
}

function nextPageUrl(root: JsonObject, currentUrl: string): string | null {
  const links = objectValue(root.links);
  const linkedCursor = cursorFromSameHostNextUrl(links?.next, currentUrl);
  if (linkedCursor) return buildPublicPatreonApiUrl(linkedCursor);

  const meta = objectValue(root.meta);
  const pagination = objectValue(meta?.pagination);
  const cursors = objectValue(pagination?.cursors);
  const cursor = paginationCursor(cursors?.next);
  return cursor ? buildPublicPatreonApiUrl(cursor) : null;
}

/** Strict JSON:API projection: only public teaser metadata leaves this module. */
export function parsePublicPatreonApiPage(
  value: unknown,
  currentUrl = buildPublicPatreonApiUrl(),
): PublicPatreonApiPage | null {
  const root = objectValue(value);
  if (!root || !Array.isArray(root.data)) return null;

  const posts: PatreonLockedItem[] = [];
  const seen = new Set<string>();
  for (const candidate of root.data) {
    const resource = objectValue(candidate);
    const attributes = objectValue(resource?.attributes);
    if (!resource || resource.type !== "post" || typeof resource.id !== "string" || !/^\d+$/.test(resource.id) || !attributes) continue;
    if (attributes.current_user_can_view !== false) continue;
    const postType = typeof attributes.post_type === "string" ? attributes.post_type.toLowerCase() : "";
    if (!postType.includes("video")) continue;

    const title = cleanTitle(attributes.title);
    const href = safePublicPatreonHref(attributes.patreon_url);
    if (!title || !href || seen.has(href)) continue;
    seen.add(href);
    posts.push({
      id: `patreon-${resource.id}`,
      title,
      href,
      thumbnailUrl: findThumbnail(attributes.thumbnail),
      publishedAt: validDate(attributes.published_at),
      label: "Exclusive video",
      kind: "post",
      locked: true,
    });
  }

  return { posts, nextUrl: nextPageUrl(root, currentUrl) };
}

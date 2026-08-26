import "server-only";

import type { PatreonLockedItem, PatreonShelfData } from "./types";
import { selectPublicPatreonVideoPosts } from "./patreon-policy";
import { buildPublicPatreonApiUrl, parsePublicPatreonApiPage } from "./patreon-api";

const CAMPAIGN_HREF = "https://www.patreon.com/cw/CORE";
const MAX_PUBLIC_RESPONSE_BYTES = 2_500_000;
const PUBLIC_FETCH_TIMEOUT_MS = 6_000;
const MAX_PUBLIC_API_PAGE_BYTES = 750_000;
const MAX_PUBLIC_API_TOTAL_BYTES = 2_000_000;
const MAX_PUBLIC_API_PAGES = 4;
const MAX_PUBLIC_API_ITEMS = 100;

type JsonObject = Record<string, unknown>;

type PublicPatreonData = {
  posts: PatreonLockedItem[];
  artwork: string[];
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
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function patreonHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, CAMPAIGN_HREF);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "www.patreon.com" && url.hostname !== "patreon.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function thumbnailHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    const patreonCdn = url.hostname === "patreonusercontent.com" || url.hostname.endsWith(".patreonusercontent.com");
    if (url.protocol !== "https:" || (!patreonCdn && url.hostname !== "image.mux.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function findThumbnail(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") return thumbnailHref(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = findThumbnail(entry, depth + 1);
      if (result) return result;
    }
    return null;
  }
  const object = objectValue(value);
  if (!object) return null;

  const preferred = Object.entries(object).filter(([key]) => /thumbnail|poster|cover|image/i.test(key));
  const remaining = Object.entries(object).filter(([key]) => !/thumbnail|poster|cover|image/i.test(key));
  for (const [, entry] of [...preferred, ...remaining]) {
    const result = findThumbnail(entry, depth + 1);
    if (result) return result;
  }
  return null;
}

function decodeFlightPayload(html: string): string {
  const chunks: string[] = [];
  const pattern = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    try {
      chunks.push(JSON.parse(match[1]!) as string);
    } catch {
      // Ignore unrelated or malformed framework chunks.
    }
  }
  return chunks.join("\n");
}

function decodeJsonString(value: string): string | null {
  try {
    return cleanTitle(JSON.parse(`"${value}"`));
  } catch {
    return cleanTitle(value);
  }
}

export function parsePublicPatreonPage(html: string): PublicPatreonData {
  const payload = decodeFlightPayload(html);
  if (!payload) return { posts: [], artwork: [] };

  const artwork = [
    payload.match(/"coverPhoto":\{"display":\{"url":"([^"]+)"/)?.[1],
    payload.match(/"avatarPhotoImageUrls":\{[\s\S]*?"defaultLarge":"([^"]+)"/)?.[1],
  ].map(thumbnailHref).filter((url): url is string => Boolean(url));

  const posts: PatreonLockedItem[] = [];
  const seenPostHrefs = new Set<string>();
  const postPattern = /"publishedAt":"([^"]+)","patreonUrl":"([^"]+)","upgradeUrl":(?:null|"[^"]*"),"postType":"([^"]+)","thumbnail":(\{[\s\S]*?\}|null),"contentTeaserText":[\s\S]*?,"title":"((?:\\.|[^"])*)"/g;
  for (const match of payload.matchAll(postPattern)) {
    const index = match.index ?? 0;
    const accessWindow = payload.slice(Math.max(0, index - 18_000), index);
    if (!accessWindow.includes('"currentUserCanView":false')) continue;

    const postType = match[3]?.toLowerCase() ?? "";
    if (!postType.includes("video")) continue;

    const title = decodeJsonString(match[5]!);
    const href = patreonHref(match[2]);
    if (!title || !href || seenPostHrefs.has(href)) continue;

    let thumbnail: string | null = null;
    if (match[4] !== "null") {
      try {
        thumbnail = findThumbnail(JSON.parse(match[4]!));
      } catch {
        thumbnail = null;
      }
    }

    posts.push({
      id: `patreon-${new URL(href).pathname.split("/").filter(Boolean).at(-1) ?? posts.length}`,
      title,
      href,
      thumbnailUrl: thumbnail ?? artwork[0] ?? null,
      publishedAt: validDate(match[1]),
      label: "Exclusive video",
      kind: "post",
      locked: true,
    });
    seenPostHrefs.add(href);
  }

  return { posts, artwork };
}

async function fetchPublicPatreonApi(): Promise<PatreonLockedItem[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_FETCH_TIMEOUT_MS);
  const posts: PatreonLockedItem[] = [];
  const visited = new Set<string>();
  let nextUrl: string | null = buildPublicPatreonApiUrl();
  let totalBytes = 0;
  let pages = 0;

  try {
    while (nextUrl && pages < MAX_PUBLIC_API_PAGES && posts.length < MAX_PUBLIC_API_ITEMS) {
      if (visited.has(nextUrl)) return null;
      visited.add(nextUrl);
      const response = await fetch(nextUrl, {
        headers: {
          accept: "application/vnd.api+json",
          "user-agent": "Mozilla/5.0 (compatible; COREWatch/1.0; +https://thecoreboys.com)",
        },
        next: { revalidate: 900 },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PUBLIC_API_PAGE_BYTES) return null;
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).byteLength;
      totalBytes += bytes;
      if (bytes > MAX_PUBLIC_API_PAGE_BYTES || totalBytes > MAX_PUBLIC_API_TOTAL_BYTES) return null;

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return null;
      }
      const page = parsePublicPatreonApiPage(json, nextUrl);
      if (!page) return null;
      posts.push(...page.posts.slice(0, MAX_PUBLIC_API_ITEMS - posts.length));
      nextUrl = page.nextUrl;
      pages += 1;
    }
    if (nextUrl && posts.length < MAX_PUBLIC_API_ITEMS) return null;
    return posts;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicPatreonFlight(): Promise<PublicPatreonData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(CAMPAIGN_HREF, {
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; COREWatch/1.0; +https://thecoreboys.com)",
      },
      next: { revalidate: 900 },
      signal: controller.signal,
    });
    if (!response.ok) return { posts: [], artwork: [] };
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PUBLIC_RESPONSE_BYTES) {
      return { posts: [], artwork: [] };
    }
    const html = await response.text();
    if (html.length > MAX_PUBLIC_RESPONSE_BYTES) return { posts: [], artwork: [] };
    return parsePublicPatreonPage(html);
  } catch {
    return { posts: [], artwork: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPatreonShelfData(): Promise<PatreonShelfData> {
  const apiPosts = await fetchPublicPatreonApi();
  const publicData = !apiPosts?.length
    ? await fetchPublicPatreonFlight()
    : { posts: apiPosts, artwork: [] };
  // Only the strict public teaser projection reaches the browser. Protected
  // post content, media URLs, upgrade data, and creator credentials are never
  // requested or serialized here.
  const posts = [...publicData.posts]
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""));
  const items = selectPublicPatreonVideoPosts(posts);

  return {
    campaignName: "CORE",
    campaignHref: CAMPAIGN_HREF,
    items,
    source: items.length ? "public" : "fallback",
    generatedAt: new Date().toISOString(),
  };
}

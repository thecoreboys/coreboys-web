import { X_COMMUNITY_KEYS, type XCommunityKey } from "./types";

const POST_ID = /^\d{5,25}$/;
const COMMUNITY_ID = /^\d{5,25}$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function isXCommunityKey(value: string): value is XCommunityKey {
  return (X_COMMUNITY_KEYS as readonly string[]).includes(value);
}

export function parseXPostReference(value: string): {
  postId: string;
  authorHandle: string;
  url: string;
} | null {
  const trimmed = value.trim();
  if (POST_ID.test(trimmed)) {
    return { postId: trimmed, authorHandle: "i", url: `https://x.com/i/status/${trimmed}` };
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === "status");
    const authorHandle = index > 0 ? parts[index - 1] ?? "" : "";
    const postId = index >= 0 ? parts[index + 1] ?? "" : "";
    if (!HANDLE.test(authorHandle) || !POST_ID.test(postId)) return null;
    return {
      postId,
      authorHandle,
      url: `https://x.com/${authorHandle}/status/${postId}`,
    };
  } catch {
    return null;
  }
}

export function parseXCommunityReference(value: unknown): {
  communityId: string;
  communityUrl: string;
} | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (COMMUNITY_ID.test(trimmed)) {
    return { communityId: trimmed, communityUrl: `https://x.com/i/communities/${trimmed}` };
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) return null;
    const match = /^\/i\/communities\/(\d{5,25})\/?$/i.exec(url.pathname);
    if (!match?.[1]) return null;
    return {
      communityId: match[1],
      communityUrl: `https://x.com/i/communities/${match[1]}`,
    };
  } catch {
    return null;
  }
}

export type XCommunityEnvironmentEntry = {
  id?: unknown;
  url?: unknown;
  description?: unknown;
  featuredPostIds?: unknown;
};

export type ParsedXCommunityEnvironment = Partial<
  Record<XCommunityKey, {
    communityId: string;
    communityUrl: string;
    description: string | null;
    featuredPostIds: string[];
  }>
>;

/** Strictly parse operator configuration; invalid or unknown rows are omitted. */
export function parseXCommunitiesJson(raw: string | null | undefined): ParsedXCommunityEnvironment {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const output: ParsedXCommunityEnvironment = {};
  for (const [key, rawEntry] of Object.entries(parsed)) {
    if (!isXCommunityKey(key) || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as XCommunityEnvironmentEntry;
    const reference = parseXCommunityReference(entry.id) ?? parseXCommunityReference(entry.url);
    if (!reference) continue;
    const featuredPostIds = Array.isArray(entry.featuredPostIds)
      ? [...new Set(entry.featuredPostIds.flatMap((candidate) => {
          if (typeof candidate !== "string") return [];
          const reference = parseXPostReference(candidate);
          return reference ? [reference.postId] : [];
        }))].slice(0, 12)
      : [];
    output[key] = {
      ...reference,
      description: typeof entry.description === "string"
        ? entry.description.trim().slice(0, 240) || null
        : null,
      featuredPostIds,
    };
  }
  return output;
}

export function parseXFeaturedPostIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  let candidates: unknown[];
  try {
    const parsed = JSON.parse(raw);
    candidates = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    candidates = raw.split(",");
  }
  return [...new Set(candidates.flatMap((candidate) => {
    if (typeof candidate !== "string") return [];
    const reference = parseXPostReference(candidate);
    return reference ? [reference.postId] : [];
  }))].slice(0, 1);
}

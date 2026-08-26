/**
 * Client-safe normalization for creator-owned TikTok and Instagram sources.
 *
 * Source configuration accepts either a bare handle, an @handle, or an
 * official profile URL. Content URLs are deliberately rejected: a Reel or
 * TikTok permalink identifies one post, not the account whose OAuth grant
 * should be used for an entire channel rail.
 */

export type CreatorSocialProvider = "tiktok" | "instagram";

const INSTAGRAM_RESERVED_PATHS = new Set([
  "about",
  "accounts",
  "developer",
  "directory",
  "explore",
  "legal",
  "p",
  "privacy",
  "reel",
  "reels",
  "stories",
  "web",
]);

function parsedProfileUrl(raw: string): URL | null {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : /^(?:www\.|m\.)?(?:tiktok\.com|instagram\.com)\//i.test(raw)
      ? `https://${raw}`
      : null;
  if (!candidate) return null;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function validHandle(provider: CreatorSocialProvider, raw: string): string {
  const value = raw.trim().replace(/^@+/, "").toLowerCase();
  const max = provider === "instagram" ? 30 : 24;
  return value.length > 0 && value.length <= max && /^[a-z0-9._]+$/.test(value)
    ? value
    : "";
}

export function normalizeCreatorSocialHandle(
  provider: CreatorSocialProvider,
  raw: string | null | undefined,
): string {
  const value = raw?.trim() ?? "";
  if (!value) return "";

  const url = parsedProfileUrl(value);
  if (!url) return validHandle(provider, value);

  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  const expectedHost = provider === "tiktok" ? "tiktok.com" : "instagram.com";
  if (host !== expectedHost && !host.endsWith(`.${expectedHost}`)) return "";

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "";
  let first: string;
  try {
    first = decodeURIComponent(segments[0] ?? "");
  } catch {
    return "";
  }

  if (provider === "tiktok") {
    // TikTok profile paths always start with @handle. Reject video-only and
    // discovery routes so they cannot accidentally select another credential.
    if (!first.startsWith("@") || segments[1]?.toLowerCase() === "video") return "";
    return validHandle(provider, first);
  }

  if (INSTAGRAM_RESERVED_PATHS.has(first.toLowerCase())) return "";
  // A profile URL may have a trailing slash only. A deeper path is content.
  if (segments.length > 1) return "";
  return validHandle(provider, first);
}

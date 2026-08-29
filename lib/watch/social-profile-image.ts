/**
 * Client-safe validation helpers shared by profile-avatar fetchers and their
 * tests. The resolver only accepts provider-issued HTTPS URLs.
 */
export function safeProfileImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Some provider profile-image URLs are signed. Return their known expiry so
 * callers can refresh the cache before the browser reaches a dead image.
 * Unrecognised or unscheduled URLs intentionally have no expiry.
 */
export function profileImageUrlExpiry(value: unknown): number | null {
  const image = safeProfileImageUrl(value);
  if (!image) return null;
  const url = new URL(image);
  const unix = url.searchParams.get("x-expires");
  if (unix && /^\d{10,13}$/.test(unix)) {
    const numeric = Number(unix);
    const milliseconds = unix.length <= 10 ? numeric * 1_000 : numeric;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  // Instagram CDN URLs expose the expiry as a hexadecimal Unix timestamp.
  const hex = url.searchParams.get("oe");
  if (hex && /^[\da-f]{8,12}$/i.test(hex)) {
    const milliseconds = Number.parseInt(hex, 16) * 1_000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  return null;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizedHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function publicMetaContent(document: string, key: "og:image" | "twitter:image" | "og:title"): string | null {
  const escaped = key.replace(":", "\\:");
  const meta = new RegExp(
    `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  ).exec(document)
    ?? new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ).exec(document);
  return meta?.[1] ? decodeHtmlAttribute(meta[1]) : null;
}

function publicInstagramCdnUrl(value: unknown): string | null {
  const image = safeProfileImageUrl(value);
  if (!image) return null;
  const host = new URL(image).hostname.toLowerCase();
  return host === "cdninstagram.com" || host.endsWith(".cdninstagram.com")
    ? image
    : null;
}

function publicSnapchatCdnUrl(value: unknown): string | null {
  const image = safeProfileImageUrl(value);
  if (!image) return null;
  const host = new URL(image).hostname.toLowerCase();
  return host === "sc-cdn.net" || host.endsWith(".sc-cdn.net")
    ? image
    : null;
}

function htmlAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}=["']([^"']+)["']`, "i").exec(tag);
  return match?.[1] ? decodeHtmlAttribute(match[1]) : null;
}

/**
 * Extract a channel avatar from YouTube's public channel metadata. Only yt3
 * avatar CDNs are accepted, so video thumbnails, consent pages, and arbitrary
 * link-preview images cannot become a creator profile image.
 */
export function publicYouTubeChannelAvatarUrl(document: string): string | null {
  const image = safeProfileImageUrl(
    publicMetaContent(document, "og:image") ?? publicMetaContent(document, "twitter:image"),
  );
  if (!image) return null;
  const host = new URL(image).hostname.toLowerCase();
  return host === "yt3.ggpht.com" || host.endsWith(".googleusercontent.com")
    ? image
    : null;
}

/**
 * Extract an Instagram profile image from a public profile response. The
 * profile's public title must name the exact requested handle, and the image
 * must come from Instagram's own CDN. This allows a cold start without
 * borrowing a creator portrait or relying on a viewer session.
 */
export function publicInstagramProfileAvatarUrl(
  document: string,
  rawHandle: string,
): string | null {
  const handle = normalizedHandle(rawHandle);
  if (!handle || !document) return null;

  const title = publicMetaContent(document, "og:title")?.replaceAll("&#064;", "@");
  if (!title || !new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|\\))`, "i").test(title)) {
    return null;
  }

  const profilePicture = /["']profile_pic_url(?:_hd)?["']\s*:\s*["']([^"']+)["']/i.exec(document)?.[1];
  const decoded = profilePicture
    ?.replaceAll("\\u0026", "&")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&");
  return publicInstagramCdnUrl(decoded)
    ?? publicInstagramCdnUrl(publicMetaContent(document, "og:image"));
}

/**
 * Snapchat's public profile document contains one explicit Profile Picture
 * image. Accept it only from Snapchat's image CDN; a failed public response
 * simply leaves the UI on its recognizable Snapchat fallback mark.
 */
export function publicSnapchatProfileAvatarUrl(document: string): string | null {
  const imageTag = [...document.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => htmlAttribute(tag, "alt")?.toLowerCase() === "profile picture");
  if (!imageTag) return null;

  const src = htmlAttribute(imageTag, "src");
  if (src) return publicSnapchatCdnUrl(src);

  const srcSet = htmlAttribute(imageTag, "srcSet");
  const firstSource = srcSet?.split(/\s+/)[0]?.replace(/,$/, "");
  return publicSnapchatCdnUrl(firstSource);
}

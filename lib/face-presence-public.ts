export type PublicFaceBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PublicFaceSocialLink = {
  platform: string;
  label: string;
  url: string;
};

export type PublicFacePresenceTag = {
  trackId: string;
  identityId: string;
  displayName: string;
  profileHref: string;
  avatarUrl?: string;
  socialLinks: PublicFaceSocialLink[];
  bbox: PublicFaceBoundingBox | null;
  startMs: number;
  endMs: number | null;
  confidenceBand: "reviewed" | "high";
};

export type PublicFacePresenceResponse = {
  contentId: string;
  atMs: number | null;
  tags: PublicFacePresenceTag[];
};

const PUBLIC_PROFILE_PREFIXES = ["/m/", "/crew/"] as const;
const PUBLIC_AVATAR_PREFIXES = ["/members/", "/crew/", "/comms/"] as const;
const MAX_PUBLIC_TAGS = 12;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next && next.length <= max ? next : null;
}

function finite(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? value
    : null;
}

function safeProfileHref(value: unknown): string | null {
  const href = text(value, 240);
  if (!href || href.startsWith("//") || !PUBLIC_PROFILE_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    return null;
  }
  try {
    const parsed = new URL(href, "https://coreboys.invalid");
    if (
      parsed.origin !== "https://coreboys.invalid"
      || parsed.search
      || parsed.hash
      || !PUBLIC_PROFILE_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))
    ) {
      return null;
    }
    return parsed.pathname;
  } catch {
    return null;
  }
}

function safeAvatarUrl(value: unknown): string | undefined {
  const url = text(value, 1_024);
  if (!url) return undefined;
  if (
    url.startsWith("//")
    || !PUBLIC_AVATAR_PREFIXES.some((prefix) => url.startsWith(prefix))
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(url, "https://coreboys.invalid");
    if (
      parsed.origin !== "https://coreboys.invalid"
      || parsed.search
      || parsed.hash
      || !PUBLIC_AVATAR_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))
    ) {
      return undefined;
    }
    return parsed.pathname;
  } catch {
    return undefined;
  }
}

function socialLink(value: unknown): PublicFaceSocialLink | null {
  const input = record(value);
  if (!input) return null;
  const platform = text(input.platform, 32);
  const label = text(input.label, 80);
  const rawUrl = text(input.url, 1_024);
  if (!platform || !label || !rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    return { platform, label, url: url.toString() };
  } catch {
    return null;
  }
}

function boundingBox(value: unknown): PublicFaceBoundingBox | null {
  if (value == null) return null;
  const input = record(value);
  if (!input) return null;
  const x = finite(input.x);
  const y = finite(input.y);
  const width = finite(input.width);
  const height = finite(input.height);
  if (x == null || y == null || width == null || height == null) return null;
  if (x > 1 || y > 1 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
    return null;
  }
  return { x, y, width, height };
}

function tag(value: unknown): PublicFacePresenceTag | null {
  const input = record(value);
  if (!input) return null;
  const trackId = text(input.trackId, 100);
  const identityId = text(input.identityId, 100);
  const displayName = text(input.displayName, 120);
  const profileHref = safeProfileHref(input.profileHref);
  const startMs = finite(input.startMs);
  const endMs = input.endMs == null ? null : finite(input.endMs);
  const confidenceBand = input.confidenceBand === "reviewed" || input.confidenceBand === "high"
    ? input.confidenceBand
    : null;
  if (
    !trackId ||
    !identityId ||
    !displayName ||
    !profileHref ||
    startMs == null ||
    (input.endMs != null && endMs == null) ||
    (endMs != null && endMs < startMs) ||
    !confidenceBand
  ) {
    return null;
  }
  const links = Array.isArray(input.socialLinks)
    ? input.socialLinks.map(socialLink).filter((link): link is PublicFaceSocialLink => Boolean(link)).slice(0, 8)
    : [];
  return {
    trackId,
    identityId,
    displayName,
    profileHref,
    avatarUrl: safeAvatarUrl(input.avatarUrl),
    socialLinks: links,
    bbox: boundingBox(input.bbox),
    startMs,
    endMs,
    confidenceBand,
  };
}

/**
 * Strictly parse the only face-presence shape allowed to reach a public client.
 * Unknown keys (including embeddings, crop URLs, or raw similarity) are dropped.
 */
export function parsePublicFacePresenceResponse(value: unknown): PublicFacePresenceResponse | null {
  const input = record(value);
  if (!input) return null;
  const contentId = text(input.contentId, 300);
  const atMs = input.atMs == null ? null : finite(input.atMs);
  if (!contentId || (input.atMs != null && atMs == null) || !Array.isArray(input.tags)) return null;
  return {
    contentId,
    atMs,
    tags: input.tags.map(tag).filter((entry): entry is PublicFacePresenceTag => Boolean(entry)).slice(0, MAX_PUBLIC_TAGS),
  };
}

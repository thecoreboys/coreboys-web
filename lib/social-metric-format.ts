export type ProfileSocial = {
  platform: string;
  url: string;
  handle?: string | null;
  label?: string | null;
};

export const CREW_METRIC_PREFIX = "__crew__:";

export function crewMetricSlug(slug: string): string {
  return `${CREW_METRIC_PREFIX}${slug}`;
}

export function formatCompactSocialCount(count: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, Math.round(count)));
}

export function socialMetricUnit(platform: string): "subs" | "followers" {
  return platform === "youtube" ? "subs" : "followers";
}

export function socialHandle(social: ProfileSocial): string {
  const explicit = social.handle?.replace(/^@/, "").trim();
  if (explicit) return explicit;
  try {
    const segments = new URL(social.url).pathname.split("/").filter(Boolean);
    return (segments.at(-1) ?? "").replace(/^@/, "");
  } catch {
    return "";
  }
}

export function twitchLoginForSocial(social: ProfileSocial): string | null {
  if (social.platform !== "twitch") return null;
  const login = socialHandle(social).toLowerCase();
  return login || null;
}

/**
 * Snapshots historically keyed Twitch by bare login while other platforms
 * use their full URL. Read both identities so older rows remain a valid
 * fallback during an upstream outage.
 */
export function snapshotLookupKeys(social: ProfileSocial): string[] {
  const exact = `${social.platform}::${social.url}`;
  if (social.platform !== "twitch") return [exact];
  const login = twitchLoginForSocial(social);
  return login ? [exact, `twitch::${login}`] : [exact];
}

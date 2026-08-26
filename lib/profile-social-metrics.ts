import "server-only";
import { getLatestCountsForSlug } from "@/lib/metric-snapshots";
import {
  fetchSocialCountFromApi,
  type SocialFetchPlatform,
} from "@/lib/social-fetch";
import { fetchFollowerCount, fetchUsersByLogin } from "@/lib/twitch";
import {
  formatCompactSocialCount,
  snapshotLookupKeys,
  socialHandle,
  socialMetricUnit,
  twitchLoginForSocial,
  type ProfileSocial,
} from "@/lib/social-metric-format";

type ManualCounts = Partial<Record<string, number>>;

type ProfileSocialMetricOptions = {
  snapshotSlug: string;
  socials: readonly ProfileSocial[];
  manualCounts?: ManualCounts;
  /** Live counts already fetched by the page, keyed by the canonical URL. */
  twitchCountsByUrl?: ReadonlyMap<string, number>;
  /** Disable when the caller already attempted Helix and supplied its result. */
  fetchMissingTwitch?: boolean;
};

const SOCIAL_FETCH_PLATFORMS = new Set<SocialFetchPlatform>([
  "youtube",
  "tiktok",
  "instagram",
  "x",
]);

function usableCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

async function fetchTwitchCounts(
  socials: readonly ProfileSocial[],
): Promise<Map<string, number>> {
  const byLogin = new Map<string, ProfileSocial[]>();
  for (const social of socials) {
    const login = twitchLoginForSocial(social);
    if (!login) continue;
    byLogin.set(login, [...(byLogin.get(login) ?? []), social]);
  }
  if (!byLogin.size) return new Map();

  try {
    const users = await fetchUsersByLogin([...byLogin.keys()]);
    const entries = await Promise.all(
      [...byLogin.entries()].map(async ([login, profiles]) => {
        const user = users[login];
        if (!user) return [] as Array<[string, number]>;
        const count = await fetchFollowerCount(user.id);
        if (!usableCount(count)) return [] as Array<[string, number]>;
        return profiles.map((profile) => [profile.url, count] as [string, number]);
      }),
    );
    return new Map(entries.flat());
  } catch {
    return new Map();
  }
}

function snapshotCount(
  snapshots: ReadonlyMap<string, number>,
  social: ProfileSocial,
): number | null {
  for (const key of snapshotLookupKeys(social)) {
    const count = snapshots.get(key);
    if (usableCount(count)) return count;
  }
  return null;
}

/**
 * Resolve the metric shown beside each profile social. Priority is:
 * live Twitch Helix → latest successful DB snapshot → cached Social Fetch
 * API → explicit manual fallback. Missing data stays blank instead of being
 * presented as zero.
 */
export async function getProfileSocialMetrics({
  snapshotSlug,
  socials,
  manualCounts,
  twitchCountsByUrl = new Map(),
  fetchMissingTwitch = true,
}: ProfileSocialMetricOptions): Promise<Record<string, string>> {
  const snapshots = await getLatestCountsForSlug(snapshotSlug);
  const missingTwitch = socials.filter(
    (social) =>
      social.platform === "twitch" &&
      !usableCount(twitchCountsByUrl.get(social.url)),
  );
  const liveTwitch = fetchMissingTwitch
    ? await fetchTwitchCounts(missingTwitch)
    : new Map<string, number>();

  const metrics = await Promise.all(
    socials.map(async (social): Promise<[string, string] | null> => {
      let count = twitchCountsByUrl.get(social.url);
      if (!usableCount(count)) count = liveTwitch.get(social.url);
      if (!usableCount(count)) count = snapshotCount(snapshots, social) ?? undefined;

      if (!usableCount(count) && SOCIAL_FETCH_PLATFORMS.has(social.platform as SocialFetchPlatform)) {
        count = await fetchSocialCountFromApi(
          social.platform as SocialFetchPlatform,
          socialHandle(social),
          social.url,
        ) ?? undefined;
      }

      if (!usableCount(count)) {
        const manual = manualCounts?.[social.platform];
        if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
          count = manual;
        }
      }
      if (!usableCount(count)) return null;

      return [
        social.url,
        `${formatCompactSocialCount(count)} ${socialMetricUnit(social.platform)}`,
      ];
    }),
  );

  return Object.fromEntries(metrics.filter((entry): entry is [string, string] => entry !== null));
}

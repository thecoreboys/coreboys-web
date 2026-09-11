import type { ConnectionPublic } from "@/lib/oauth/connections";
import type { LoyaltyFact } from "@/lib/oauth/loyalty";
import type { OauthProvider } from "@/lib/oauth/providers";
import { allTargets } from "@/lib/oauth/roster";

export type PlatformFollowing = {
  provider: OauthProvider;
  checkedAt: string | null;
  detail: string;
  members: Array<{
    slug: string;
    label: string;
    status: "following" | "not_following" | "unknown" | "unsupported";
    subscribed: boolean | null;
  }>;
};

/** An absent, expired or failed provider observation is never an unfollow. */
export function buildPlatformFollowing(
  connections: ConnectionPublic[],
  facts: LoyaltyFact[],
  now = Date.now(),
): PlatformFollowing[] {
  return connections.map((connection) => {
    const { provider } = connection;
    const supported = provider === "twitch" || provider === "youtube" || provider === "x";
    const current = connection.status === "active" && Boolean(connection.lastSyncAt) && !connection.lastSyncError;
    const factValue = (slug: string, kind: string): boolean | null => {
      if (!current) return null;
      const fact = facts.find((entry) => entry.platform === provider && entry.subject === slug && entry.kind === kind);
      const age = fact ? now - Date.parse(fact.updatedAt) : Infinity;
      if (!fact || !Number.isFinite(age) || age < -60_000 || age > 24 * 60 * 60 * 1_000) return null;
      if (Date.parse(fact.updatedAt) < Date.parse(connection.connectedAt)) return null;
      return fact.value;
    };
    const targets = allTargets().filter((target) =>
      provider === "twitch" ? Boolean(target.twitchLogin)
        : provider === "youtube" ? Boolean(target.youtubeChannelIds.length || target.youtubeHandles.length)
          : provider === "x" ? Boolean(target.xHandle) : target.slug !== "house",
    );
    return {
      provider,
      checkedAt: connection.lastSyncAt,
      detail: !supported
        ? "This platform does not share your following status with connected apps."
        : !current
          ? "Sync or reconnect to check your current following status."
          : provider === "youtube"
            ? "YouTube subscriptions checked with your connected account."
            : "Following checked with your connected account. Sync to refresh.",
      members: targets.map((target) => {
        const followed = factValue(target.slug, provider === "youtube" ? "sub" : "follow");
        return {
          slug: target.slug,
          label: target.label,
          status: !supported ? "unsupported" : followed === null ? "unknown" : followed ? "following" : "not_following",
          subscribed: provider === "twitch" || provider === "youtube" ? factValue(target.slug, "sub") : null,
        };
      }),
    };
  });
}

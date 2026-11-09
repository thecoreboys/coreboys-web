import "server-only";
import { fetchUsersByLogin } from "@/lib/twitch";
import { verifiedCreatorAvatar, type CreatorProfile } from "./model";

const DAY_MS = 86_400_000;
export function creatorAvatarSource(creator: CreatorProfile, now = Date.now()) {
  if (!creator.active) return null;
  const source = creator.socials.find((social) => social.platform === "twitch") ?? creator.socials.find((social) => social.platform === "kick");
  if (!source) return null;
  // Curated image overrides remain authoritative. Local roster portraits can
  // be refreshed to their official profile images; provider images refresh daily.
  if (creator.avatarUrl && !creator.avatarUrl.startsWith("/") && !creator.avatarSourceProfile) return null;
  const age = now - Date.parse(creator.avatarCheckedAt ?? "");
  if (creator.avatarSourceProfile === source.url && age >= 0 && age < DAY_MS) return null;
  return { creator, source, login: new URL(source.url).pathname.replace(/\/$/, "").slice(1).toLowerCase() };
}

/** Scheduled profile metadata lookup only. No viewer frames or identity inference. */
export async function fetchCreatorAvatarUpdates(creators: readonly CreatorProfile[], limit = 50, now = Date.now()) {
  const pending = creators.map((creator) => creatorAvatarSource(creator, now)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => (Date.parse(a.creator.avatarCheckedAt ?? "") || 0) - (Date.parse(b.creator.avatarCheckedAt ?? "") || 0))
    .slice(0, Math.max(0, Math.min(50, Math.trunc(limit))));
  const twitch = pending.filter((entry) => entry.source.platform === "twitch");
  const users: Awaited<ReturnType<typeof fetchUsersByLogin>> = twitch.length ? await fetchUsersByLogin(twitch.map((entry) => entry.login)).catch(() => ({})) : {};
  const updates: Array<{ previous: CreatorProfile; profile: CreatorProfile }> = [];
  const save = (entry: (typeof pending)[number], avatar: unknown) => {
    const profile = { ...entry.creator, avatarSourceProfile: entry.source.url, avatarCheckedAt: new Date(now).toISOString() };
    if (typeof avatar === "string" && verifiedCreatorAvatar(avatar)) profile.avatarUrl = avatar;
    // Record unsuccessful attempts too, so one missing profile cannot starve
    // later directory entries or cause a new request every maintenance run.
    updates.push({ previous: entry.creator, profile });
  };
  for (const entry of twitch) {
    const user = users[entry.login];
    save(entry, user?.login.toLowerCase() === entry.login ? user.profile_image_url : undefined);
  }
  // Bound public Kick lookups as well as the overall batch. A blocked provider
  // retains the previous verified picture; it never substitutes a banner.
  const kick = pending.filter((entry) => entry.source.platform === "kick").slice(0, 5);
  await Promise.all(kick.map(async (entry) => {
    let avatar: unknown;
    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(entry.login)}`, {
        next: { revalidate: 3600 }, redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return;
      const value = await response.json() as { slug?: string; user?: { username?: string; profile_pic?: string } };
      if (value.slug?.toLowerCase() !== entry.login || value.user?.username?.toLowerCase() !== entry.login) return;
      avatar = value.user.profile_pic;
    } catch { /* Provider failure cannot affect video playback or discard known images. */ }
    finally { save(entry, avatar); }
  }));
  return updates;
}

import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin, fetchFollowerCount } from "@/lib/twitch";
import { MembersGridClient, type MemberCardData } from "@/components/sections/MembersGridClient";

/**
 * Interactive members grid. Server fetches Twitch profile pictures +
 * follower counts in parallel and hands a typed payload to the client
 * grid, which handles the motion + hover affordances.
 */
export async function MembersGrid() {
  let avatars: Record<string, string> = {};
  const followerByLogin: Record<string, number> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
    // Fan out in parallel — already cached via Helix revalidate.
    const counts = await Promise.all(
      MEMBERS.map(async (m) => {
        const u = users[m.twitchLogin.toLowerCase()];
        if (!u) return null;
        const f = await fetchFollowerCount(u.id);
        return { login: m.twitchLogin.toLowerCase(), followers: f };
      }),
    );
    for (const c of counts) {
      if (c?.followers != null) followerByLogin[c.login] = c.followers;
    }
  } catch {
    avatars = {};
  }

  const cards: MemberCardData[] = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    realName: m.realName,
    accent: m.accent,
    index: m.index,
    avatarUrl: m.portrait ?? avatars[m.twitchLogin.toLowerCase()],
    commName: m.comm.name,
    commLogo: m.comm.logo,
    twitchFollowers: followerByLogin[m.twitchLogin.toLowerCase()] ?? null,
  }));

  return <MembersGridClient cards={cards} />;
}

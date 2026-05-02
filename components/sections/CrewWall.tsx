import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { getCrewPortrait } from "@/lib/asset-index";
import { fetchUsersByLogin } from "@/lib/twitch";
import { CrewWallClient, type CrewWallItem } from "@/components/sections/CrewWallClient";

const ROLE_COPY: Record<string, string> = {
  cameraman: "Cameraman",
  management: "Management",
  editor: "Editor",
  producer: "Producer",
};

/**
 * Server-side data shaper for the crew wall — looks up portraits +
 * works-with member accents, then hands off to the client component
 * that owns hover states.
 */
export async function CrewWall() {
  const order = (role: string) =>
    role === "cameraman" ? 0 : role === "management" ? 1 : 2;
  const sorted = [...CREW].sort(
    (a, b) => order(a.role) - order(b.role) || a.slug.localeCompare(b.slug),
  );

  // Twitch profile pictures for the linked-member mention chips.
  let avatars: Record<string, string> = {};
  try {
    const allMembers = sorted
      .flatMap((c) => c.worksWith)
      .map((s) => MEMBERS_BY_SLUG[s]?.twitchLogin)
      .filter((x): x is string => !!x);
    const users = await fetchUsersByLogin(Array.from(new Set(allMembers)));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const items: CrewWallItem[] = sorted.map((c) => {
    const works = c.worksWith
      .map((slug) => MEMBERS_BY_SLUG[slug])
      .filter((m): m is NonNullable<typeof m> => !!m);
    const accent = works[0]?.accent ?? "#a1a1aa";
    return {
      slug: c.slug,
      name: c.name,
      roleLabel: ROLE_COPY[c.role] ?? c.role,
      portrait: getCrewPortrait(c.slug) ?? null,
      accent,
      works: works.map((m) => ({
        slug: m.slug,
        stageName: m.stageName,
        accent: m.accent,
        avatarUrl: avatars[m.twitchLogin.toLowerCase()] ?? m.portrait,
      })),
    };
  });

  return <CrewWallClient items={items} />;
}

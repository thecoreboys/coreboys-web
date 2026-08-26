import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { getPublicClips } from "@/lib/clips-server";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClipsPageClient, type MemberLite } from "@/components/clips/ClipsPageClient";
import { ClipsHeader } from "@/components/clips/ClipsHeader";

export const metadata: Metadata = {
  title: "Clips",
  description: "Viral clips, recaps, and moments across Twitch, YouTube, TikTok, and Instagram.",
  alternates: { canonical: "/clips" },
};

export const revalidate = 600;

export default async function ClipsPage() {
  let clips: Awaited<ReturnType<typeof getPublicClips>> = [];
  try {
    clips = await getPublicClips();
  } catch {
    clips = [];
  }

  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const memberLites: MemberLite[] = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    accent: m.accent,
    avatarUrl: avatars[m.twitchLogin.toLowerCase()],
  }));

  return (
    <>
      <ClipsHeader total={clips.length} members={memberLites} />

      <section>
        <div className="mx-auto max-w-container px-6 py-10 md:px-16 md:py-14">
          <ClipsPageClient clips={clips} members={memberLites} />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

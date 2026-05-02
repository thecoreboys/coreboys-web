import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SEED_CLIPS } from "@/lib/clips";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClipsPageClient, type MemberLite } from "@/components/clips/ClipsPageClient";
import { ClipsHeader } from "@/components/clips/ClipsHeader";

export const metadata: Metadata = {
  title: "Clips — The Core Boys",
  description: "Viral clips, recaps, and moments across Twitch, YouTube, TikTok, and Instagram.",
  alternates: { canonical: "/clips" },
};

export const revalidate = 600;

export default async function ClipsPage() {
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
    <main className="relative pt-20 md:pt-24">
      <ClipsHeader total={SEED_CLIPS.length} members={memberLites} />

      <section className="border-t border-[color:var(--rule)]">
        <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <ClipsPageClient clips={SEED_CLIPS} members={memberLites} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

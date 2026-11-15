import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { getPublicClips } from "@/lib/clips-server";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClipsPageClient, type MemberLite } from "@/components/clips/ClipsPageClient";
import { ClipsHeader } from "@/components/clips/ClipsHeader";
import { CampaignSection } from "@/components/campaigns/CampaignSection";

export const metadata: Metadata = {
  title: "Clips",
  description: "Viral clips, recaps, and moments across Twitch, YouTube, TikTok, and Instagram.",
  alternates: { canonical: "/clips" },
};

export const revalidate = 600;

export default async function ClipsPage() {
  let failed = false;
  let clips: Awaited<ReturnType<typeof getPublicClips>> = [];
  try {
    clips = await getPublicClips();
  } catch {
    failed = true;
    clips = [];
  }

  const memberLites: MemberLite[] = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    accent: m.accent,
    avatarUrl: m.portrait,
  }));

  return (
    <>
      <ClipsHeader total={clips.length} members={memberLites} />

      <CampaignSection placement="clips" />

      <section>
        <div className="mx-auto max-w-container px-6 py-10 md:px-16 md:py-14">
          {failed ? <div role="alert" className="py-10"><h2 className="text-xl font-semibold">Clips could not be loaded</h2><p className="mt-3 text-secondary">The feed is temporarily unavailable.</p><a href="/clips" className="mt-4 inline-flex min-h-11 items-center underline">Try again</a></div> : <ClipsPageClient clips={clips} members={memberLites} />}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

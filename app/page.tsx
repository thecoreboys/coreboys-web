import { HeroCorporate } from "@/components/sections/HeroCorporate";
import { AnnouncementsRail } from "@/components/sections/AnnouncementsRail";
import { MembersGrid } from "@/components/sections/MembersGrid";
import { HouseTourParallax } from "@/components/sections/HouseTourParallax";
import { FeaturedContent } from "@/components/sections/FeaturedContent";
import { CrewWall } from "@/components/sections/CrewWall";
import { SiteFooter } from "@/components/chrome/SiteFooter";

// Render at request time, not at build time. The hero pulls follower /
// subscriber counts via SOCIAL_FETCH_API_KEY + TWITCH_CLIENT_* — those
// envs are RUN_TIME-scoped on DO, so a build-time prerender ships with
// every counter `null` and the chips disappear. The 6h fetch cache
// inside fetchSocialCount still applies, so this doesn't add API load
// — it just defers the work to when the secrets exist.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <HeroCorporate />
      <AnnouncementsRail />
      <MembersGrid />
      <HouseTourParallax />
      {/* No Suspense wrapper — the page is `dynamic = "force-dynamic"`,
          so this section renders inline. Wrapping in <Suspense fallback=
          {null}> caused the section to render as nothing on slower
          devices (mobile) when the YouTube RSS fetch took longer than
          the surrounding stream. */}
      <FeaturedContent />
      <CrewWall />
      <SiteFooter />
    </>
  );
}

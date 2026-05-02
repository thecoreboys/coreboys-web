import { Suspense } from "react";
import { HeroCorporate } from "@/components/sections/HeroCorporate";
import { AnnouncementsRail } from "@/components/sections/AnnouncementsRail";
import { MembersGrid } from "@/components/sections/MembersGrid";
import { HouseTourParallax } from "@/components/sections/HouseTourParallax";
import { FeaturedContent } from "@/components/sections/FeaturedContent";
import { CrewWall } from "@/components/sections/CrewWall";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export default function HomePage() {
  return (
    <>
      <HeroCorporate />
      <AnnouncementsRail />
      <MembersGrid />
      <HouseTourParallax />
      <Suspense fallback={null}>
        <FeaturedContent />
      </Suspense>
      <CrewWall />
      <SiteFooter />
    </>
  );
}

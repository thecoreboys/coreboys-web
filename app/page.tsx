import { Suspense } from "react";
import { HeroCore } from "@/components/sections/HeroCore";
import { Manifesto } from "@/components/sections/Manifesto";
import { Roster } from "@/components/sections/Roster";
import { LiveNow } from "@/components/sections/LiveNow";
import { HouseReveal } from "@/components/sections/HouseReveal";
import { Crew } from "@/components/sections/Crew";
import { Footer } from "@/components/sections/Footer";

export default function HomePage() {
  return (
    <main>
      <HeroCore />
      <Manifesto />
      <Suspense fallback={null}>
        <Roster />
      </Suspense>
      <LiveNow />
      <HouseReveal />
      <Suspense fallback={null}>
        <Crew />
      </Suspense>
      <Footer />
    </main>
  );
}

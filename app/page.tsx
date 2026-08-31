import type { Metadata } from "next";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { getPatreonShelfData } from "@/lib/watch/patreon";
import { getCoreOriginalSnapshot } from "@/lib/core-originals";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { WatchHome } from "@/components/watch/WatchHome";
import "./watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CORE | The Core Boys",
  description:
    "Watch CORE live: the home of The Core Boys and CORE Crew creators, with Twitch streams, new videos, Shorts, Reels, and shows in one place.",
  keywords: ["CORE", "The Core Boys", "CORE Crew", "CoreCrew", "FaZe creators", "live streams"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "CORE | The Core Boys",
    description:
      "Live streams, videos, Shorts, Reels, and shows from the CORE creator network.",
    url: "/",
    type: "website",
  },
};

export default async function HomePage() {
  const [catalog, patreon, originals] = await Promise.all([
    getWatchCatalog(),
    getPatreonShelfData(),
    getCoreOriginalSnapshot().catch(() => ({ originals: [], items: [] })),
  ]);

  return (
    <WatchChrome catalog={catalog}>
      <WatchHome catalog={catalog} patreon={patreon} originals={originals.originals} />
    </WatchChrome>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { getPatreonShelfData } from "@/lib/watch/patreon";
import { getCoreOriginalSnapshot } from "@/lib/core-originals";
import { WatchHomeEntry } from "@/components/watch/WatchHomeEntry";
import { EventsSeriesChallengesRail } from "@/components/watch/WatchHome";
import { PatreonLockedShelf } from "@/components/watch/PatreonLockedShelf";
import { compactWatchCatalog } from "@/lib/watch/catalog-cache";
import { projectHomeCatalog } from "@/lib/watch/home-catalog";
import { getPublicXFeedSnapshot } from "@/lib/x-feed-snapshot";
import { buildLiveXFeedResponse } from "@/lib/watch/live-x-feed";
import "./watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CORE | The Core Boys",
  description:
    "An independent fan site for The Core Boys, bringing together live streams, videos, Shorts, Reels, and shows.",
  keywords: ["CORE", "The Core Boys", "CORE Crew", "CoreCrew", "FaZe creators", "live streams"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "CORE | The Core Boys",
    description:
      "An independent fan site for The Core Boys, with live streams, videos, Shorts, and shows.",
    url: "/",
    type: "website",
  },
};

async function OriginalsSection() {
  const snapshot = await getCoreOriginalSnapshot().catch(() => ({ originals: [], items: [] }));
  return <EventsSeriesChallengesRail originals={snapshot.originals} />;
}

async function PatreonSection() {
  const data = await getPatreonShelfData().catch(() => null);
  return data ? <PatreonLockedShelf data={data} /> : <p className="px-5 text-sm text-secondary">Patreon previews are temporarily unavailable.</p>;
}

export default async function HomePage() {
  // Stream the richer post data separately so a slow X snapshot cannot delay the hero.
  const initialXFeed = getPublicXFeedSnapshot().then(buildLiveXFeedResponse).catch(() => null);
  const catalog = await getHomeWatchCatalog();

  return (
    <WatchHomeEntry catalog={compactWatchCatalog(projectHomeCatalog(catalog))}
      initialXFeed={initialXFeed}
      patreon={<Suspense key="patreon" fallback={<p role="status" className="px-5 text-sm text-secondary">Loading Patreon previews…</p>}><PatreonSection /></Suspense>}
      originals={<Suspense key="originals" fallback={<div className="min-h-56 px-5" role="status">Loading CORE Originals…</div>}><OriginalsSection /></Suspense>}
    />
  );
}

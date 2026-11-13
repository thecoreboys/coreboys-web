import { withPageMetadata } from "@/lib/seo";
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
import { StreamerAwardsWinner } from "@/components/campaigns/StreamerAwardsWinner";
import { STREAMER_AWARDS_WINNER_ENDS_AT_MS } from "@/lib/streamer-awards";
import { isBillboardFeatureActive } from "@/lib/watch/billboard-features";
import "./watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = withPageMetadata("/", {
  title: { absolute: "The Core Boys | Live Streams, Clips & Videos" },
  description: "Watch live streams, videos, clips, and shows from StableRonaldo, JasonTheWeen, Lacy, Marlon, Silky, and Adapt on the independent CORE fan site.",
  keywords: ["The Core Boys", "CORE", "live streams", "videos", "stream highlights"],
  alternates: { canonical: "/" },
  openGraph: { type: "website" },
});

async function OriginalsSection() {
  const snapshot = await getCoreOriginalSnapshot().catch(() => ({ originals: [], items: [] }));
  return <EventsSeriesChallengesRail originals={snapshot.originals} />;
}

async function PatreonSection() {
  const data = await getPatreonShelfData().catch(() => null);
  return data ? <PatreonLockedShelf data={data} /> : <p className="px-5 text-sm text-secondary">Patreon previews are temporarily unavailable.</p>;
}

export default async function HomePage() {
  const catalog = await getHomeWatchCatalog();

  return (
    <WatchHomeEntry catalog={compactWatchCatalog(projectHomeCatalog(catalog))}
      awards={isBillboardFeatureActive(STREAMER_AWARDS_WINNER_ENDS_AT_MS, Date.now()) ? <StreamerAwardsWinner /> : undefined}
      patreon={<Suspense key="patreon" fallback={<p role="status" className="px-5 text-sm text-secondary">Loading Patreon previews…</p>}><PatreonSection /></Suspense>}
      originals={<Suspense key="originals" fallback={<div className="min-h-56 px-5" role="status">Loading CORE Originals…</div>}><OriginalsSection /></Suspense>}
    />
  );
}

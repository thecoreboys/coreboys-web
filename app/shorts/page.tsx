import type { Metadata } from "next";
import "../watch/watch.css";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { ShortsStage } from "@/components/watch/ShortsStage";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { selectShortFormRailItems } from "@/lib/watch/short-form";

export const dynamic = "force-dynamic";

// The player requests another batch before the last few queued Shorts, so a
// smaller first payload keeps the initial route responsive without shortening
// a viewer's session.
const INITIAL_SHORTS_BATCH = 48;

export const metadata: Metadata = {
  title: "CORE Shorts",
  description: "Shorts, Reels, and TikToks from across the CORE house.",
  alternates: { canonical: "/shorts" },
};

export default async function ShortsPage() {
  const catalog = await getWatchCatalog();
  // The queue endpoint replenishes this creator-balanced batch as the viewer
  // approaches its end. Only the first portion needs to cross the RSC boundary.
  const items = selectShortFormRailItems(catalog.all, INITIAL_SHORTS_BATCH);

  return (
    <WatchChrome catalog={catalog}>
      <ShortsStage items={items} />
    </WatchChrome>
  );
}

import type { Metadata } from "next";
import "../watch/watch.css";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { ShortsStage } from "@/components/watch/ShortsStage";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { selectShortFormRailItems } from "@/lib/watch/short-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CORE Shorts",
  description: "Shorts, Reels, and TikToks from across the CORE house.",
  alternates: { canonical: "/shorts" },
};

export default async function ShortsPage() {
  const catalog = await getWatchCatalog();
  // Keep a large but bounded, creator-balanced session available to the
  // player. The next five compatible embeds are warmed off-screen.
  const items = selectShortFormRailItems(catalog.all, 96);

  return (
    <WatchChrome catalog={catalog}>
      <ShortsStage items={items} />
    </WatchChrome>
  );
}

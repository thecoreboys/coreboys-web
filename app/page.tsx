import type { Metadata } from "next";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { getPatreonShelfData } from "@/lib/watch/patreon";
import { getCoreOriginalSnapshot } from "@/lib/core-originals";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { WatchHome } from "@/components/watch/WatchHome";
import "./watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch",
  description: "The CORE screening house — live, uploads, and the six networks in one room.",
  alternates: { canonical: "/" },
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

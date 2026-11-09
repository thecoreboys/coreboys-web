import type { Metadata } from "next";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { TimelineArchive } from "@/components/watch/TimelineArchive";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import "../watch/watch.css";

export const metadata: Metadata = {
  title: "Timeline",
  description: "Recent CORE videos, photos, and posts by creator and publication date.",
  alternates: { canonical: "/timeline" },
};
export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const catalog = await getWatchCatalog();
  const now = Date.now();
  const items = catalog.all.filter((item) => item.kind !== "live" && item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!)).slice(0, 240);
  return (
    <WatchChrome catalog={catalog}>
      <div className="core-archive-page">
        <PageHeader eyebrow="From the house" title="Timeline" supporting="Recent videos, photos, and posts from CORE and the creators, in publication order." />
        <div className="core-archive-body mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
          <TimelineArchive items={items} />
        </div>
      </div>
    </WatchChrome>
  );
}

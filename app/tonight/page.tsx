import type { Metadata } from "next";
import "../watch/watch.css";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { TonightPage } from "@/components/watch/TonightPage";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { buildNetworkLineup, resolveNetworkChannel } from "@/lib/watch/channels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tonight on CORE",
  description: "Live rooms, scheduled starts, reminders, and the continuous CORE house rotation.",
  alternates: { canonical: "/tonight" },
};

export default async function TonightRoute() {
  const catalog = await getHomeWatchCatalog();
  const coreChannel = resolveNetworkChannel("core");
  if (!coreChannel) return null;
  const lineup = buildNetworkLineup(catalog, coreChannel, "live");
  return (
    <WatchChrome catalog={catalog}>
      <TonightPage coreChannel={coreChannel} lineup={lineup} serverNow={new Date().toISOString()} />
    </WatchChrome>
  );
}

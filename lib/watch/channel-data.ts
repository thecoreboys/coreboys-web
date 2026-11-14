import "server-only";
import { unstable_cache } from "next/cache";
import { loadLatestTwitchTrackerChannels } from "@/lib/twitchtracker-snapshots";
import { loadAirtimeDailyArchive } from "./airtime-archive";

// Channels and Guide share these public history snapshots. Keep the live
// catalog on its separate, much shorter freshness policy.
export const loadCachedChannelTracker = unstable_cache(
  loadLatestTwitchTrackerChannels,
  ["channel-latest-twitchtracker-v1"],
  { revalidate: 300 },
);

export const loadCachedChannelAirtime = unstable_cache(
  (memberSlug: string | null) => loadAirtimeDailyArchive({ memberSlug }),
  ["channel-airtime-daily-v1"],
  { revalidate: 240 },
);

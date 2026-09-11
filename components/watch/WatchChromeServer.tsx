import "server-only";
import type { ReactNode } from "react";
import type { WatchCatalog } from "@/lib/watch/types";
import { watchChromeSnapshot } from "@/lib/watch/chrome-snapshot";
import { WatchChrome as WatchChromeClient } from "./WatchChrome";

/** Page-specific components retain their data; shared controls receive a small snapshot. */
export function WatchChrome({ catalog, children }: { catalog: WatchCatalog; children: ReactNode }) {
  return <WatchChromeClient snapshot={watchChromeSnapshot(catalog)}>{children}</WatchChromeClient>;
}

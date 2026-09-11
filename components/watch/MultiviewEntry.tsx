"use client";

import { useMemo } from "react";
import { expandWatchCatalog, type CompactWatchCatalog } from "@/lib/watch/catalog-cache";
import type { MultiviewLiveRoom } from "@/lib/watch/multiview-access";
import { MultiPlayerStage } from "./MultiPlayerStage";

export function MultiviewEntry({ catalog: compact, initialLiveRoom, autoFillLive = Boolean(initialLiveRoom), liveRoom = false }: {
  catalog: CompactWatchCatalog;
  initialLiveRoom?: MultiviewLiveRoom;
  autoFillLive?: boolean;
  liveRoom?: boolean;
}) {
  const catalog = useMemo(() => expandWatchCatalog(compact), [compact]);
  return <MultiPlayerStage catalog={catalog} initialLiveRoom={initialLiveRoom} autoFillLive={autoFillLive} liveRoom={liveRoom} />;
}

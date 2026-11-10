"use client";

import { useMemo } from "react";
import { unpackWatchItemLists, type WatchItemPayload } from "@/lib/watch/item-payload";
import { unpackGuidePayload, type CompactGuidePayload } from "@/lib/watch/guide-transport";
import { GuideGrid } from "./GuideGrid";

export type GuideGridPayloadProps = {
  snapshot: CompactGuidePayload;
  live: WatchItemPayload;
};

export function GuideGridPayload({ snapshot, live }: GuideGridPayloadProps) {
  const initialGuide = useMemo(() => unpackGuidePayload(snapshot), [snapshot]);
  const lists = useMemo(() => unpackWatchItemLists(live), [live]);
  return <GuideGrid serverNow={initialGuide.serverNow} initialLive={lists.live!} networks={initialGuide.networks ?? []} initialGuide={initialGuide} />;
}

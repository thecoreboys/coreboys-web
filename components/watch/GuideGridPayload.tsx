"use client";

import { useMemo } from "react";
import type { GuideNetworkGroup, GuideNetworkRow } from "@/lib/watch/channels";
import { unpackWatchItemLists, type WatchItemPayload } from "@/lib/watch/item-payload";
import { GuideGrid } from "./GuideGrid";

export type GuideGridPayloadProps = {
  serverNow: string;
  networks: Array<Omit<GuideNetworkGroup, "rows"> & { rows: Omit<GuideNetworkRow, "items">[] }>;
  payload: WatchItemPayload;
};

export function GuideGridPayload({ serverNow, networks, payload }: GuideGridPayloadProps) {
  const lists = useMemo(() => unpackWatchItemLists(payload), [payload]);
  const groups = useMemo(() => networks.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, items: lists[row.id]! })),
  })), [networks, lists]);
  return <GuideGrid serverNow={serverNow} initialLive={lists.live!} networks={groups} />;
}

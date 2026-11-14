"use client";

import { useMemo, type ComponentProps } from "react";
import { unpackWatchItemLists, type WatchItemPayload } from "@/lib/watch/item-payload";
import type { NetworkChannelHub } from "@/lib/watch/channels";
import { NetworkChannelPage } from "./NetworkChannelPage";

export type NetworkChannelPayloadProps = Omit<ComponentProps<typeof NetworkChannelPage>, "items" | "continuousItems" | "hub"> & {
  payload: WatchItemPayload;
};

export function NetworkChannelPagePayload({ payload, ...props }: NetworkChannelPayloadProps) {
  const lists = useMemo(() => unpackWatchItemLists(payload), [payload]);
  const hub = useMemo(() => Object.fromEntries(
    Object.entries(lists).filter(([name]) => name.startsWith("hub:")).map(([name, items]) => [name.slice(4), items]),
  ) as NetworkChannelHub, [lists]);
  return <NetworkChannelPage {...props} items={lists.items!} continuousItems={lists.continuous!} hub={hub} />;
}

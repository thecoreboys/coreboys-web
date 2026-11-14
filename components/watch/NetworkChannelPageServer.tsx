import "server-only";
import type { ComponentProps } from "react";
import { packWatchItemLists } from "@/lib/watch/item-payload";
import type { NetworkChannelPage as ChannelPage } from "./NetworkChannelPage";
import { NetworkChannelPagePayload } from "./NetworkChannelPagePayload";

export type { ChannelCrewMember } from "./NetworkChannelPage";

export function NetworkChannelPage({ items, continuousItems, hub, ...props }: ComponentProps<typeof ChannelPage>) {
  const payload = packWatchItemLists({
    items,
    continuous: continuousItems,
    ...Object.fromEntries(Object.entries(hub).map(([name, entries]) => [`hub:${name}`, entries])),
  });
  return <NetworkChannelPagePayload {...props} payload={payload} />;
}

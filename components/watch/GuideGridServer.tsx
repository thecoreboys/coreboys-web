import "server-only";
import type { ComponentProps } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { packWatchItemLists } from "@/lib/watch/item-payload";
import type { GuideGrid as Grid } from "./GuideGrid";
import { GuideGridPayload } from "./GuideGridPayload";

export function GuideGrid({ serverNow, initialLive, networks }: ComponentProps<typeof Grid>) {
  const lists: Record<string, WatchItem[]> = { live: initialLive };
  const groups = networks.map((group) => ({
    ...group,
    rows: group.rows.map(({ items, ...row }) => {
      lists[row.id] = items;
      return row;
    }),
  }));
  return <GuideGridPayload serverNow={serverNow} networks={groups} payload={packWatchItemLists(lists)} />;
}

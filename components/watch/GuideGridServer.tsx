import "server-only";
import type { ComponentProps } from "react";
import { packWatchItemLists } from "@/lib/watch/item-payload";
import type { GuideGrid as Grid } from "./GuideGrid";
import { GuideGridPayload } from "./GuideGridPayload";
import { guideProgramFromItem, projectGuideWindow } from "@/lib/watch/guide-window";
import { packGuidePayload } from "@/lib/watch/guide-transport";

export function GuideGrid({ serverNow, initialLive, networks }: ComponentProps<typeof Grid>) {
  const now = Date.parse(serverNow);
  const items = new Map(networks.flatMap((group) => group.rows.flatMap((row) => row.items)).map((item) => [`${item.platform}:${item.id}`, item]));
  const snapshot = projectGuideWindow({ serverNow, horizonEnd: new Date(now + 7 * 86_400_000).toISOString(), networks,
    programs: [...items.values()].flatMap((item) => { const program = guideProgramFromItem(item); return program ? [program] : []; }),
  }, now - 26 * 3_600_000, now + 18 * 3_600_000);
  return <GuideGridPayload snapshot={packGuidePayload(snapshot)} live={packWatchItemLists({ live: initialLive })} />;
}

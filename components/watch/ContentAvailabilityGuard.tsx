"use client";

import { useEffect } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useContentAvailability } from "@/hooks/useContentAvailability";
import { isContentUnavailable } from "@/lib/content-identity";
import type { Playable } from "@/lib/watch/playable";

const identity = (item: Playable) => ({
  id: item.key, platform: item.platform, sourceUrl: item.sourceUrl,
  url: item.url ?? undefined, twitch: item.vodId ? { vodId: item.vodId } : undefined,
  dvr: item.dvr,
});

/** Removes old saved player snapshots/queue entries when the source is removed. */
export function ContentAvailabilityGuard() {
  const player = usePlayer();
  const candidates = [...(player.current ? [player.current] : []),
    ...player.tiles.map((tile) => tile.item), ...player.queue];
  const unavailable = useContentAvailability(candidates.map(identity));
  useEffect(() => {
    if (!unavailable.size) return;
    const blocked = (item: Playable) => isContentUnavailable(identity(item), unavailable);
    for (const item of player.queue) if (blocked(item)) player.removeFromQueue(item.key);
    const blockedTiles = player.tiles.filter((tile) => blocked(tile.item));
    for (const tile of blockedTiles) player.removeTile(tile.id);
    for (const tile of player.tiles) {
      const vodId = tile.item.dvr?.twitchVodId;
      if (!blocked(tile.item) && vodId && isContentUnavailable({ provider: "twitch", providerId: `video:${vodId}` }, unavailable)) {
        const live = { ...tile.item };
        delete live.dvr;
        player.replaceTile(tile.id, live);
      }
    }
    if (player.current && blocked(player.current) && !player.tiles.some((tile) => tile.item.key === player.current?.key)) player.stop();
  }, [unavailable, player]);
  return null;
}

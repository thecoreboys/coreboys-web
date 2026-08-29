"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { itemToPlayable, type Playable } from "@/lib/watch/playable";
import {
  SHORT_FORM_QUEUE_DEFAULT_LIMIT,
  SHORT_FORM_QUEUE_FILTER,
  WATCH_QUEUE_EXCLUDE_LIMIT,
  isShortFormQueuePlayable,
} from "@/lib/watch/queue-response";
import type { WatchItem } from "@/lib/watch/types";

const SHORTS_CHANNEL = {
  id: "core-shorts",
  title: "CORE Shorts",
  subtitle: "Shorts, Reels, and TikToks from the house",
  href: "/shorts",
  artwork: "/brand/logo-core-white.png",
} as const;

/**
 * The dedicated, full-screen short-form destination. It uses one tuned
 * player channel so the player can keep its ordered warm-frame deck ahead of
 * the current Short instead of creating a fresh provider embed per scroll.
 */
export function ShortsStage({ items }: { items: WatchItem[] }) {
  const {
    channel,
    playChannel,
    ready,
    refill,
    dataSaver,
    qualityPreference,
    shortFormNavigation,
  } = usePlayer();
  const initializedRef = useRef(false);
  const initialPlayables = useMemo(
    () => items.map(itemToPlayable).filter((item): item is Playable => Boolean(item)),
    [items],
  );
  const [feedItems, setFeedItems] = useState<Playable[]>(initialPlayables);
  const feedRef = useRef<Playable[]>(initialPlayables);
  const loadingMoreRef = useRef(false);
  const exhaustedRef = useRef(false);

  useEffect(() => {
    // Keep the local feed in sync if the server catalog changes while this
    // route is mounted, without discarding items already fetched on scroll.
    if (!initialPlayables.length) return;
    const known = new Set(feedRef.current.map((item) => item.key));
    const additions = initialPlayables.filter((item) => !known.has(item.key));
    if (!additions.length) return;
    const next = [...feedRef.current, ...additions];
    feedRef.current = next;
    setFeedItems(next);
  }, [initialPlayables]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || exhaustedRef.current || feedRef.current.length === 0) return;
    loadingMoreRef.current = true;
    try {
      const exclude = feedRef.current
        .slice(-WATCH_QUEUE_EXCLUDE_LIMIT)
        .map((item) => item.key)
        .join(",");
      const params = new URLSearchParams({
        mode: "queue",
        // This remains a recommendation hint for compatibility with the
        // general queue endpoint; `filter` is the explicit response filter.
        format: "short",
        filter: SHORT_FORM_QUEUE_FILTER,
        limit: String(SHORT_FORM_QUEUE_DEFAULT_LIMIT),
        exclude,
      });
      const response = await fetch(`/api/watch/queue?${params}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Shorts queue request failed (${response.status})`);
      const payload = await response.json() as { items?: Playable[] };
      const known = new Set(feedRef.current.map((item) => item.key));
      const incoming = (payload.items ?? []).filter((item) => (
        isShortFormQueuePlayable(item) && !known.has(item.key)
      ));
      if (!incoming.length) {
        exhaustedRef.current = true;
        return;
      }
      const next = [...feedRef.current, ...incoming];
      feedRef.current = next;
      setFeedItems(next);
      if (channel?.id === SHORTS_CHANNEL.id) refill(next, { channelId: SHORTS_CHANNEL.id });
    } catch {
      // A transient queue failure should not interrupt the current Short;
      // the next near-end navigation can retry the request.
    } finally {
      loadingMoreRef.current = false;
    }
  }, [channel?.id, refill]);

  useEffect(() => {
    // Establish the provider connections before the off-screen short-form
    // deck mounts. This keeps the first scroll responsive while respecting
    // the viewer's explicit data-saver choice.
    if (dataSaver || qualityPreference === "data-saver" || typeof document === "undefined") return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const origins = [
      "https://www.youtube-nocookie.com",
      "https://www.tiktok.com",
      "https://www.instagram.com",
    ];
    const added: HTMLLinkElement[] = [];
    for (const href of origins) {
      const selector = `link[rel=\"preconnect\"][href=\"${href}\"]`;
      if (document.head.querySelector(selector)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      link.dataset.coreShortsWarmup = "true";
      document.head.appendChild(link);
      added.push(link);
    }
    return () => {
      for (const link of added) link.remove();
    };
  }, [dataSaver, qualityPreference]);

  useEffect(() => {
    const playables = feedItems;
    if (!ready || !playables.length) return;
    if (channel?.id === SHORTS_CHANNEL.id) {
      initializedRef.current = true;
      refill(playables, { channelId: SHORTS_CHANNEL.id });
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    playChannel(SHORTS_CHANNEL, playables, 0);
  }, [channel?.id, feedItems, playChannel, ready, refill]);

  useEffect(() => {
    if (channel?.id !== SHORTS_CHANNEL.id || !shortFormNavigation) return;
    // Stay ahead of the viewer: append the next batch before the final few
    // items enter the preload deck, keeping continuous scroll seamless.
    if (shortFormNavigation.total - shortFormNavigation.index <= 8) void loadMore();
  }, [channel?.id, loadMore, shortFormNavigation]);

  return (
    <section className="min-h-dvh bg-[#050507]" aria-label="CORE Shorts">
      <p className="sr-only">Opening the CORE Shorts player.</p>
    </section>
  );
}

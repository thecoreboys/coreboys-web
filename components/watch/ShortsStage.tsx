"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { itemToPlayable, type Playable } from "@/lib/watch/playable";
import {
  SHORT_FORM_QUEUE_DEFAULT_LIMIT,
  SHORT_FORM_QUEUE_FILTER,
  isShortFormQueuePlayable,
} from "@/lib/watch/queue-response";
import type { WatchItem } from "@/lib/watch/types";
import { isShortFormNavigationItem } from "@/lib/watch/short-form-navigation";

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
type ShortsScope = { channel: string; rail: string; selected: string };

export function ShortsStage({ items, scope = null }: { items: WatchItem[]; scope?: ShortsScope | null }) {
  const {
    channel,
    current,
    playChannel,
    ready,
    refill,
    dataSaver,
    qualityPreference,
    shortFormNavigation,
  } = usePlayer();
  const initializedRef = useRef(false);
  const scopedChannel = useMemo(() => scope ? { ...SHORTS_CHANNEL, id: `core-shorts:${scope.channel}:${scope.rail}`, title: "Creator Shorts", subtitle: "Videos from this source", href: `/shorts?${new URLSearchParams({ channel: scope.channel, rail: scope.rail, item: scope.selected })}` } : SHORTS_CHANNEL, [scope]);
  const selectedKey = scope ? scope.selected.slice(scope.selected.indexOf(":") + 1) : null;
  const initialPlayables = useMemo(
    () => items.map(itemToPlayable).filter((item): item is Playable => Boolean(item)),
    [items],
  );
  const [feedItems, setFeedItems] = useState<Playable[]>(initialPlayables);
  const feedRef = useRef<Playable[]>(initialPlayables);
  const loadingMoreRef = useRef(false);
  const exhaustedRef = useRef(false);
  const scopedCursorRef = useRef<string | null>(null);
  const scopedReadyRef = useRef(!scope);
  const scopedWrapPendingRef = useRef(false);
  const scopedWrappedRef = useRef(false);
  const [scopedPageCount, setScopedPageCount] = useState(0);
  const [scopeError, setScopeError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(Boolean(scope));
  const [scopeRetry, setScopeRetry] = useState(0);

  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    setScopeError(false);
    setScopeLoading(true);
    try {
      const seed = JSON.parse(sessionStorage.getItem("core:scoped-shorts-seed") ?? "null") as { channel?: string; rail?: string; selected?: string; items?: WatchItem[] } | null;
      if (seed?.channel === scope.channel && seed.rail === scope.rail && seed.selected === scope.selected && Array.isArray(seed.items)) {
        const seeded = seed.items.slice(0, 100).map(itemToPlayable).filter((item): item is Playable => Boolean(item && isShortFormNavigationItem(item)));
        feedRef.current = seeded;
        setFeedItems(seeded);
      }
    } catch { /* Direct links load from the archive below. */ }
    const params = new URLSearchParams({ rail: scope.rail, around: scope.selected });
    void fetch(`/api/watch/channels/${encodeURIComponent(scope.channel)}/archive?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Source unavailable");
        return response.json() as Promise<{ items: WatchItem[]; nextCursor: string | null; offset: number }>;
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        const next = page.items.map(itemToPlayable).filter((item): item is Playable => Boolean(item && isShortFormNavigationItem(item)));
        feedRef.current = next;
        setFeedItems(next);
        scopedCursorRef.current = page.nextCursor;
        scopedWrapPendingRef.current = page.offset > 0;
        scopedWrappedRef.current = false;
        exhaustedRef.current = page.nextCursor === null && !scopedWrapPendingRef.current;
        scopedReadyRef.current = true;
        setScopeLoading(false);
      })
      .catch(() => { if (!controller.signal.aborted) { setScopeError(true); setScopeLoading(false); } });
    return () => controller.abort();
  }, [scope, scopeRetry]);

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
    if (scope && !scopedReadyRef.current) return;
    loadingMoreRef.current = true;
    setMoreError(false);
    try {
      if (scope) {
        const cursor = scopedCursorRef.current;
        if (!cursor && !scopedWrapPendingRef.current) { exhaustedRef.current = true; return; }
        if (!cursor) { scopedWrapPendingRef.current = false; scopedWrappedRef.current = true; }
        const params = new URLSearchParams({ rail: scope.rail });
        if (cursor) params.set("after", cursor);
        const response = await fetch(`/api/watch/channels/${encodeURIComponent(scope.channel)}/archive?${params}`);
        if (!response.ok) throw new Error("Source unavailable");
        const page = await response.json() as { items: WatchItem[]; nextCursor: string | null };
        const known = new Set(feedRef.current.map((item) => item.key));
        const incoming = page.items.map(itemToPlayable).filter((item): item is Playable => Boolean(item && isShortFormNavigationItem(item) && !known.has(item.key)));
        scopedCursorRef.current = page.nextCursor;
        const reachedEarlierWindow = scopedWrappedRef.current && page.items.some((item) => known.has(item.id));
        exhaustedRef.current = reachedEarlierWindow || (page.nextCursor === null && !scopedWrapPendingRef.current) || (page.nextCursor === cursor && incoming.length === 0);
        const next = [...feedRef.current, ...incoming];
        feedRef.current = next;
        setFeedItems(next);
        setScopedPageCount((count) => count + 1);
        if (channel?.id === scopedChannel.id) refill(next, { channelId: scopedChannel.id });
        return;
      }
      const response = await fetch("/api/watch/queue?mode=queue&format=short", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          filter: SHORT_FORM_QUEUE_FILTER,
          limit: SHORT_FORM_QUEUE_DEFAULT_LIMIT,
          exclude: feedRef.current.map((item) => item.key),
        }),
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
      if (channel?.id === scopedChannel.id) refill(next, { channelId: scopedChannel.id });
    } catch {
      // A transient queue failure should not interrupt the current Short;
      // the next near-end navigation can retry the request.
      if (scope) setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [channel?.id, refill, scope, scopedChannel.id]);

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
    if (channel?.id === scopedChannel.id && (!scope || initializedRef.current || current?.key === selectedKey)) {
      initializedRef.current = true;
      refill(playables, { channelId: scopedChannel.id });
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    let startIndex = 0;
    try {
      const savedKey = scope ? selectedKey : sessionStorage.getItem("core-shorts-position");
      const found = playables.findIndex((item) => item.key === savedKey);
      if (found >= 0) startIndex = found;
    } catch { /* Session storage is optional. */ }
    playChannel(scopedChannel, playables, startIndex);
  }, [channel?.id, current?.key, feedItems, playChannel, ready, refill, scope, scopedChannel, selectedKey]);

  useEffect(() => {
    if (scope || channel?.id !== SHORTS_CHANNEL.id || !current) return;
    try { sessionStorage.setItem("core-shorts-position", current.key); } catch { /* Private browsing may disable storage. */ }
  }, [channel?.id, current, scope]);

  useEffect(() => {
    if (channel?.id !== scopedChannel.id || !current) return;
    // Stay ahead of the viewer: append the next batch before the final few
    // items enter the preload deck, keeping continuous scroll seamless.
    if (!shortFormNavigation || shortFormNavigation.total - shortFormNavigation.index <= 8) void loadMore();
  }, [channel?.id, current, feedItems.length, loadMore, scopedChannel.id, scopedPageCount, shortFormNavigation, scopeLoading]);

  return (
    <section className="min-h-dvh bg-[#050507]" aria-label="CORE Shorts">
      {feedItems.length ? <p className="sr-only">Opening the Shorts player.</p> : scopeLoading ? <p className="px-5 py-20 text-white/70" role="status">Loading Shorts…</p> : <div className="mx-auto max-w-lg px-5 py-20"><h1 className="text-3xl font-semibold">{scopeError ? "Couldn’t load these Shorts" : "No Shorts available right now"}</h1><p className="mt-4 text-white/70">Try again later, or browse the latest videos.</p>{scopeError ? <button type="button" className="mt-6 mr-5 min-h-11 underline" onClick={() => setScopeRetry((value) => value + 1)}>Try again</button> : null}<Link href="/" className="mt-6 inline-flex min-h-11 items-center underline">Back to home</Link></div>}
      {feedItems.length && scopeError ? <div className="fixed bottom-4 left-4 z-[95] rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg" role="status">Couldn’t load more from this source. <button type="button" className="ml-2 underline" onClick={() => setScopeRetry((value) => value + 1)}>Try again</button></div> : null}
      {feedItems.length && moreError ? <div className="fixed bottom-4 left-4 z-[95] rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg" role="status">Couldn’t load more Shorts. <button type="button" className="ml-2 underline" onClick={() => void loadMore()}>Try again</button></div> : null}
    </section>
  );
}

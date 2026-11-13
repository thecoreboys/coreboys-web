"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { WatchCatalog } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { watchChromeSnapshot, type WatchChromeSnapshot } from "@/lib/watch/chrome-snapshot";
import type { UnifiedLiveSnapshot } from "@/lib/watch/live-snapshot";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useMyList } from "@/hooks/useMyList";
import { createWatchRefreshScheduler } from "@/lib/watch/refresh-scheduler";
import { WatchExperienceControls } from "./WatchExperienceControls";

const unifiedLiveFetcher = async (url: string): Promise<UnifiedLiveSnapshot> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`unified_live_${response.status}`);
  return (await response.json()) as UnifiedLiveSnapshot;
};

/**
 * Watch shell — no second navbar. Site chrome lives in TopNav.
 * Search is still `/`. Live tiles float only while someone is on.
 */
export function WatchChrome({
  children,
  catalog,
  snapshot,
}: {
  children: React.ReactNode;
  catalog?: WatchCatalog;
  snapshot?: WatchChromeSnapshot;
}) {
  const chrome = useMemo(() => snapshot ?? (catalog ? watchChromeSnapshot(catalog) : undefined), [catalog, snapshot]);
  const player = usePlayer();
  const router = useRouter();
  const refreshScheduler = useMemo(() => createWatchRefreshScheduler({
    refresh: () => router.refresh(),
    isActive: () => document.visibilityState === "visible" && navigator.onLine,
  }), [router]);
  const hasChrome = Boolean(chrome);
  const { data: liveStatus } = useLiveStatus();
  // Select and synchronize the account-owned list once for every Watch
  // surface, including network pages whose cards do not mount WatchHome.
  useMyList();
  const refreshedFor = useRef("");
  const refreshedForUnified = useRef("");
  useEffect(() => () => {
    refreshScheduler.cancel();
    refreshedFor.current = "";
    refreshedForUnified.current = "";
  }, [refreshScheduler]);
  const unifiedFallback = useMemo<UnifiedLiveSnapshot | undefined>(
    () =>
      chrome
        ? {
            live: chrome.live.map((item) => ({
              id: item.id,
              platform: item.platform,
              memberSlug: item.memberSlug,
              dvrVodId: item.dvrVodId,
              login: item.login,
              youtubeId: null,
              title: null,
              poster: null,
              sourceUrl: null,
              startedAt: null,
              viewerCount: null,
            })),
            fetchedAt: chrome.fetchedAt,
          }
        : undefined,
    [chrome],
  );
  const { data: unifiedLive } = useSWR<UnifiedLiveSnapshot>(
    "/api/watch/live",
    unifiedLiveFetcher,
    {
      fallbackData: unifiedFallback,
      // A server snapshot is enough for hydration; a shell without one must
      // still load live state immediately instead of waiting for the poll.
      revalidateOnMount: !unifiedFallback,
      revalidateOnFocus: true,
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
    },
  );
  const catalogLiveKey = useMemo(
    () =>
      (chrome?.live ?? [])
        .filter((item) => item.platform === "twitch")
        .map((item) => item.login)
        .filter((login): login is string => Boolean(login))
        .sort()
        .join(","),
    [chrome?.live],
  );
  const runtimeLiveKey = useMemo(
    () =>
      (liveStatus?.live ?? [])
        .filter((entry) => entry.isLive)
        .map((entry) => entry.login.toLowerCase())
        .sort()
        .join(","),
    [liveStatus],
  );
  const catalogUnifiedLiveKey = useMemo(
    () =>
      (chrome?.live ?? [])
        .map((item) => `${item.platform}:${item.memberSlug ?? "house"}:${item.id}:${item.dvrVodId ?? ""}`)
        .sort()
        .join(","),
    [chrome?.live],
  );
  const runtimeUnifiedLiveKey = useMemo(
    () =>
      (unifiedLive?.live ?? [])
        .map((item) => `${item.platform}:${item.memberSlug ?? "house"}:${item.id}:${item.dvrVodId ?? ""}`)
        .sort()
        .join(","),
    [unifiedLive],
  );

  useEffect(() => {
    if (chrome) player.refill(chrome.recommendations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome]);

  // Posts do not change the live-key, so they need their own light-weight
  // catalog refresh. Social provider work is coalesced on the server; this
  // merely lets an open home/channel/Shorts page pick up the shared result.
  // Never refresh a background tab or an offline client.
  useEffect(() => {
    if (!hasChrome) return;
    const refreshWhenActive = () => {
      refreshScheduler.request("catalog");
    };
    // Each refresh re-renders the whole server page (catalog, Originals,
    // Patreon) for this tab, so keep the cadence modest; live transitions
    // have their own fast path below. `visibilitychange` already covers a
    // returning viewer, so `focus` would only double the request.
    const timer = window.setInterval(refreshWhenActive, 180_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshWhenActive();
    };
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasChrome, refreshScheduler]);

  // SWR keeps checking Twitch while the page is open. When somebody starts
  // or ends a stream, refresh the server catalog so live immediately moves to
  // (or leaves) the hero, shelves, Guide, search, and autoplay queue together.
  useEffect(() => {
    if (!liveStatus) return;
    if (runtimeLiveKey === catalogLiveKey) {
      refreshedFor.current = "";
      return;
    }
    const transition = `${catalogLiveKey}->${runtimeLiveKey}`;
    if (refreshedFor.current === transition) return;
    refreshedFor.current = transition;
    refreshScheduler.request("live");
  }, [catalogLiveKey, liveStatus, refreshScheduler, runtimeLiveKey]);

  // YouTube Live and X Spaces do not emit through Twitch's fast status API.
  // A shared, cached snapshot keeps them live-first while Watch stays open
  // without downloading the entire catalog into the browser.
  useEffect(() => {
    if (!unifiedLive) return;
    if (runtimeUnifiedLiveKey === catalogUnifiedLiveKey) {
      refreshedForUnified.current = "";
      return;
    }
    const transition = `${catalogUnifiedLiveKey}->${runtimeUnifiedLiveKey}`;
    if (refreshedForUnified.current === transition) return;
    refreshedForUnified.current = transition;
    refreshScheduler.request("live");
  }, [catalogUnifiedLiveKey, refreshScheduler, runtimeUnifiedLiveKey, unifiedLive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const shelf = document.querySelector(".watch-shelf:hover, .watch-shelf:focus-within") as HTMLElement | null;
        if (shelf) {
          e.preventDefault();
          shelf.scrollBy({ left: e.key === "ArrowRight" ? 220 : -220, behavior: "smooth" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="watch-os">
      {children}
      <WatchExperienceControls />
      {/* A permanent fixed portal host keeps preview iframes outside shelf
          layout and prevents scroll anchoring when they mount or resize. */}
      <div id="watch-preview-root" className="watch-preview-root" />
    </div>
  );
}

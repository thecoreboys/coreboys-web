"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { WatchCatalog } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { catalogPlayables } from "@/lib/watch/playable";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useMyList } from "@/hooks/useMyList";
import { WatchExperienceControls } from "./WatchExperienceControls";

type UnifiedLiveSnapshot = {
  live: Array<{
    id: string;
    platform: WatchCatalog["live"][number]["platform"];
    memberSlug: string | null;
    dvrVodId: string | null;
  }>;
  fetchedAt: string;
};

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
}: {
  children: React.ReactNode;
  catalog?: WatchCatalog;
}) {
  const player = usePlayer();
  const router = useRouter();
  const { data: liveStatus } = useLiveStatus();
  // Select and synchronize the account-owned list once for every Watch
  // surface, including network pages whose cards do not mount WatchHome.
  useMyList();
  const refreshedFor = useRef("");
  const refreshedForUnified = useRef("");
  const unifiedFallback = useMemo<UnifiedLiveSnapshot | undefined>(
    () =>
      catalog
        ? {
            live: catalog.live.map((item) => ({
              id: item.id,
              platform: item.platform,
              memberSlug: item.memberSlug,
              dvrVodId: item.dvr?.twitchVodId ?? null,
            })),
            fetchedAt: catalog.fetchedAt,
          }
        : undefined,
    [catalog],
  );
  const { data: unifiedLive } = useSWR<UnifiedLiveSnapshot>(
    "/api/watch/live",
    unifiedLiveFetcher,
    {
      fallbackData: unifiedFallback,
      revalidateOnMount: false,
      revalidateOnFocus: true,
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
    },
  );
  const catalogLiveKey = useMemo(
    () =>
      (catalog?.live ?? [])
        .filter((item) => item.platform === "twitch")
        .map((item) => item.live?.login?.toLowerCase())
        .filter((login): login is string => Boolean(login))
        .sort()
        .join(","),
    [catalog?.live],
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
      (catalog?.live ?? [])
        .map((item) => `${item.platform}:${item.memberSlug ?? "house"}:${item.id}:${item.dvr?.twitchVodId ?? ""}`)
        .sort()
        .join(","),
    [catalog?.live],
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
    if (catalog) player.refill(catalogPlayables(catalog));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog?.fetchedAt]);

  // Posts do not change the live-key, so they need their own light-weight
  // catalog refresh. Social provider work is coalesced on the server; this
  // merely lets an open home/channel/Shorts page pick up the shared result.
  // Never refresh a background tab or an offline client.
  useEffect(() => {
    if (!catalog) return;
    const refreshWhenActive = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      router.refresh();
    };
    const timer = window.setInterval(refreshWhenActive, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshWhenActive();
    };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [catalog?.fetchedAt, router]);

  // SWR keeps checking Twitch while the page is open. When somebody starts
  // or ends a stream, refresh the server catalog so live immediately moves to
  // (or leaves) the hero, shelves, Guide, search, and autoplay queue together.
  useEffect(() => {
    if (!liveStatus || runtimeLiveKey === catalogLiveKey) return;
    const transition = `${catalogLiveKey}->${runtimeLiveKey}`;
    if (refreshedFor.current === transition) return;
    refreshedFor.current = transition;
    const timer = window.setTimeout(() => router.refresh(), 500);
    return () => window.clearTimeout(timer);
  }, [catalogLiveKey, liveStatus, router, runtimeLiveKey]);

  // YouTube Live and X Spaces do not emit through Twitch's fast status API.
  // A shared, cached snapshot keeps them live-first while Watch stays open
  // without downloading the entire catalog into the browser.
  useEffect(() => {
    if (!unifiedLive || runtimeUnifiedLiveKey === catalogUnifiedLiveKey) return;
    const transition = `${catalogUnifiedLiveKey}->${runtimeUnifiedLiveKey}`;
    if (refreshedForUnified.current === transition) return;
    refreshedForUnified.current = transition;
    const timer = window.setTimeout(() => router.refresh(), 500);
    return () => window.clearTimeout(timer);
  }, [catalogUnifiedLiveKey, router, runtimeUnifiedLiveKey, unifiedLive]);

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

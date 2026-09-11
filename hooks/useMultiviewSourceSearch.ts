"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { permittedMultiviewSearchItems } from "@/lib/watch/multiview-catalog";
import type { MultiviewLiveRoom } from "@/lib/watch/multiview-access";
import { itemToPlayable, type Playable } from "@/lib/watch/playable";
import type { WatchItem } from "@/lib/watch/types";

type Result = { owner: string; query: string; items: WatchItem[]; failed: boolean };

export function useMultiviewSourceSearch(query: string, enabled: boolean, room?: MultiviewLiveRoom) {
  const { user, loading } = useAuth();
  const owner = loading ? "__loading__" : user?.id ?? "__guest__";
  const needle = query.trim().slice(0, 240);
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || !needle || loading) return;
    let cancelled = false;
    const controller = new AbortController();
    let deadline = 0;
    const debounce = window.setTimeout(() => {
      deadline = window.setTimeout(() => controller.abort(), 10_000);
      const params = new URLSearchParams({ q: needle, mode: "basic", limit: "60" });
      // The all-live room's redacted transports must not re-enter via search.
      if (room) params.set("contentType", "video,broadcast,short,clip,photo");
      fetch(`/api/watch/search?${params}`, { credentials: "same-origin", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("archive_search_unavailable");
          const data = await response.json() as { results?: Array<{ item: WatchItem }> };
          if (!Array.isArray(data.results)) throw new Error("invalid_archive_search");
          if (!cancelled) setResult({ owner, query: needle, items: data.results.map((hit) => hit.item), failed: false });
        }).catch(() => {
          if (!cancelled) setResult({ owner, query: needle, items: [], failed: true });
        }).finally(() => window.clearTimeout(deadline));
    }, 250);
    return () => { cancelled = true; window.clearTimeout(debounce); window.clearTimeout(deadline); controller.abort(); };
  }, [enabled, loading, needle, owner, retry, room]);
  const current = result?.owner === owner && result.query === needle ? result : null;
  const items = useMemo(() => permittedMultiviewSearchItems(current?.items ?? [], room).flatMap((item): Playable[] => {
    if (item.embeddable === false && !item.mediaUrl && !item.embedUrl) return [];
    const playable = itemToPlayable(item);
    return playable ? [playable] : [];
  }), [current, room]);
  return {
    items,
    searching: Boolean(enabled && needle && !current),
    failed: current?.failed ?? false,
    retry: () => { setResult(null); setRetry((value) => value + 1); },
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { CoreOriginal } from "@/lib/core-originals";
import { expandWatchCatalog, type CompactWatchCatalog } from "@/lib/watch/catalog-cache";
import { homeItemReferences, mergeHomeItems } from "@/lib/watch/home-catalog";
import { isContinueWatchingMark } from "@/lib/watch/continue-watching";
import type { PatreonShelfData, WatchItem } from "@/lib/watch/types";
import { useMyList } from "@/hooks/useMyList";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { WatchChrome } from "./WatchChrome";
import { WatchHome } from "./WatchHome";

type Resolved = { owner: string; items: WatchItem[]; checked: string[]; error: boolean };
const EMPTY_ITEMS: WatchItem[] = [];

export function WatchHomeEntry({ catalog: compact, patreon, originals }: {
  catalog: CompactWatchCatalog; patreon: PatreonShelfData; originals: CoreOriginal[];
}) {
  const base = useMemo(() => expandWatchCatalog(compact), [compact]);
  const { map, ready, accountKey } = useWatchProgress();
  const { ids, loading } = useMyList();
  const [resolved, setResolved] = useState<Resolved>({ owner: "", items: [], checked: [], error: false });
  const owned = resolved.owner === accountKey;
  const extra = owned ? resolved.items : EMPTY_ITEMS;
  const catalog = useMemo(() => ({ ...base, all: mergeHomeItems(base.all, extra) }), [base, extra]);
  const known = new Set([...catalog.all.flatMap(homeItemReferences), ...(owned ? resolved.checked : [])]);
  // A small public-metadata request restores older saves and Continue Watching
  // without sending everyone's complete archive in the initial document.
  const wanted = [...new Set([
    ...Object.entries(map).filter(([, mark]) => isContinueWatchingMark(mark)).map(([reference]) => reference),
    ...ids,
  ])].filter((reference) => !known.has(reference));
  const lookupKey = wanted.slice(0, 100).join("\n");
  const failed = owned && resolved.error;
  useEffect(() => {
    if (!ready || loading || !lookupKey || failed) return;
    const refs = lookupKey.split("\n");
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    fetch("/api/watch/items", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs }), signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("catalog_items_unavailable");
      const data = await response.json() as { items?: WatchItem[] };
      if (!Array.isArray(data.items)) throw new Error("invalid_catalog_items");
      if (cancelled) return;
      setResolved((previous) => ({ owner: accountKey,
        items: mergeHomeItems(previous.owner === accountKey ? previous.items : [], data.items!),
        checked: [...(previous.owner === accountKey ? previous.checked : []), ...refs], error: false,
      }));
    }).catch(() => {
      if (!cancelled) setResolved((previous) => ({ owner: accountKey,
        items: previous.owner === accountKey ? previous.items : [],
        checked: previous.owner === accountKey ? previous.checked : [], error: true,
      }));
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [accountKey, failed, loading, lookupKey, ready]);

  return <WatchChrome catalog={catalog}>
    {failed ? <div role="status" className="px-5 pt-20 text-sm text-white/70">
      Your saved history could not load. <button type="button" className="underline" onClick={() => setResolved((value) => ({ ...value, error: false }))}>Retry</button>
    </div> : null}
    <WatchHome catalog={catalog} patreon={patreon} originals={originals} />
  </WatchChrome>;
}

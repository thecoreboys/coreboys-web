"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PassportCard } from "@/lib/passport/types";

export type PassportInventoryPage = {
  items: PassportCard[];
  nextCursor: string | null;
};

export type PassportInventoryState = {
  cards: PassportCard[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
};

/** Keep server ordering while replacing duplicate ids with their freshest row. */
export function mergePassportCards(current: PassportCard[], incoming: PassportCard[]) {
  const positions = new Map(current.map((card, index) => [card.id, index]));
  const merged = [...current];
  for (const card of incoming) {
    const position = positions.get(card.id);
    if (position === undefined) {
      positions.set(card.id, merged.length);
      merged.push(card);
    } else {
      merged[position] = card;
    }
  }
  return merged;
}

export async function collectPassportInventoryPages(
  seed: PassportCard[],
  loadPage: (cursor?: string) => Promise<PassportInventoryPage>,
  options: {
    maxPages?: number;
    onPage?: (cards: PassportCard[], nextCursor: string | null) => void;
  } = {},
) {
  const maxPages = Math.max(1, Math.min(50, Math.trunc(options.maxPages ?? 1)));
  const seenCursors = new Set<string>();
  let cards = seed;
  let cursor: string | undefined;
  let pagesLoaded = 0;
  while (pagesLoaded < maxPages) {
    const page = await loadPage(cursor);
    cards = mergePassportCards(cards, page.items);
    pagesLoaded += 1;
    options.onPage?.(cards, page.nextCursor);
    if (!page.nextCursor) return { cards, nextCursor: null, pagesLoaded };
    if (seenCursors.has(page.nextCursor)) return { cards, nextCursor: null, pagesLoaded };
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return { cards, nextCursor: cursor ?? null, pagesLoaded };
}

async function inventoryPage(cursor?: string): Promise<PassportInventoryPage> {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/account/passport/inventory?${query}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (Partial<PassportInventoryPage> & { error?: string })
    | null;
  if (!response.ok) throw new Error(payload?.error ?? "Memory Book could not be loaded.");
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextCursor: typeof payload?.nextCursor === "string" ? payload.nextCursor : null,
  };
}

export function usePassportInventory(
  seed: PassportCard[],
  options: { enabled?: boolean; autoLoadAll?: boolean; maxAutoPages?: number } = {},
): PassportInventoryState {
  const enabled = options.enabled !== false;
  const autoLoadAll = options.autoLoadAll === true;
  const maxAutoPages = Math.max(1, Math.min(50, Math.trunc(options.maxAutoPages ?? 20)));
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const seedKey = useMemo(() => seed.map((card) => `${card.id}:${card.state}`).join("|"), [seed]);
  const [cards, setCards] = useState(seed);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    if (!enabled) {
      setCards(seedRef.current);
      setNextCursor(undefined);
      setLoading(false);
      setError(null);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    setCards(seedRef.current);
    let loadedAny = false;
    try {
      const result = await collectPassportInventoryPages(seedRef.current, inventoryPage, {
        maxPages: autoLoadAll ? maxAutoPages : 1,
        onPage: (nextCards, cursor) => {
          if (request !== requestRef.current) return;
          loadedAny = true;
          setCards(nextCards);
          setNextCursor(cursor);
        },
      });
      if (request !== requestRef.current) return;
      setCards(result.cards);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      if (request !== requestRef.current) return;
      if (!loadedAny) setNextCursor(null);
      setError(cause instanceof Error ? cause.message : "Memory Book could not be loaded.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [autoLoadAll, enabled, maxAutoPages]);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      requestRef.current += 1;
    };
  }, [loadFirstPage, seedKey]);

  const loadMore = useCallback(async () => {
    if (!enabled || !nextCursor || loadingMore) return;
    const cursor = nextCursor;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await inventoryPage(cursor);
      setCards((current) => mergePassportCards(current, page.items));
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More memories could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, loadingMore, nextCursor]);

  return {
    cards,
    loading,
    loadingMore,
    error,
    hasMore: typeof nextCursor === "string" && nextCursor.length > 0,
    loadMore,
    reload: loadFirstPage,
  };
}

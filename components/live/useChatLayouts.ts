"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSavedChatLayout,
  type ChatLayoutSnapshot,
  type SavedChatLayout,
} from "@/lib/chat-layouts";

export type ChatLayoutSync = {
  load: () => Promise<SavedChatLayout[]>;
  save: (layout: SavedChatLayout) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const validSavedLayout = (value: unknown): value is SavedChatLayout => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedChatLayout>;
  return typeof record.id === "string" && typeof record.name === "string" && Boolean(record.layout);
};

/** Local-first named layouts with an optional account-sync adapter. */
export function useChatLayouts({
  storageKey = "coreboys-chat-layouts:v1",
  sync,
}: {
  storageKey?: string;
  sync?: ChatLayoutSync;
} = {}) {
  const [layouts, setLayouts] = useState<SavedChatLayout[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback(
    (next: SavedChatLayout[]) => {
      setLayouts(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Layouts still work for this tab when storage is unavailable.
      }
    },
    [storageKey],
  );

  useEffect(() => {
    let local: SavedChatLayout[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(parsed)) local = parsed.filter(validSavedLayout);
    } catch {
      // Ignore malformed older preferences.
    }
    setLayouts(local);
    setHydrated(true);

    if (!sync) return;
    let cancelled = false;
    void sync.load().then((remote) => {
      if (cancelled) return;
      const byId = new Map(local.map((layout) => [layout.id, layout]));
      for (const layout of remote.filter(validSavedLayout)) {
        const existing = byId.get(layout.id);
        if (!existing || layout.updatedAt > existing.updatedAt) byId.set(layout.id, layout);
      }
      persist([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [persist, storageKey, sync]);

  const save = useCallback(
    (name: string, snapshot: ChatLayoutSnapshot) => {
      const saved = createSavedChatLayout(name, snapshot);
      persist([saved, ...layouts.filter((layout) => layout.id !== saved.id)].slice(0, 20));
      void sync?.save(saved).catch(() => {});
      return saved;
    },
    [layouts, persist, sync],
  );

  const remove = useCallback(
    (id: string) => {
      persist(layouts.filter((layout) => layout.id !== id));
      void sync?.remove(id).catch(() => {});
    },
    [layouts, persist, sync],
  );

  return { layouts, hydrated, save, remove };
}

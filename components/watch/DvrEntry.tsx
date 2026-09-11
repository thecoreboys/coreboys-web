"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import type { WatchItem } from "@/lib/watch/types";
import { MyListPage } from "./MyListPage";

const EMPTY: WatchItem[] = [];

export function DvrEntry({ ownerId, items }: { ownerId: string; items: WatchItem[] }) {
  const { user, loading } = useAuth();
  const key = loading ? "loading" : user?.id ?? "guest";
  return <MyListPage key={key} initialItems={!loading && user?.id === ownerId ? items : EMPTY} />;
}

"use client";

import useSWR from "swr";
import type { LiveResponse } from "@/lib/twitch";
import { syncLiveMemory } from "@/lib/watch/live-memory";

const fetcher = async (url: string): Promise<LiveResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`live_status_${res.status}`);
  const data = (await res.json()) as LiveResponse;
  return data;
};

export function useLiveStatus(enabled = true) {
  const swr = useSWR<LiveResponse>(enabled ? "/api/twitch/live" : null, fetcher, {
    // Shared live state drives the hero, Guide, player, and navbar. Thirty
    // seconds keeps live transitions feeling immediate without polling every
    // embed or card independently.
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    onSuccess: (data) => {
      syncLiveMemory(data.live ?? []);
    },
  });
  return swr;
}

export function useLoginIsLive(login: string): boolean {
  const { data } = useLiveStatus();
  if (!data) return false;
  return Boolean(data.live.find((entry) => entry.login.toLowerCase() === login.toLowerCase())?.isLive);
}

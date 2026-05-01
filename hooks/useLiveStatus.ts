"use client";

import useSWR from "swr";
import type { LiveResponse } from "@/lib/twitch";

const fetcher = async (url: string): Promise<LiveResponse> => {
  const res = await fetch(url);
  const data = (await res.json()) as LiveResponse;
  return data;
};

export function useLiveStatus() {
  return useSWR<LiveResponse>("/api/twitch/live", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
  });
}

export function useLoginIsLive(login: string): boolean {
  const { data } = useLiveStatus();
  if (!data) return false;
  return Boolean(data.live.find((entry) => entry.login.toLowerCase() === login.toLowerCase())?.isLive);
}

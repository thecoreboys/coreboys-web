"use client";

import useSWR from "swr";

export type StreamSession = {
  id: string;
  slug: string;
  startedAt: string;
  endedAt: string | null;
  totalMinutes: number;
  peakViewers: number;
  avgViewers?: number;
  title: string | null;
  game: string | null;
  twitchStreamId?: string | null;
  source?: "observed";
};

export type StreamDaily = {
  slug: string;
  date: string;
  minutes: number;
  sessions: number;
  peakViewers: number;
};

type Payload = {
  sessions?: StreamSession[];
  daily?: StreamDaily[];
  unavailable?: boolean;
  detail?: string;
};

const fetcher = async (url: string): Promise<Payload> => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return { sessions: [], daily: [] };
  return (await res.json()) as Payload;
};

export function useStreamSessions(range: "1d" | "7d" | "31d" | "all" = "7d") {
  const { data } = useSWR<Payload>(`/api/streams?range=${range}`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 20_000,
    shouldRetryOnError: false,
  });
  const sessions = data?.sessions ?? [];
  const daily = data?.daily ?? [];
  const latestBySlug = (slug: string) => sessions.find((s) => s.slug === slug) ?? null;
  return {
    sessions,
    daily,
    latestBySlug,
    unavailable: data?.unavailable === true,
    isLoading: data === undefined,
  };
}

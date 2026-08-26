"use client";

import useSWR from "swr";
import { Sparkles } from "lucide-react";

type Payload = { summary: string; source: "ai" | "fallback" };

const fetcher = async (url: string): Promise<Payload> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Payload;
};

/**
 * One-sentence Claude-summary under a live stream card. Falls back gracefully
 * to the stream's game/category if the AI route is unavailable.
 */
export function StreamContext({ login }: { login: string }) {
  const { data } = useSWR<Payload>(
    login ? `/api/stream-context/${encodeURIComponent(login)}` : null,
    fetcher,
    {
      refreshInterval: 90_000,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  if (!data || !data.summary) return null;

  return (
    <p
      aria-live="polite"
      className="flex items-start gap-2 text-xs text-[color:var(--ink-dim)]"
    >
      {data.source === "ai" ? (
        <span
          aria-label="AI summary"
          className="mt-0.5 inline-flex h-4 items-center gap-1 rounded-full border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 px-1.5 text-xs uppercase tracking-[0.18em] text-[color:var(--core)]"
        >
          <Sparkles size={9} />
          AI
        </span>
      ) : null}
      <span className="leading-snug">{data.summary}</span>
    </p>
  );
}

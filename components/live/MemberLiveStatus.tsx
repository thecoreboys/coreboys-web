"use client";

import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import type { LiveEntry } from "@/lib/twitch";

export type MemberLiveStatusProps = {
  login: string;
  /** Member slug — used by the Monitor button to deep-link into
   *  /monitor/[slug] when the channel is live. */
  slug?: string;
  /** Server-fetched initial entry so first paint is correct (no flicker
   *  from "Offline" → "Live"). The SWR hook refreshes every 60s. */
  initial?: LiveEntry;
};

/**
 * Live status block for the member hero. Renders one of two states:
 *   - LIVE: red blinking dot, viewer count, "Watch on Twitch" CTA.
 *   - Offline: muted pill so the area doesn't collapse.
 *
 * Updates without a page reload via `useLiveStatus` (SWR, 60s).
 */
export function MemberLiveStatus({ login, slug, initial }: MemberLiveStatusProps) {
  const { data } = useLiveStatus();
  const entry =
    data?.live.find((e) => e.login.toLowerCase() === login.toLowerCase()) ??
    initial;
  const isLive = entry?.isLive ?? false;
  const viewerCount = entry?.viewerCount;

  if (!isLive) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ink-faint)]" aria-hidden />
        Offline
      </span>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3"
      style={{
        borderColor: "rgba(145,70,255,0.55)",
        background:
          "linear-gradient(90deg, rgba(145,70,255,0.16) 0%, rgba(145,70,255,0.06) 70%, transparent 100%)",
        boxShadow: "inset 0 0 0 1px rgba(145,70,255,0.18)",
      }}
    >
      {/* Pulsing live indicator — red dot with an outer ping ring. */}
      <span aria-hidden className="relative inline-flex h-3 w-3 shrink-0">
        <span
          className="absolute inset-0 rounded-full bg-[color:var(--core)] opacity-75"
          style={{ animation: "ping-soft 1.6s cubic-bezier(0,0,0.2,1) infinite" }}
        />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-[color:var(--core)] shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
      </span>

      {/* Live label + viewer count stack. */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--core)]">
          Live on Twitch
        </span>
        {viewerCount != null ? (
          <span className="mt-0.5 text-[18px] font-bold tabular-nums text-[color:var(--ink)]">
            {viewerCount.toLocaleString("en-US")}
            <span className="ml-1.5 text-[11px] font-normal uppercase tracking-[0.2em] text-[color:var(--ink-dim)]">
              watching
            </span>
          </span>
        ) : (
          <span className="mt-0.5 text-[13px] font-semibold text-[color:var(--ink)]">
            Streaming now
          </span>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Internal Monitor link — only mounts when live and we have a
            slug for the route, since /monitor/[slug] uses the player JS
            API and there's nothing meaningful to monitor when offline. */}
        {slug ? (
          <Link
            href={`/monitor/${slug}` as `/monitor/${string}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink)] transition-all hover:-translate-y-0.5 hover:border-[color:var(--core)] hover:text-[color:var(--core)] active:translate-y-0"
          >
            <Activity size={12} />
            Monitor
          </Link>
        ) : null}
        {/* CTA — full-bleed Twitch purple, no faux 3D. */}
        <a
          href={`https://twitch.tv/${login}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#9146FF] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.05em] text-white transition-all hover:-translate-y-0.5 hover:bg-[#7c3aed] hover:shadow-[0_10px_24px_-8px_rgba(145,70,255,0.65)] active:translate-y-0"
        >
          Watch
          <ArrowUpRight size={12} />
        </a>
      </div>
    </div>
  );
}

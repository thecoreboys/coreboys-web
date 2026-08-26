"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { LiveDot } from "@/components/ui/LiveDot";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MEMBERS_BY_LOGIN } from "@/lib/members-helpers";
import { buildLiveSummary } from "@/lib/live-summary";
import { formatViewerCount } from "@/lib/utils";
import { formatHandleDisplay } from "@/lib/watch/display-label";

/**
 * WHO'S LIVE bar — fixed strip above the page when at least one member
 * is streaming. Glass surface, animated viewer-counter ticker, AI-style
 * one-line summary, "Watch" CTAs straight into the stream.
 *
 * The bar collapses into a thin pill on scroll and re-expands on hover /
 * focus / when a new member goes live. When everyone's offline, the bar
 * unmounts entirely so the home page is free of dead UI.
 */
export function WhoIsLiveBar() {
  const { data } = useLiveStatus();
  const liveEntries = useMemo(
    () => (data?.live ?? []).filter((e) => e.isLive),
    [data],
  );
  const summary = useMemo(() => buildLiveSummary(data?.live ?? []), [data]);
  const totalViewers = useMemo(
    () => liveEntries.reduce((acc, e) => acc + (e.viewerCount ?? 0), 0),
    [liveEntries],
  );
  const [collapsed, setCollapsed] = useState(false);

  if (liveEntries.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3"
      data-collapsed={collapsed ? "1" : "0"}
    >
      <div
        className="pointer-events-auto flex w-full max-w-[1100px] items-stretch gap-2 rounded-full border border-[color:var(--rule)] bg-black/40 p-1.5 shadow-[0_0_24px_-12px_rgba(219,3,104,0.6)] backdrop-blur-md"
        role="region"
        aria-label="Who is live"
      >
        {/* Live dot + total viewers — compact at all times */}
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-[color:var(--bg-elev)]/70 px-3 py-1.5">
          <LiveDot live />
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
            {liveEntries.length} live
          </span>
          {totalViewers > 0 ? (
            <>
              <span className="text-quaternary">·</span>
              <AnimatedNumber
                value={totalViewers}
                format={formatViewerCount}
                className="text-xs tabular-nums text-primary"
                ariaLabel="Total viewers across live members"
              />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                watching
              </span>
            </>
          ) : null}
        </div>

        {/* Summary line — hides on collapse and on small viewports */}
        {!collapsed && summary ? (
          <p className="hidden flex-1 items-center px-2 text-xs text-tertiary md:flex">
            <span className="truncate">{summary}</span>
          </p>
        ) : null}

        {/* Per-member chips */}
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto md:flex-none">
          {liveEntries.map((entry) => {
            const member = MEMBERS_BY_LOGIN.get(entry.login.toLowerCase());
            return (
              <a
                key={entry.login}
                href={`https://twitch.tv/${entry.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/70 px-2 py-1 transition-all hover:border-[color:var(--core)] hover:bg-[color:var(--surface)]/80"
                style={{
                  boxShadow: member
                    ? `inset 0 0 0 1px ${member.accent}33`
                    : undefined,
                }}
                aria-label={`Watch ${member?.stageName ?? formatHandleDisplay(entry.login)} on Twitch — ${formatViewerCount(entry.viewerCount ?? 0)} viewers`}
              >
                {member ? (
                  <span
                    className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border"
                    style={{ borderColor: member.accent }}
                  >
                    <Image
                      src={member.portrait}
                      alt=""
                      fill
                      sizes="24px"
                      className="object-cover"
                    />
                  </span>
                ) : null}
                <span className="font-display text-xs font-semibold leading-none tracking-tight text-primary">
                  {member?.stageName ?? formatHandleDisplay(entry.login)}
                </span>
                {entry.viewerCount != null ? (
                  <AnimatedNumber
                    value={entry.viewerCount}
                    format={formatViewerCount}
                    className="text-xs tabular-nums text-tertiary"
                  />
                ) : null}
                <ExternalLink
                  size={10}
                  className="text-[color:var(--ink-faint)] transition-colors group-hover:text-[color:var(--core)]"
                />
              </a>
            );
          })}
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand live bar" : "Collapse live bar"}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] md:inline-flex"
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>
    </div>
  );
}

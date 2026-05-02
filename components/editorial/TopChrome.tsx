"use client";

import Link from "next/link";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { cn } from "@/lib/utils";

/**
 * Fixed editorial chrome:
 *   - top-left: "CORE" wordmark seal, anchored, doubles as home link.
 *   - top-right: live indicator chip; jumps to #live; aria-live="polite" so
 *     screen readers announce status changes.
 *
 * Sized in 8px multiples per the rhythm rules.
 */
export function TopChrome() {
  const { data } = useLiveStatus();
  const liveCount = data?.live.filter((l) => l.isLive).length ?? 0;
  const anyLive = liveCount > 0;

  return (
    <>
      <Link
        href="#hero"
        className="fixed left-6 top-6 z-50 font-display text-[18px] font-black tracking-[-0.04em] text-[color:var(--ink)] mix-blend-difference"
        aria-label="CORE"
      >
        CORE
      </Link>

      <a
        href="#live"
        aria-live="polite"
        className={cn(
          "fixed right-6 top-6 z-50 inline-flex items-center gap-2 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)]/80 px-3 py-1.5 backdrop-blur",
          "transition-colors duration-300 [transition-timing-function:var(--ease-out)]",
          anyLive ? "border-[color:var(--live)]/40 text-[color:var(--ink)]" : "text-[color:var(--ink-dim)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            anyLive ? "bg-[color:var(--live)] live-pulse" : "bg-[color:var(--ink-faint)]",
          )}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
          {anyLive ? `${liveCount} live now` : "Quiet"}
        </span>
      </a>
    </>
  );
}

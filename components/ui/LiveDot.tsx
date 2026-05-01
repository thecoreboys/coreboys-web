"use client";

import { cn } from "@/lib/utils";

export function LiveDot({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      aria-label={live ? "Live now" : "Offline"}
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        live ? "bg-[color:var(--live)] live-pulse" : "bg-[color:var(--ink-dim)]/60",
        className,
      )}
    />
  );
}

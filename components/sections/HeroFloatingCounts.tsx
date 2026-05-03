"use client";

import { motion } from "framer-motion";
import { SocialIcon } from "@/components/ui/SocialIcon";
import type { PlatformKey } from "@/components/ui/PlatformLink";

export type FloatingCountItem = {
  platform: PlatformKey;
  count: number;
  handle: string;
  /** Brand hex used for the chip's accent ring + glow. */
  brand: string;
  /** "subs" for YouTube, "followers" for the rest. */
  unit: string;
  href: string;
};

/**
 * Group-account follower / sub counts rendered as a horizontal row of
 * gently drifting pill chips. Designed to sit inline beneath the
 * manifesto line in the home hero — flow layout, no absolute
 * positioning. Each chip drifts on its own period so the row stays
 * alive without ever covering content above it.
 *
 * Server fetches the counts via Social Fetch + passes them through;
 * this component owns layout, animation, and click-through to each
 * platform's group account.
 */
export function HeroFloatingCounts({ items }: { items: FloatingCountItem[] }) {
  if (items.length === 0) return null;

  // Per-chip vertical drift — different period each so the row never
  // syncs into a flat slab.
  const DRIFT = [4, -5, 6, -4];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, i) => {
        const drift = DRIFT[i % DRIFT.length]!;
        return (
          <motion.a
            key={item.platform}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${formatCount(item.count)} ${item.unit} on ${item.platform}`}
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: [0, drift, 0] }}
            transition={{
              opacity: { duration: 0.7, delay: 0.9 + i * 0.15, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.7, delay: 0.9 + i * 0.15, ease: [0.16, 1, 0.3, 1] },
              y: {
                duration: 4.5 + i * 0.6,
                delay: 0.9 + i * 0.15,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
              },
            }}
            style={{
              borderColor: `${item.brand}55`,
              boxShadow: `0 18px 40px -18px ${item.brand}99, inset 0 0 0 1px ${item.brand}33`,
            }}
            className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full border bg-[color:var(--bg-elev)]/80 px-3 py-1.5 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[color:var(--bg-elev)]/95"
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${item.brand}22`, color: item.brand }}
            >
              <SocialIcon platform={item.platform as never} size={13} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-bold tabular-nums tracking-tight text-[color:var(--ink)]">
                {formatCount(item.count)}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-dim)]">
                {item.unit}
              </span>
            </span>
          </motion.a>
        );
      })}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

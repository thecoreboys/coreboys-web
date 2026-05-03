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
 * Scattered, gently drifting follower-count chips for the home hero.
 * Server fetches the counts via Social Fetch + passes them through; this
 * component owns the placement, animation, and click-through to each
 * platform's group account.
 *
 * Hidden below `md` so they don't crowd the mobile hero.
 */
export function HeroFloatingCounts({ items }: { items: FloatingCountItem[] }) {
  if (items.length === 0) return null;

  // Cluster chips along the lower-right of the hero so they overlap the
  // group photo's bottom edge / clothing zone instead of riding above
  // the face area at the top. Each chip drifts on its own period.
  const POSITIONS: Array<{ top: string; right: string; drift: number }> = [
    { top: "62%", right: "28%", drift: 6 },
    { top: "74%", right: "4%", drift: -8 },
    { top: "86%", right: "26%", drift: 5 },
    { top: "94%", right: "6%", drift: -7 },
  ];

  return (
    <div
      aria-hidden="false"
      className="pointer-events-none absolute inset-0 z-20 hidden md:block"
    >
      {items.map((item, i) => {
        const pos = POSITIONS[i % POSITIONS.length]!;
        return (
          <motion.a
            key={item.platform}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${formatCount(item.count)} ${item.unit} on ${item.platform}`}
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: [0, pos.drift, 0] }}
            transition={{
              opacity: { duration: 0.7, delay: 0.9 + i * 0.18, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.7, delay: 0.9 + i * 0.18, ease: [0.16, 1, 0.3, 1] },
              y: {
                duration: 5 + i * 0.7,
                delay: 0.9 + i * 0.18,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
              },
            }}
            style={{
              top: pos.top,
              right: pos.right,
              borderColor: `${item.brand}55`,
              boxShadow: `0 18px 40px -18px ${item.brand}99, inset 0 0 0 1px ${item.brand}33`,
            }}
            className="pointer-events-auto absolute inline-flex items-center gap-2.5 rounded-full border bg-[color:var(--bg-elev)]/80 px-3 py-1.5 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[color:var(--bg-elev)]/95"
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

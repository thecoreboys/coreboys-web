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
 * Group-account follower / sub counts as a static horizontal row of
 * pill chips. No drift animation — just a clean fade-in on mount,
 * generous padding, and a subtle hover lift on each link.
 */
export function HeroFloatingCounts({ items }: { items: FloatingCountItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {items.map((item, i) => (
        <motion.a
          key={item.platform}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${formatCount(item.count)} ${item.unit} on ${item.platform}`}
          initial={{ opacity: 0, scale: 0.92, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.9 + i * 0.1,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            borderColor: `${item.brand}55`,
            boxShadow: `0 18px 40px -18px ${item.brand}99, inset 0 0 0 1px ${item.brand}33`,
          }}
          className="pointer-events-auto inline-flex items-center gap-3 rounded-full border bg-[color:var(--bg-elev)]/85 px-4 py-2 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-[color:var(--bg-elev)]/95"
        >
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${item.brand}22`, color: item.brand }}
          >
            <SocialIcon platform={item.platform as never} size={14} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-bold tabular-nums tracking-tight text-[color:var(--ink)]">
              {formatCount(item.count)}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-dim)]">
              {item.unit}
            </span>
          </span>
        </motion.a>
      ))}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

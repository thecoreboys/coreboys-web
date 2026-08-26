"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import type { PlatformKey } from "@/components/ui/PlatformLink";

export type FloatingCountItem = {
  platform: PlatformKey;
  count: number;
  handle: string;
  /** Brand hex used only as a subtle icon tint. */
  brand: string;
  /** "subs" for YouTube, "followers" for the rest. */
  unit: string;
  href: string;
};

/**
 * Group-account follower / sub counts — a sleek, corporate metric row.
 * Uniform neutral chips (restrained: brand color used only as a muted icon
 * tint, not a glow), big animated tabular count-up, hover lift. Premium over
 * loud per-platform glows.
 */
export function HeroFloatingCounts({ items }: { items: FloatingCountItem[] }) {
  const reduce = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item, i) => (
        <motion.a
          key={item.platform}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${formatCount(item.count)} ${item.unit} on ${item.platform}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="group inline-flex items-center gap-3 rounded-2xl bg-[color:var(--bg-elev)]/80 px-4 py-3 shadow-xs ring-1 ring-inset ring-[color:var(--rule)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-[color:var(--rule-strong)]"
        >
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[color:var(--rule)]"
            style={{ color: item.brand, background: `${item.brand}14` }}
          >
            <SocialIcon platform={item.platform as never} size={16} />
          </span>
          <span className="flex flex-col leading-tight">
            <AnimatedCounter
              value={item.count}
              format={formatCount}
              duration={1.6}
              className="text-xl font-semibold tracking-tight text-[color:var(--ink)]"
            />
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--ink-dim)]">
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
  return Math.round(n).toLocaleString("en-US");
}

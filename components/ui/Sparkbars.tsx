"use client";

import { motion } from "framer-motion";

export type SparkbarsProps = {
  /** Up to ~12 datapoints. */
  values: number[];
  /** Optional per-bar accent (CSS color). Defaults to var(--core). */
  colors?: string[];
  /** Bar height ceiling in px. */
  height?: number;
  className?: string;
};

/**
 * Tiny bar chart for boast-numbers. Animates each bar's height in on
 * first paint. Designed to sit *under* a counter / metric, not as a
 * standalone chart. No axes, no ticks — just the shape.
 */
export function Sparkbars({ values, colors, height = 32, className = "" }: SparkbarsProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className={`flex items-end gap-[3px] ${className}`} style={{ height }}>
      {values.map((v, i) => {
        const pct = Math.max(0.04, v / max);
        const color = colors?.[i] ?? "var(--core)";
        return (
          <motion.span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: pct }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.7,
              delay: i * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="block w-[6px] origin-bottom rounded-[2px]"
            style={{ height: "100%", background: color, opacity: 0.65 + pct * 0.35 }}
          />
        );
      })}
    </div>
  );
}

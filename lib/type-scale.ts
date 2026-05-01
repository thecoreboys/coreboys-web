/**
 * Strict type scale. Every type size in the codebase must snap to this list.
 * Keep in sync with `globals.css` (which defines the matching `--text-*`
 * custom properties for use in arbitrary Tailwind values).
 *
 * Tracking presets follow the prompt:
 *   - display ≥ 48px → -0.04em
 *   - 24–32px         → -0.02em
 *   - small caps      → +0.02em
 *   - kicker labels   → +0.18em
 */
export const TYPE_SCALE = {
  "12": { fontSize: "0.75rem", lineHeight: "1rem" },
  "14": { fontSize: "0.875rem", lineHeight: "1.25rem" },
  "16": { fontSize: "1rem", lineHeight: "1.5rem" },
  "18": { fontSize: "1.125rem", lineHeight: "1.625rem" },
  "24": { fontSize: "1.5rem", lineHeight: "2rem" },
  "32": { fontSize: "2rem", lineHeight: "2.25rem" },
  "48": { fontSize: "3rem", lineHeight: "1.05" },
  "72": { fontSize: "4.5rem", lineHeight: "1.02" },
  "120": { fontSize: "7.5rem", lineHeight: "0.95" },
  "200": { fontSize: "12.5rem", lineHeight: "0.88" },
} as const;

export type TypeSize = keyof typeof TYPE_SCALE;

export const TRACKING = {
  display: "-0.04em",
  midDisplay: "-0.02em",
  body: "0",
  smallCaps: "0.02em",
  kicker: "0.18em",
} as const;

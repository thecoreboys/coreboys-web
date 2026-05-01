/**
 * The motion system. Every transition in this codebase reaches for these
 * tokens — no inline easings, no off-list durations.
 *
 * Usage:
 *   transition={{ duration: durations.base / 1000, ease: ease.out }}
 *   transition={{ type: "spring", ...spring.snappy }}
 */

export const durations = {
  instant: 100,
  fast: 200,
  base: 400,
  slow: 700,
  cinematic: 1200,
} as const;

/**
 * Cubic-bezier control points. Framer Motion wants these as 4-tuples.
 *   `out`: things settling into place (default).
 *   `in`: things leaving the screen.
 *   `inOut`: long, balanced moves (camera dollies, scrolly pins).
 */
export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  in: [0.7, 0, 0.84, 0] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
} as const;

/**
 * Spring presets for Framer Motion / React Spring. Tuned for UI, not physics.
 */
export const spring = {
  gentle: { stiffness: 120, damping: 18 } as const,
  snappy: { stiffness: 300, damping: 24 } as const,
} as const;

/**
 * Cascade helper for stagger-on-enter. Returns the delay (in seconds) for
 * the Nth child given a per-step beat (default 70ms).
 */
export function cascade(index: number, beatMs = 70): number {
  return (index * beatMs) / 1000;
}

/**
 * Convert duration tokens (ms) to seconds for libraries that want seconds.
 */
export const seconds = {
  instant: durations.instant / 1000,
  fast: durations.fast / 1000,
  base: durations.base / 1000,
  slow: durations.slow / 1000,
  cinematic: durations.cinematic / 1000,
} as const;

/**
 * Reduced-motion variants. When honoured, transitions become instant fades
 * rather than disabled altogether — keeps state changes legible without
 * triggering vestibular issues.
 */
export const reducedMotion = {
  duration: 0.01,
  ease: ease.out,
} as const;

/**
 * CSS string equivalents for places where we can't use Framer (pure CSS
 * transitions in globals.css, etc.).
 */
export const cssEase = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "cubic-bezier(0.7, 0, 0.84, 0)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

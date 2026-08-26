import { MarqueeBand } from "@/components/editorial/MarqueeBand";

/**
 * Homepage "alive" marquee strip — a seamless looping band of the six
 * member names, the platforms they run, and the CORE slogan. Wraps
 * <MarqueeBand> with the curated content so app/page.tsx stays declarative.
 *
 * Reduced-motion + pause-on-hover behaviour lives in MarqueeBand / globals.
 */
const STRIP_ITEMS = [
  "MARLON",
  "STABLERONALDO",
  "ADAPT",
  "JASONTHEWEEN",
  "LACY",
  "SILKY",
  "YOUTUBE",
  "TWITCH",
  "TIKTOK",
  "INSTAGRAM",
  "CREATE OWN RUN EVERYTHING",
] as const;

export function MarqueeStrip({
  reverse = false,
  speed = "44s",
}: {
  reverse?: boolean;
  speed?: string;
}) {
  return <MarqueeBand items={STRIP_ITEMS} size="sm" reverse={reverse} speed={speed} />;
}

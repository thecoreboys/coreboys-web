/**
 * Seamless infinite marquee band — used as a section divider on the home
 * page. The track holds the content TWICE and translates -50% (see
 * `.marquee-track` in globals.css), so the loop seam is invisible at any
 * viewport width. Pauses on hover; honors prefers-reduced-motion.
 *
 * Two modes:
 *   - `phrase` (default): a single repeated slogan, big floor-to-floor type.
 *   - `items`: a list of strings (member names, platforms, …) rendered as
 *     pills/words separated by a glyph — the "alive" content strip.
 */
export function MarqueeBand({
  phrase = "CREATE · OWN · RUN · EVERYTHING",
  items,
  size = "lg",
  reverse = false,
  speed,
  separator = "·",
}: {
  phrase?: string;
  /** When provided, renders these as a spaced word strip instead of `phrase`. */
  items?: readonly string[];
  /** "sm" for a tighter ribbon, "lg" for the floor-to-floor home divider. */
  size?: "sm" | "lg";
  /** Scroll right→left by default; set true to reverse direction. */
  reverse?: boolean;
  /** Loop duration, e.g. "30s". Longer = slower. */
  speed?: string;
  separator?: string;
}) {
  const textClass =
    size === "lg"
      ? "text-display text-[clamp(56px,9vw,148px)] leading-none tracking-[-0.01em]"
      : "text-display text-[clamp(22px,3.2vw,40px)] leading-none tracking-tight";

  // One contiguous run of content. We render the run twice inside the track
  // so the -50% translate produces a seamless loop.
  const Run = () => {
    if (items && items.length > 0) {
      return (
        <div
          aria-hidden
          className={`flex shrink-0 items-center gap-8 pr-8 md:gap-12 md:pr-12 ${textClass}`}
        >
          {items.map((item, i) => (
            <span key={`${item}-${i}`} className="flex shrink-0 items-center gap-8 md:gap-12">
              <span className="text-[color:var(--ink)]">{item}</span>
              <span className="text-[color:var(--core)]">{separator}</span>
            </span>
          ))}
        </div>
      );
    }
    const repeated = Array.from({ length: 8 }, () => phrase).join(`   ${separator}   `);
    return (
      <span aria-hidden className={`shrink-0 whitespace-nowrap pr-12 text-[color:var(--ink)] ${textClass}`}>
        {repeated}
      </span>
    );
  };

  return (
    <section
      aria-label={items ? items.join(", ") : phrase}
      className="marquee-pause marquee-fade overflow-hidden border-y border-[color:var(--rule)] bg-[color:var(--bg)] py-5"
    >
      <div
        className={`marquee-track${reverse ? " marquee-track-reverse" : ""}`}
        style={speed ? ({ "--marquee-speed": speed } as React.CSSProperties) : undefined}
      >
        <Run />
        <Run />
      </div>
    </section>
  );
}

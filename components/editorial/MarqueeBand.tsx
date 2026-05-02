/**
 * Looping band of phrases — used as a section divider on the home page.
 * The text is duplicated once and the whole row translates -50%, so the
 * loop seam is invisible regardless of viewport width.
 */
export function MarqueeBand({
  phrase = "CREATE · OWN · RUN · EVERYTHING",
  size = "lg",
}: {
  phrase?: string;
  /** "sm" for a tighter ribbon, "lg" for the floor-to-floor home divider. */
  size?: "sm" | "lg";
}) {
  const repeated = Array.from({ length: 14 }, () => phrase).join("   ·   ");
  const className =
    size === "lg"
      ? "text-display text-[clamp(56px,9vw,148px)] leading-none tracking-[-0.01em] pr-12"
      : "text-display text-[clamp(28px,4vw,52px)] leading-none tracking-tight pr-8";
  return (
    <section
      aria-hidden
      className="border-y border-[color:var(--rule)] bg-[color:var(--bg)] py-5 overflow-hidden"
    >
      <div className="flex whitespace-nowrap will-change-transform animate-marquee">
        <span className={className}>{repeated}</span>
        <span className={className}>{repeated}</span>
      </div>
    </section>
  );
}

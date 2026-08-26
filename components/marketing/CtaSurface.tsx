import type { ReactNode } from "react";

export type CtaSurfaceVariant = "chrome-hero" | "signal-grid" | "editorial-poster" | "member-vault" | "drop-event";
export type CtaSurfaceDensity = "hero" | "standard" | "compact";
export type CtaSurfaceProps = {
  variant?: CtaSurfaceVariant;
  density?: CtaSurfaceDensity;
  artwork?: string;
  marquee?: string;
  serial?: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

/**
 * Presentation-only CTA shell. Copy and links stay in their feature
 * components; this centralizes the premium visual language safely.
 */
export function CtaSurface({
  variant = "chrome-hero", density = "standard", artwork, marquee, serial,
  className = "", children, "aria-label": ariaLabel,
}: CtaSurfaceProps) {
  return (
    <section aria-label={ariaLabel} className={`cta-surface cta-surface--${variant} cta-surface--${density} ${className}`}>
      {artwork ? <img src={artwork} alt="" aria-hidden className="cta-surface__art" /> : null}
      <span aria-hidden className="cta-surface__sheen" />
      <span aria-hidden className="cta-surface__registration cta-surface__registration--tl" />
      <span aria-hidden className="cta-surface__registration cta-surface__registration--br" />
      {serial ? <span aria-hidden className="cta-surface__serial">{serial}</span> : null}
      <div className="cta-surface__content">{children}</div>
      {marquee && density !== "compact" ? <div aria-hidden className="cta-surface__marquee"><span>{marquee} · {marquee} · {marquee}</span></div> : null}
    </section>
  );
}

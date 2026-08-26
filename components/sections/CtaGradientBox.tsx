"use client";

import type { FC, ReactNode } from "react";
import {
  ArrowRight,
  Users01,
  Heart,
  Image03,
  Announcement02,
  PlayCircle,
  Stars02,
} from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { BackgroundPattern } from "@/components/shared-assets/background-patterns";
import { CtaSurface } from "@/components/marketing/CtaSurface";

/**
 * Reusable Ironbow-brand CTA box.
 *
 * A rounded-3xl surface filled with the brand magenta→purple gradient
 * (`.cta-gradient-surface`, theme-aware), layered with:
 *   - a UUI dot/line grid background pattern,
 *   - a large faded background glyph (an oversized @untitledui/icon) that
 *     drifts slowly (`.cta-float`, reduced-motion safe),
 *   - on top: featured icon + eyebrow + display heading + supporting line
 *     + UUI primary/secondary buttons.
 *
 * Client component: the UUI `Button` is client-only, so icons are resolved
 * here from string keys rather than passed across the server boundary.
 */
const ICONS: Record<string, FC<{ className?: string }>> = {
  users: Users01,
  heart: Heart,
  image: Image03,
  announcement: Announcement02,
  play: PlayCircle,
  stars: Stars02,
};

export function CtaGradientBox({
  eyebrow,
  iconName = "users",
  title,
  supporting,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  pattern = "grid-check",
  gradientTitle = false,
  className,
}: {
  eyebrow?: string;
  iconName?: keyof typeof ICONS;
  title: ReactNode;
  supporting?: ReactNode;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** UUI background pattern laid over the gradient. */
  pattern?: "grid" | "grid-check" | "circle" | "square";
  /** Render the heading with the animated Ironbow gradient text. */
  gradientTitle?: boolean;
  className?: string;
}) {
  const Icon = ICONS[iconName] ?? Users01;
  const BgGlyph = Icon;

  return (
    <CtaSurface variant="drop-event" density="hero" marquee="CREATE · OWN · RUN · EVERYTHING" className={`cta-gradient-surface image-grain px-6 py-14 md:px-12 md:py-20 ${className ?? ""}`}>
      {/* UUI background grid pattern — faded into the gradient. */}
      <BackgroundPattern
        pattern={pattern}
        className="absolute left-1/2 top-0 -z-10 -translate-x-1/2 text-white/15 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_30%,#000,transparent)]"
      />
      {/* Oversized faded glyph drifting in the background. */}
      <BgGlyph
        aria-hidden
        className="cta-float pointer-events-none absolute -right-10 -bottom-12 -z-10 size-72 text-white/10 md:size-96"
      />
      {/* Soft top bloom for depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 -z-10 size-[640px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 65%)" }}
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <FeaturedIcon icon={Icon} size="xl" color="brand" theme="dark" />
        {eyebrow ? (
          <p className="mt-5 text-sm font-semibold tracking-wide text-white/80">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-white md:text-display-md">
          {gradientTitle ? <span className="gradient-text-core">{title}</span> : title}
        </h2>
        {supporting ? (
          <p className="mt-4 max-w-2xl text-lg text-white/85 md:mt-5">{supporting}</p>
        ) : null}
        <div className="mt-8 flex flex-col-reverse gap-3 self-stretch md:flex-row md:self-center">
          {secondaryLabel && secondaryHref ? (
            <Button color="secondary" size="xl" href={secondaryHref} className="shadow-xs! ring-0">
              {secondaryLabel}
            </Button>
          ) : null}
          <Button size="xl" href={primaryHref} iconTrailing={ArrowRight}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </CtaSurface>
  );
}

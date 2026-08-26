import type { FC, ReactNode } from "react";
import { ArrowUp, ArrowDown, ArrowUpRight } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";

/**
 * Premium Untitled UI metric card — the "by the numbers" building block.
 *
 * FeaturedIcon (or platform glyph) + label + big tabular value, with an
 * optional signed delta chip and an inline chart slot. Carries the
 * corporate surface treatment: rounded-2xl, ring-1 ring-inset ring-secondary,
 * shadow-xs at rest, and a confident hover lift (shadow-lg + -translate-y-0.5).
 *
 * `value` is a ReactNode so callers can drop an <AnimatedCounter /> in for
 * the scroll-triggered count-up while the card chrome stays consistent.
 *
 * Server-safe: no client hooks here. When `accent` is supplied the
 * FeaturedIcon tint is overridden inline so per-platform brand colors still
 * read while keeping the UUI shell.
 */
export type MetricCardProps = {
  icon?: FC<{ className?: string }> | ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  /** Signed delta string, e.g. "+12.4%" or "+1,204". */
  delta?: string;
  /** Direction drives the delta chip color + arrow glyph. */
  trend?: "up" | "down" | "neutral";
  /** Per-series brand hex. Tints the icon + a faint inset ring. */
  accent?: string;
  href?: string;
  /** Optional chart node rendered under the value (e.g. <Sparkbars />). */
  chart?: ReactNode;
  className?: string;
};

const trendClass = {
  up: "bg-success-secondary text-success-primary",
  down: "bg-error-secondary text-error-primary",
  neutral: "bg-tertiary text-tertiary",
} as const;

const trendIcon = {
  up: ArrowUp,
  down: ArrowDown,
  neutral: null,
} as const;

export function MetricCard({
  icon,
  label,
  value,
  unit,
  delta,
  trend = "up",
  accent,
  href,
  chart,
  className,
}: MetricCardProps) {
  const accentStyle = accent
    ? ({ boxShadow: `inset 0 0 0 1px ${accent}24` } as React.CSSProperties)
    : undefined;
  const TrendIcon = trendIcon[trend];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        {icon ? (
          <div style={accent ? ({ color: accent } as React.CSSProperties) : undefined}>
            <FeaturedIcon
              icon={icon}
              size="md"
              theme="modern"
              color="brand"
              className={accent ? "text-current" : undefined}
            />
          </div>
        ) : null}
        {href ? (
          <ArrowUpRight
            data-icon
            className="size-4 shrink-0 text-fg-quaternary transition-colors group-hover:text-fg-secondary"
          />
        ) : null}
      </div>

      <p className="mt-5 text-sm font-medium text-tertiary">{label}</p>

      <div className="mt-1.5 flex items-end gap-2">
        <span className="text-display-sm font-semibold tabular-nums tracking-tight text-primary">
          {value}
        </span>
        {unit ? (
          <span className="pb-1.5 text-sm font-medium text-quaternary">{unit}</span>
        ) : null}
      </div>

      {delta ? (
        <span
          className={cx(
            "mt-3.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            trendClass[trend],
          )}
        >
          {TrendIcon ? <TrendIcon className="size-3" /> : null}
          {delta}
        </span>
      ) : null}

      {chart ? <div className="mt-5">{chart}</div> : null}
    </>
  );

  const base =
    "group relative flex flex-col overflow-hidden rounded-2xl bg-primary p-6 ring-1 ring-secondary ring-inset shadow-xs transition-all duration-200 ease-out";

  if (href) {
    const external = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={cx(base, "hover:-translate-y-0.5 hover:shadow-lg", className)}
        style={accentStyle}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      className={cx(base, "hover:-translate-y-0.5 hover:shadow-lg", className)}
      style={accentStyle}
    >
      {inner}
    </div>
  );
}

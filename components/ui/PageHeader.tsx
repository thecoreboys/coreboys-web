import type { ReactNode } from "react";
import { Eyebrow } from "@/components/typography";

/**
 * Quiet page intro — mono eyebrow, display heading, optional lede.
 * No featured icons, no gradient blooms, no marketing pills.
 */
export function PageHeader({
  eyebrow,
  title,
  supporting,
  actions,
  meta,
}: {
  eyebrow: string;
  icon?: unknown;
  title: ReactNode;
  supporting?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-[color:var(--rule)]">
      <div className="mx-auto max-w-container px-6 py-12 md:px-16 md:py-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-4 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-[color:var(--ink)] md:text-[48px]">
              {title}
            </h1>
            {supporting ? (
              <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-[color:var(--ink-dim)] md:text-lg">
                {supporting}
              </p>
            ) : null}
            {meta ? (
              <div className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                {meta}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

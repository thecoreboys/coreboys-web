import type { ReactNode } from "react";

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
    <header className="page-intro border-b border-[color:var(--rule)]">
      <div className="page-intro__inner mx-auto max-w-container">
        <div className="page-intro__row flex flex-col md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="page-intro__eyebrow">{eyebrow}</p>
            <h1 className="font-display text-[color:var(--ink)]">
              {title}
            </h1>
            {supporting ? (
              <p className="page-intro__supporting">
                {supporting}
              </p>
            ) : null}
            {meta ? (
              <div className="page-intro__meta">
                {meta}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex min-w-0 flex-wrap items-center gap-3 md:max-w-[45%]">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

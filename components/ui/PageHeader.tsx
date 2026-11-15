import type { ReactNode } from "react";

/**
 * Shared page introduction with generous typography and a quiet ambient surface.
 * Decorative styling stays separate from the content and interactive actions.
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
    <header className="page-intro premium-page-header border-b border-[color:var(--rule)]">
      <div className="page-intro__inner mx-auto max-w-container">
        <div className="page-intro__row flex flex-col md:flex-row md:items-end md:justify-between">
          <div className="page-intro__copy min-w-0 max-w-3xl">
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
          {actions ? <div className="page-intro__actions flex min-w-0 flex-wrap items-center gap-3 md:max-w-[45%]">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

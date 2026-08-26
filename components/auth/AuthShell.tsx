"use client";

/**
 * Untitled UI sign-in / sign-up card. Uses the global TopNav — no second
 * wordmark, no full-bleed still fighting the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-md flex-col justify-center px-4 py-12 md:min-h-[calc(100svh-4rem)] md:py-16">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
          CORE
        </p>
        <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.03em] text-[color:var(--ink)] md:text-[40px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-dim)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="mt-8 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-6 shadow-xs-skeuomorphic sm:p-8">
        {children}
      </div>
      {footer ? (
        <p className="mt-6 text-center text-sm text-[color:var(--ink-dim)]">{footer}</p>
      ) : null}
    </div>
  );
}

export const authLabelClass = "mb-1.5 block text-sm font-medium text-secondary";
export const authFieldClass =
  "h-11 w-full rounded-xl bg-primary px-3.5 text-md text-primary shadow-none ring-1 ring-inset ring-primary placeholder:text-placeholder transition-shadow focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error_subtle";
export const authHelperClass = "mt-1 text-xs text-tertiary";
export const authErrorClass =
  "flex items-start gap-2 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg)] px-3.5 py-2.5 text-sm text-[color:var(--ink)]";

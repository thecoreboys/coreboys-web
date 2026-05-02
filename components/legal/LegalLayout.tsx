import type { ReactNode } from "react";

/**
 * Shared chrome for /legal/* pages. Editorial column, mono kicker, no
 * fluff. Effective-date banner up top so the document feels official.
 */
export function LegalLayout({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[760px] px-6 py-20 md:py-28">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        Legal · {title}
      </p>
      <h1 className="mt-2 font-display text-[40px] font-black leading-[0.95] tracking-[-0.04em] text-[color:var(--ink)] md:text-[64px]">
        {title}
      </h1>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
        Effective {effectiveDate} · Unofficial site · Not affiliated with The Core
      </p>
      <div className="legal-prose mt-8 space-y-5 text-[15px] leading-[1.75] text-[color:var(--ink-dim)] [&_a]:text-[color:var(--core)] [&_a]:underline-offset-2 [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-[20px] [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-[color:var(--ink)] [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-[color:var(--ink)] [&_strong]:text-[color:var(--ink)] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:my-0">
        {children}
      </div>
    </article>
  );
}

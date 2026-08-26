import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@untitledui/icons";

/**
 * Shared UUI-style page header for the /admin tools: back link, eyebrow,
 * display heading, supporting text, and a primary/secondary action slot.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  supporting,
  actions,
  backHref = "/admin",
  backLabel = "Admin",
}: {
  eyebrow: string;
  title: ReactNode;
  supporting?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(60% 50% at 25% 30%, rgba(219,3,104,0.08), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href={backHref as never}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-4" /> {backLabel}
            </Link>
            <p className="mt-3 text-sm font-semibold text-brand-secondary">{eyebrow}</p>
            <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
              {title}
            </h1>
            {supporting ? (
              <p className="mt-2 max-w-[60ch] text-md text-tertiary">{supporting}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}

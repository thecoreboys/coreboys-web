import type { FC, ReactNode } from "react";
import Link from "next/link";
import { FileShield02, Lock01, Scales01, Mail01, ArrowUpRight, Trash01 } from "@untitledui/icons";

type LegalKind = "privacy" | "terms" | "cookies" | "data-deletion";

const LEGAL_NAV: Array<{ kind: LegalKind; label: string; href: string; icon: FC<{ className?: string }> }> = [
  { kind: "privacy", label: "Privacy policy", href: "/legal/privacy", icon: Lock01 },
  { kind: "terms", label: "Terms of service", href: "/legal/terms", icon: Scales01 },
  { kind: "cookies", label: "Cookie policy", href: "/legal/cookies", icon: FileShield02 },
  { kind: "data-deletion", label: "Data deletion", href: "/legal/data-deletion", icon: Trash01 },
];

const KIND_ICON: Record<LegalKind, FC<{ className?: string }>> = {
  privacy: Lock01,
  terms: Scales01,
  cookies: FileShield02,
  "data-deletion": Trash01,
};

/**
 * Shared, theme-aware document layout for the legal pages. Keep the hierarchy
 * quiet and editorial so policy pages read like documents, not landing pages.
 */
export function LegalLayout({
  title,
  effectiveDate,
  kind,
  children,
}: {
  title: string;
  effectiveDate: string;
  kind: LegalKind;
  children: ReactNode;
}) {
  const HeaderIcon = KIND_ICON[kind];

  return (
    <main className="legal-page">
      <header className="legal-page-header">
        <div className="legal-page-width">
          <div className="legal-title-row">
            <HeaderIcon className="legal-title-icon" aria-hidden="true" />
            <div>
              <p className="legal-kicker">Policies &amp; your data</p>
              <h1>{title}</h1>
              <p className="legal-updated">Last updated <time dateTime={effectiveDate}>{effectiveDate}</time></p>
            </div>
          </div>
        </div>
      </header>

      <div className="legal-page-width legal-page-grid">
        <aside className="legal-sidebar">
          <nav aria-label="Legal documents" className="legal-nav">
            {LEGAL_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.kind === kind;
              return (
                <Link
                  key={item.kind}
                  href={item.href as never}
                  aria-current={active ? "page" : undefined}
                  className="legal-nav-link"
                  data-active={active ? "true" : undefined}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="legal-contact">
            <Mail01 className="size-[18px] text-brand-secondary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-primary">Need help with a privacy request?</p>
            <a
              href="mailto:privacy@thecoreboys.com"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-secondary transition-colors hover:underline"
            >
              privacy@thecoreboys.com
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </aside>

        <article className="legal-document">
          <div className="legal-prose">
            {children}
          </div>

          <footer className="legal-document-footer">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-secondary transition-colors hover:underline"
            >
              Back to home
              <ArrowUpRight className="size-4" />
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}

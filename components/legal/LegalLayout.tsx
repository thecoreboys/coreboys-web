import type { FC, ReactNode } from "react";
import Link from "next/link";
import { FileShield02, Lock01, Scales01, Mail01, ArrowUpRight, Trash01 } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";

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
 * Untitled UI informational page chrome for /legal/*. UUI section header
 * (eyebrow + featured icon + display heading + supporting text), a
 * sticky sidebar that cross-links the legal pages, and the document body
 * rendered inside a rounded-2xl UUI surface card with a real shadow.
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
    <div className="relative bg-primary">
      {/* Page header band — UUI section header on bg-secondary. */}
      <div className="border-b border-secondary bg-secondary">
        <div className="mx-auto max-w-[1100px] px-6 py-16 md:px-8 md:py-20">
          <p className="text-sm font-semibold text-brand-secondary">Legal center</p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:gap-6">
            <FeaturedIcon icon={HeaderIcon} size="xl" color="brand" theme="dark" />
            <div className="flex-1">
              <h1 className="text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-tertiary">
                The plain-language version of how thecoreboys.com operates. An unofficial CORE fan
                site — not affiliated with CORE or its members.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Badge type="pill-color" color="brand" size="lg">
                  Effective {effectiveDate}
                </Badge>
                <Badge type="pill-color" color="gray" size="lg">
                  Unofficial site
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 px-6 py-12 md:px-8 md:py-16 lg:grid-cols-[260px_1fr] lg:gap-12">
        {/* Sticky sidebar nav — cross-links the legal pages. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="flex flex-col gap-1.5">
            {LEGAL_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.kind === kind;
              return (
                <Link
                  key={item.kind}
                  href={item.href as never}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all",
                    active
                      ? "bg-brand-solid text-white shadow-xs-skeuomorphic"
                      : "text-tertiary hover:bg-secondary hover:text-primary",
                  ].join(" ")}
                >
                  <Icon className="size-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-secondary bg-secondary p-5 shadow-xs-skeuomorphic">
            <FeaturedIcon icon={Mail01} size="md" color="brand" theme="modern" />
            <p className="mt-3 text-sm font-semibold text-primary">Questions?</p>
            <p className="mt-1 text-sm text-tertiary">
              Reach the maintainers about access, deletion, or anything legal.
            </p>
            <a
              href="mailto:privacy@thecoreboys.com"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary transition-colors hover:text-brand-secondary_hover"
            >
              privacy@thecoreboys.com
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </aside>

        {/* Document body — UUI surface card + prose. */}
        <article className="rounded-2xl border border-secondary bg-primary p-6 shadow-lg md:p-10">
          <div className="legal-prose space-y-5 text-md leading-[1.75] text-tertiary [&_a]:font-medium [&_a]:text-brand-secondary [&_a]:underline-offset-2 [&_a:hover]:underline [&_code]:rounded-md [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-secondary [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-primary [&_h3]:mt-7 [&_h3]:text-md [&_h3]:font-semibold [&_h3]:text-primary [&_strong]:font-semibold [&_strong]:text-primary [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:my-0 [&_li]:marker:text-brand-secondary">
            {children}
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-secondary pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-quaternary">
              Last updated {effectiveDate} · thecoreboys.com
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary transition-colors hover:text-brand-secondary_hover"
            >
              Back to home
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}

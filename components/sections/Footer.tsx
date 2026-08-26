"use client";

import Link from "next/link";
import type { Route } from "next";
import { GROUP } from "@/lib/group";
import { Eyebrow } from "@/components/typography";
import { RawToggle } from "@/components/editorial/RawToggle";
import { CookieSettingsLink } from "@/components/legal/CookieSettingsLink";

const ELSEWHERE: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "YouTube", href: GROUP.socials.youtube.url, external: true },
  { label: "TikTok", href: GROUP.socials.tiktok.url, external: true },
  { label: "Instagram", href: GROUP.socials.instagram.url, external: true },
  { label: "X", href: GROUP.socials.x.url, external: true },
  { label: "Watch", href: "/" },
];

const INDEX: Array<{ label: string; href: Route | `/#${string}` }> = [
  { label: "Watch", href: "/" },
  { label: "Guide", href: "/guide" },
  { label: "Videos", href: "/videos" },
  { label: "Clips", href: "/clips" },
  { label: "News", href: "/news" },
  { label: "Fan mail", href: "/fan-mail" },
];

export function Footer() {
  return (
    <footer
      id="footer"
      className="relative flex w-full flex-col bg-[color:var(--bg)] rule"
      style={{ minHeight: "60vh" }}
    >
      <div className="mx-auto flex w-full max-w-container flex-1 flex-col justify-between gap-16 px-6 py-20 md:px-16 md:py-28">
        <div className="flex flex-col items-start gap-8">
          <p className="font-logo wordmark-fill text-[18vw] leading-[0.9] md:text-[120px]">
            CORE
          </p>
          <Link
            href={"/" as Route}
            className="group inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink)]"
          >
            <span className="block h-px w-12 bg-current transition-[width] duration-300 [transition-timing-function:var(--ease-out)] group-hover:w-20" />
            Watch
          </Link>
        </div>

        <div className="flex flex-col gap-10">
          <nav
            aria-label="CORE elsewhere"
            className="flex flex-wrap items-center gap-x-3 gap-y-3 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]"
          >
            {ELSEWHERE.map((item, i) => (
              <span key={item.label} className="inline-flex items-center gap-3">
                {i > 0 ? (
                  <span aria-hidden className="text-[color:var(--ink-faint)]">
                    ·
                  </span>
                ) : null}
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[color:var(--ink)]"
                    data-cursor="hover"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href as Route} className="hover:text-[color:var(--ink)]" data-cursor="hover">
                    {item.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <nav
            aria-label="Site"
            className="flex flex-wrap gap-x-6 gap-y-3 border-t border-[color:var(--rule)] pt-8 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]"
          >
            {INDEX.map((item) => (
              <Link key={item.href} href={item.href as Route} className="hover:text-[color:var(--ink)]">
                {item.label}
              </Link>
            ))}
          </nav>

          <nav
            aria-label="Legal"
            className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)]"
          >
            <Link href={"/legal/terms" as Route} className="hover:text-[color:var(--ink)]">
              Terms of service
            </Link>
            <Link href={"/legal/privacy" as Route} className="hover:text-[color:var(--ink)]">
              Privacy policy
            </Link>
            <Link href={"/legal/cookies" as Route} className="hover:text-[color:var(--ink)]">
              Cookie policy
            </Link>
            <Link href={"/legal/data-deletion" as Route} className="hover:text-[color:var(--ink)]">
              Data deletion
            </Link>
            <CookieSettingsLink className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]" />
          </nav>

          <div className="border-t border-[color:var(--rule)] pt-8">
            <p className="font-display text-lg font-bold tracking-[-0.01em] text-[color:var(--ink)]">
              The Official Unofficial Website of CORE.
            </p>
            <Eyebrow className="mt-2 block text-[color:var(--ink-dim)]">
              Create. Own. Run. Everything.
            </Eyebrow>
          </div>

          <div className="flex flex-col items-start gap-3 border-t border-[color:var(--rule)] pt-8 text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)] md:flex-row md:items-center md:justify-between">
            <p className="font-mono">
              © {new Date().getFullYear()} · Unofficial site · Not affiliated with Core
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://x.com/berryeyu"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono hover:text-[color:var(--ink)]"
              >
                Website by MDCran ↗
              </a>
              <RawToggle />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

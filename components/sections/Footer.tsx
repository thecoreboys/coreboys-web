"use client";

import Link from "next/link";
import type { Route } from "next";
import { GROUP_SOCIALS } from "@coreboys/shared";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";
import { Display, Eyebrow } from "@/components/typography";
import { RawToggle } from "@/components/editorial/RawToggle";
import { CookieSettingsLink } from "@/components/legal/CookieSettingsLink";

type GroupSocialPlatform = "youtube" | "tiktok" | "instagram" | "x";

export function Footer() {
  return (
    <footer
      id="footer"
      className="relative flex w-full flex-col bg-[color:var(--bg)] rule"
      style={{ minHeight: "60vh" }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-between gap-12 px-6 py-20 md:px-16 md:py-28">
        {/* Wordmark — sized to break the gutter intentionally on desktop */}
        <Display
          as="h2"
          size={200}
          className="wordmark-fill text-[36vw] leading-[0.85] md:text-[280px]"
        >
          CORE
        </Display>

        <div className="flex flex-col gap-10">
          {/* Oversized line glyphs (simple-icons) */}
          <div className="flex flex-wrap items-center gap-6">
            {GROUP_SOCIALS.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`CORE on ${PLATFORM_LABEL[s.platform as GroupSocialPlatform]}`}
                data-cursor="hover"
                className="group inline-flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition-all hover:-translate-y-0.5 hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] md:h-20 md:w-20"
              >
                <SocialIcon platform={s.platform as GroupSocialPlatform} size={28} />
              </a>
            ))}
          </div>

          {/* Site index */}
          <nav
            aria-label="Site"
            className="flex flex-wrap gap-x-6 gap-y-3 border-t border-[color:var(--rule)] pt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]"
          >
            <Link href={"/blog" as Route} className="hover:text-[color:var(--ink)]">
              Words
            </Link>
            <Link href={"/links" as Route} className="hover:text-[color:var(--ink)]">
              Links
            </Link>
            <Link href={"/fan-mail" as Route} className="hover:text-[color:var(--ink)]">
              Fan mail
            </Link>
            <a href="#live" className="hover:text-[color:var(--ink)]">
              Live
            </a>
          </nav>

          {/* Legal nav */}
          <nav
            aria-label="Legal"
            className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]"
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
            <CookieSettingsLink className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]" />
          </nav>

          {/* Address + corp block */}
          <div className="border-t border-[color:var(--rule)] pt-8">
            <p className="font-display text-[18px] font-bold tracking-[-0.01em] text-[color:var(--ink)]">
              The Official Unofficial Website of CORE.
            </p>
            <Eyebrow className="mt-2 block text-[color:var(--ink-dim)]">
              Create. Own. Run. Everything.
            </Eyebrow>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col items-start gap-3 border-t border-[color:var(--rule)] pt-8 text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)] md:flex-row md:items-center md:justify-between">
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

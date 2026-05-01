"use client";

import { GROUP_SOCIALS } from "@coreboys/shared";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";
import { Display, Eyebrow } from "@/components/typography";
import { RawToggle } from "@/components/editorial/RawToggle";

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
                aria-label={`The Core Boys on ${PLATFORM_LABEL[s.platform as GroupSocialPlatform]}`}
                data-cursor="hover"
                className="group inline-flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition-all hover:-translate-y-0.5 hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] md:h-20 md:w-20"
              >
                <SocialIcon platform={s.platform as GroupSocialPlatform} size={28} />
              </a>
            ))}
          </div>

          {/* Bottom row */}
          <div className="flex flex-col items-start gap-6 border-t border-[color:var(--rule)] pt-8 md:flex-row md:items-center md:justify-between">
            <Eyebrow>
              © {new Date().getFullYear()} The Core Boys · Create. Own. Run. Everything.
            </Eyebrow>
            <div className="flex items-center gap-6">
              <Eyebrow className="text-[color:var(--ink-faint)]">
                Built in the house.
              </Eyebrow>
              <RawToggle />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

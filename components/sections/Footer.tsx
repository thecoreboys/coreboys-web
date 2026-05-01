"use client";

import { GROUP_SOCIALS } from "@coreboys/shared";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";

type GroupSocialPlatform = "youtube" | "tiktok" | "instagram" | "x";

export function Footer() {
  return (
    <footer className="relative w-full bg-[color:var(--bg)] py-32 md:py-44 rule">
      <div className="mx-auto max-w-7xl px-6">
        <h2
          className="font-display text-[28vw] md:text-[18rem] leading-[0.85] font-black tracking-[-0.04em] text-[color:var(--ink)]"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #ffffff 0%, color-mix(in oklab, #ffffff 30%, var(--core) 70%) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          CORE
        </h2>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          {GROUP_SOCIALS.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`The Core Boys on ${PLATFORM_LABEL[s.platform as GroupSocialPlatform]}`}
              className="group inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--rule)] text-[color:var(--ink-dim)] transition hover:-translate-y-0.5 hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]"
            >
              <SocialIcon platform={s.platform as GroupSocialPlatform} size={18} />
            </a>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-[color:var(--rule)] pt-6 md:flex-row md:items-center md:justify-between">
          <span className="kicker">© {new Date().getFullYear()} The Core Boys · Create. Own. Run. Everything.</span>
          <span className="kicker text-[color:var(--ink-dim)]">Built in the house.</span>
        </div>
      </div>
    </footer>
  );
}

import Image from "next/image";
import { ArrowDown, LinkExternal01 } from "@untitledui/icons";
import { getHeroGroupPhoto } from "@/lib/asset-index";
import { BadgeWithDot } from "@/components/base/badges/badges";

const GROUP_SOCIALS = [
  { label: "YouTube", url: "https://www.youtube.com/@createownruneverything" },
  { label: "TikTok", url: "https://www.tiktok.com/@officialcoreboys" },
  { label: "X / Twitter", url: "https://x.com/thecoreboys" },
  { label: "Instagram", url: "https://www.instagram.com/createownruneverything" },
];

/**
 * Editorial hero — wordmark left, group photo right, group socials row
 * underneath. No video, no R3F: the photo and the typography do the
 * work. Status indicator pulses next to "Content Organization" pill.
 */
export function HeroEditorial() {
  const photo = getHeroGroupPhoto();

  return (
    <section
      id="hero"
      className="relative overflow-hidden border-b border-[color:var(--rule)]"
    >
      {/* warm radial glow behind the wordmark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 22% 38%, rgba(255,59,31,0.08), transparent 60%), radial-gradient(50% 40% at 90% 110%, rgba(255,59,31,0.05), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-container px-6 pt-24 pb-16 md:px-12 md:pt-32 md:pb-24">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12 lg:gap-x-10">
          {/* LEFT — wordmark + manifesto + group socials */}
          <div className="col-span-12 lg:col-span-7 ed-reveal" style={{ animationDelay: "120ms" }}>
            <BadgeWithDot type="pill-color" color="error" size="md">
              Content Organization · est. 2024
            </BadgeWithDot>

            <h1 className="mt-7 font-display tracking-tight">
              <span className="block font-mono text-[clamp(11px,1.2vw,15px)] tracking-[0.5em] uppercase text-[color:var(--core)] mb-5 sm:mb-7 lg:mb-9">
                THE
              </span>
              <span className="flex items-end gap-3 sm:gap-5">
                <span className="text-display text-[24vw] leading-[0.78] sm:text-[18vw] lg:text-[clamp(180px,16vw,280px)] [text-shadow:0_2px_30px_rgba(0,0,0,0.7)]">
                  CORE
                </span>
                <span className="pb-3 sm:pb-5 lg:pb-7 font-mono text-[clamp(14px,1.6vw,22px)] tracking-[0.45em] uppercase text-[color:var(--ink)]/85">
                  BOYS
                </span>
              </span>
            </h1>

            <p className="mt-6 text-display text-[clamp(28px,4vw,56px)] leading-[1.02] text-balance">
              <span className="text-[color:var(--core)]">Create</span>
              <span className="opacity-30">.</span>{" "}
              <span>Own</span>
              <span className="opacity-30">.</span>{" "}
              <span>Run</span>
              <span className="opacity-30">.</span>{" "}
              <span>Everything</span>
              <span className="opacity-30">.</span>
            </p>

            <p className="mt-6 max-w-[58ch] text-md leading-relaxed text-[color:var(--ink-dim)]">
              Six creators, one house. Marlon, Stable Ronaldo, Adapt, Jason
              TheWeen, Lacy and Silky — built, owned and run by the people on
              screen.
            </p>

            <div className="mt-10">
              <p className="eyebrow">Group socials</p>
              <ul className="mt-4 grid max-w-[460px] grid-cols-2 gap-2">
                {GROUP_SOCIALS.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-3 border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/40 px-3 py-2.5 transition-colors hover:border-[color:var(--core)] hover:bg-[color:var(--bg-elev)]"
                    >
                      <span className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink)]">
                        {s.label}
                      </span>
                      <LinkExternal01
                        className="size-3 text-[color:var(--ink-dim)] transition-colors group-hover:text-[color:var(--core)]"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* RIGHT — group photo */}
          <div
            className="col-span-12 lg:col-span-5 lg:pl-2 ed-reveal"
            style={{ animationDelay: "320ms" }}
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden border border-[color:var(--rule)] bg-black darkroom">
              <Image
                src={photo}
                alt="CORE group photo"
                fill
                sizes="(max-width: 1024px) 100vw, 42vw"
                priority
                className="object-cover"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 60%, rgba(10,9,8,0.7) 100%)",
                }}
              />
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink)]/85">
                  COR — 001
                </span>
              </div>
              <div className="absolute right-3 top-3">
                <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink)]/85">
                  Group · Members
                </span>
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink)]/85">
                  HOUSE · UNDISCLOSED
                </span>
                <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink)]/85">
                  6 / 6
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 flex items-end justify-between gap-4 border-t border-[color:var(--rule)] pt-5">
          <p className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink-dim)]">
            File · CORE · 2026
          </p>
          <a
            href="#roster"
            className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink)] transition-colors hover:text-[color:var(--core)]"
          >
            <span className="inline-block h-px w-10 bg-current transition-[width] duration-300 group-hover:w-16" />
            Roll call
            <ArrowDown className="size-3" />
          </a>
        </div>
      </div>
    </section>
  );
}

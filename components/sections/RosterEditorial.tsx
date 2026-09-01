import Image from "next/image";
import Link from "next/link";
import { MEMBERS } from "@/lib/members";

/**
 * Six-up roster grid. Photos are grayscale by default and color-up on
 * hover; the member's stage name flips to their accent. The card outline
 * also picks up the accent so the whole tile feels "on" when targeted.
 *
 * Each cell links to /about/{slug}. The grid is single-row at xl, 3-up at
 * md, 2-up at small viewports.
 */
export function RosterEditorial() {
  return (
    <section id="roster" className="relative mx-auto max-w-container px-6 py-24 md:px-12 md:py-32">
      <header className="mb-10 grid grid-cols-12 items-end gap-6">
        <div className="col-span-12 md:col-span-7">
          <p className="eyebrow">Roll Call · 01</p>
          <h2 className="mt-3 text-display text-[clamp(56px,9vw,140px)] leading-[0.9]">
            The roster<span className="text-[color:var(--core)]">.</span>
          </h2>
        </div>
        <div className="col-span-12 md:col-span-5 md:text-right">
          <p className="text-display text-[clamp(22px,2.6vw,38px)] leading-[1.1]">
            <span className="block">
              Six creators.{" "}
              <span className="text-[color:var(--core)]">One house.</span>
            </span>
            <span className="block text-[color:var(--ink-dim)]">
              Built, owned and run by the people on screen.
            </span>
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-px overflow-hidden border border-[color:var(--rule)] bg-[color:var(--rule)] sm:grid-cols-3 xl:grid-cols-6">
        {MEMBERS.map((m) => (
          <li
            key={m.slug}
            className="roster-card relative bg-[color:var(--bg)]"
            style={{ ["--card-accent" as string]: m.accent }}
          >
            <Link
              href={`/channels/${m.slug}` as never}
              className="block h-full"
              aria-label={`Open ${m.stageName} (${m.realName})`}
            >
              <article className="flex h-full flex-col">
                <div className="relative block aspect-[4/5] overflow-hidden bg-black">
                  <Image
                    src={m.portrait}
                    alt={`${m.stageName} — ${m.realName}, CORE member portrait`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 16vw"
                    className="roster-photo object-cover"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 55%, rgba(10,9,8,0.92) 100%)",
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                    style={{
                      background:
                        "repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)",
                    }}
                  />

                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink-dim)]">
                      {m.index}
                    </span>
                  </div>
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    <span
                      className="relative h-6 w-6"
                      title={`${m.comm.name} comm`}
                    >
                      <Image
                        src={m.comm.logo}
                        alt={`${m.comm.name} comm logo`}
                        fill
                        sizes="24px"
                        className="object-contain"
                      />
                    </span>
                  </div>

                  <div className="absolute inset-x-3 bottom-3">
                    <h3 className="roster-name text-display text-[clamp(28px,3vw,44px)] leading-[0.88] text-[color:var(--ink)]">
                      {m.stageName}
                    </h3>
                    <p className="mt-1 font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink-dim)]">
                      {m.realName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink-dim)]">
                    Comm · {m.comm.name}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--ink-dim)] transition-opacity group-hover:opacity-100"
                    style={{ color: m.accent }}
                  >
                    Open
                    <svg viewBox="0 0 16 16" className="size-2.5" aria-hidden>
                      <path
                        d="M3 8h10M9 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="square"
                      />
                    </svg>
                  </span>
                </div>
              </article>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

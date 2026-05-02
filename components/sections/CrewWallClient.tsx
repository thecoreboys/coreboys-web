"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type CrewWallItem = {
  slug: string;
  name: string;
  roleLabel: string;
  portrait: string | null;
  accent: string;
  works: Array<{ slug: string; stageName: string; accent: string; avatarUrl?: string }>;
};

/**
 * Client-side crew wall — handles hover affordances. Server component
 * (`CrewWall`) computes the data shape and passes it through.
 */
export function CrewWallClient({ items }: { items: CrewWallItem[] }) {
  return (
    <section
      id="crew"
      className="relative border-t border-[color:var(--rule)] bg-[color:var(--bg)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 35% at 80% 0%, rgba(99,102,241,0.06), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-6 py-20 md:px-8 md:py-28">
        <header className="mb-10 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 md:col-span-7">
            <p className="eyebrow">Behind the scenes · Crew</p>
            <h2 className="mt-3 text-display text-[clamp(36px,5vw,64px)] font-black leading-[0.95] tracking-[-0.04em] text-[color:var(--ink)]">
              The crew.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-5 md:text-right">
            <p className="text-[15px] leading-relaxed text-[color:var(--ink-dim)] md:text-[16px]">
              Camera ops, editors and managers.
              <br />
              The entertainment exists because they show up.
            </p>
          </div>
        </header>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/crew/${c.slug}` as `/crew/${string}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-all duration-500"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = c.accent;
                  e.currentTarget.style.boxShadow = `0 24px 60px -24px ${c.accent}99, inset 0 0 0 1px ${c.accent}66`;
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.boxShadow = "";
                  e.currentTarget.style.transform = "";
                }}
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-black media-tone">
                  {c.portrait ? (
                    <Image
                      src={c.portrait}
                      alt={c.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover grayscale-[0.45] transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.04]"
                      style={{ objectPosition: "50% 30%" }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[color:var(--bg)]">
                      <span className="text-display text-[64px] font-black text-[color:var(--ink-faint)]">
                        {c.name
                          .split(" ")
                          .map((n) => n[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")}
                      </span>
                    </div>
                  )}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 50%, rgba(8,8,10,0.95) 100%)",
                    }}
                  />
                  <span
                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: c.accent, color: "#fff" }}
                    aria-hidden
                  >
                    <ArrowUpRight size={12} />
                  </span>
                  <div className="absolute inset-x-3 bottom-3">
                    <h3 className="text-display text-[20px] font-bold leading-tight tracking-tight text-on-image">
                      {c.name}
                    </h3>
                    <p className="mt-0.5 text-[11px] font-medium text-on-image-dim">
                      {c.roleLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5">
                  {c.works.length > 0 ? (
                    <span className="inline-flex items-center gap-2 text-[11px] text-[color:var(--ink-dim)]">
                      Rides with
                      <span className="inline-flex items-center gap-1">
                        {c.works.map((m) => (
                          <span key={m.slug} className="group/avatar relative inline-flex">
                            {m.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.avatarUrl}
                                alt={m.stageName}
                                className="h-6 w-6 rounded-full ring-2 ring-inset transition-transform duration-200 group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-110"
                                style={{ ["--tw-ring-color" as string]: m.accent }}
                              />
                            ) : (
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-inset text-[10px] font-bold"
                                style={{
                                  ["--tw-ring-color" as string]: m.accent,
                                  color: m.accent,
                                  background: "rgba(8,8,10,0.6)",
                                }}
                              >
                                {m.stageName[0]}
                              </span>
                            )}
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity group-hover/avatar:opacity-100"
                            >
                              {m.stageName}
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-[color:var(--ink-dim)]">Crew</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)]">
                    Open profile
                    <ArrowUpRight size={11} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

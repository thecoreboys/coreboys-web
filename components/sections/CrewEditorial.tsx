import Image from "next/image";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { getCrewPortrait } from "@/lib/asset-index";
import { getCrewRoleLabel } from "@/lib/crew";
import { SocialIcon, PLATFORM_LABEL } from "@/components/ui/SocialIcon";

/**
 * Behind-the-lens crew section. Each crew member gets a 3:4 portrait,
 * a name, the role, the member they ride with (in that member's accent
 * color), and links to their socials. Cameramen first, management second.
 *
 * Photos come from /public/crew/{slug}/ via getCrewPortrait — the asset
 * index sorts alphabetically and the first file is treated as the
 * primary headshot. Falls back to a stylized initials block when no
 * photo is present.
 */
export function CrewEditorial() {
  // Sort: cameramen first, then management, then anything else.
  const order = (role: string) =>
    role === "cameraman" ? 0 : role === "management" ? 1 : 2;
  const sorted = [...CREW].sort(
    (a, b) => order(a.role) - order(b.role) || a.slug.localeCompare(b.slug),
  );

  return (
    <section
      id="crew"
      className="relative border-t border-[color:var(--rule)] bg-[color:var(--bg)] py-24 md:py-32"
    >
      <div className="mx-auto max-w-container px-6 md:px-12">
        <header className="mb-12 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 md:col-span-7">
            <p className="eyebrow">Behind The Lens · 02</p>
            <h2 className="mt-3 text-display text-[clamp(56px,9vw,140px)] leading-[0.9]">
              The crew<span className="text-[color:var(--core)]">.</span>
            </h2>
          </div>
          <div className="col-span-12 md:col-span-5 md:text-right">
            <p className="text-display text-[clamp(20px,2.4vw,32px)] leading-[1.1] text-[color:var(--ink-dim)]">
              <span className="block">
                Camera ops, editors,{" "}
                <span className="text-[color:var(--ink)]">managers.</span>
              </span>
              <span className="block">
                The crew that lives the same hours and sleeps the same shifts.
              </span>
            </p>
          </div>
        </header>

        <ul className="grid grid-cols-2 gap-px overflow-hidden border border-[color:var(--rule)] bg-[color:var(--rule)] sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((c) => {
            const portrait = getCrewPortrait(c.slug);
            const roleLabel = getCrewRoleLabel(c);
            const works = c.worksWith
              .map((slug) => MEMBERS_BY_SLUG[slug])
              .filter((m): m is NonNullable<typeof m> => !!m);
            const accent = works[0]?.accent ?? "var(--core)";

            return (
              <li
                key={c.slug}
                className="group relative flex flex-col bg-[color:var(--bg)]"
                style={{ ["--card-accent" as string]: accent }}
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-[color:var(--bg-elev)]">
                  {portrait ? (
                    <Image
                      src={portrait}
                      alt={`${c.name} — ${roleLabel}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover grayscale-[0.55] transition-[filter,transform] duration-700 group-hover:scale-[1.025] group-hover:grayscale-0"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[color:var(--bg-elev)]">
                      <span className="text-display text-[64px] text-[color:var(--ink-faint)]">
                        {c.name
                          .split(" ")
                          .map((n) => n[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")}
                      </span>
                    </div>
                  )}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 55%, rgba(10,9,8,0.95) 100%)",
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
                      {roleLabel}
                    </span>
                  </div>

                  <div className="absolute inset-x-3 bottom-3">
                    <h3
                      className="text-display text-[clamp(28px,2.4vw,38px)] leading-[0.88] text-[color:var(--ink)] transition-colors group-hover:text-[var(--card-accent)]"
                      style={{ ["--card-accent" as string]: accent }}
                    >
                      {c.name}
                    </h3>
                    {works.length > 0 ? (
                      <p className="mt-1 font-mono text-xs tracking-[0.22em] uppercase">
                        <span className="text-[color:var(--ink-dim)]">Rides with </span>
                        {works.map((m, i) => (
                          <span key={m.slug} style={{ color: m.accent }}>
                            {m.stageName}
                            {i < works.length - 1 ? <span className="text-[color:var(--ink-faint)]"> · </span> : null}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[color:var(--rule)] px-3 py-3">
                  <span className="font-mono text-xs tracking-[0.22em] uppercase text-[color:var(--ink-dim)]">
                    {c.socials.length} {c.socials.length === 1 ? "link" : "links"}
                  </span>
                  <ul className="flex items-center gap-1.5">
                    {c.socials.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${c.name} on ${PLATFORM_LABEL[s.platform as "x" | "instagram"]}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ink-dim)] ring-1 ring-inset ring-[color:var(--rule)] transition-colors hover:text-[color:var(--ink)] hover:ring-[color:var(--ink)]"
                        >
                          <SocialIcon platform={s.platform as "x" | "instagram"} size={12} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

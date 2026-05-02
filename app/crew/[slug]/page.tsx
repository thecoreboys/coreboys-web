import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { getCrewPhotos, getCrewPortrait } from "@/lib/asset-index";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PlatformLink, type PlatformKey } from "@/components/ui/PlatformLink";
import { AutoScrollGallery } from "@/components/ui/AutoScrollGallery";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return CREW.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = CREW.find((x) => x.slug === slug);
  if (!c) return {};
  return {
    title: `${c.name} — CORE Crew`,
    description: `${c.name}, ${c.role}, working with ${c.worksWith.map((s) => MEMBERS_BY_SLUG[s]?.stageName).filter(Boolean).join(", ")}.`,
    alternates: { canonical: `/crew/${c.slug}` },
  };
}

const ROLE_COPY: Record<string, string> = {
  cameraman: "Cameraman",
  management: "Management",
  editor: "Editor",
  producer: "Producer",
};

/**
 * Comm logo PNGs ship with different amounts of internal padding;
 * per-comm scale brings them roughly to parity in the chip. Mirrors the
 * helper on the member page so the visual treatment is identical.
 */
function commScaleFor(name: string): number {
  switch (name.toLowerCase()) {
    case "m3":
      return 1.45;
    case "flock":
      return 1.4;
    case "stable":
    case "thugs":
    case "nms":
    case "slg":
      return 1.05;
    default:
      return 1;
  }
}

export default async function CrewMemberPage({ params }: Params) {
  const { slug } = await params;
  const c = CREW.find((x) => x.slug === slug);
  if (!c) notFound();

  const photos = getCrewPhotos(c.slug);
  const portrait = photos[0];
  const works = c.worksWith
    .map((s) => MEMBERS_BY_SLUG[s])
    .filter((m): m is NonNullable<typeof m> => !!m);
  const accent = works[0]?.accent ?? "#a1a1aa";
  const roleLabel = ROLE_COPY[c.role] ?? c.role;

  // Twitch profile pictures for the linked-member mention chips.
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(works.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  // Other crew (excluding this one), for the bottom rail.
  const otherCrew = CREW.filter((x) => x.slug !== c.slug);

  return (
    <main className="relative pt-20 md:pt-24">
      {/* HERO — mirrors /m/[slug]: layered blooms + lens flares + isolation. */}
      <section className="relative overflow-hidden border-b border-[color:var(--rule)] bg-dot-grid">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(50% 40% at 22% 30%, ${accent}33, transparent 60%), radial-gradient(40% 35% at 80% 12%, rgba(99,102,241,0.16), transparent 70%), radial-gradient(45% 30% at 50% 100%, ${accent}22, transparent 75%)`,
          }}
        />
        <div
          aria-hidden
          className="lens-flare h-[520px] w-[520px]"
          style={{
            left: "-8%",
            top: "20%",
            ["--flare" as string]: `${accent}cc`,
          }}
        />
        <div
          aria-hidden
          className="lens-flare h-[380px] w-[380px]"
          style={{
            right: "-4%",
            top: "0%",
            ["--flare" as string]: "rgba(99,102,241,0.55)",
          }}
        />
        <div
          className="relative z-10 mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16"
          style={{ isolation: "isolate" }}
        >
          <Link
            href="/#crew"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={12} /> Crew
          </Link>

          <div className="mt-8 grid grid-cols-12 gap-8 md:gap-12">
            <div className="col-span-12 md:col-span-5">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black media-tone">
                {portrait ? (
                  <Image
                    src={portrait}
                    alt={c.name}
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 40vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[color:var(--bg-elev)]">
                    <span className="text-display text-[120px] font-bold text-[color:var(--ink-faint)]">
                      {c.name
                        .split(" ")
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")}
                    </span>
                  </div>
                )}
                <span className="absolute left-3 top-3 tag">{roleLabel}</span>
              </div>
            </div>

            <div className="col-span-12 md:col-span-7">
              <h1
                className="text-display whitespace-nowrap font-black leading-[0.92] tracking-[-0.05em] text-[color:var(--ink)]"
                style={{
                  fontSize: "clamp(36px, 7vw, 96px)",
                  textShadow: "0 2px 24px rgba(0,0,0,0.55)",
                }}
              >
                {c.name}
              </h1>
              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                <div className="inline-flex items-center gap-2">
                  <dt className="text-[color:var(--ink-faint)]">Role</dt>
                  <dd className="text-[color:var(--ink)]">{roleLabel}</dd>
                </div>
                {works.length > 0 ? (
                  <div className="inline-flex items-center gap-2">
                    <dt className="text-[color:var(--ink-faint)]">Rides with</dt>
                    <dd className="inline-flex items-center gap-1.5">
                      {works.map((m) => {
                        const avatar = avatars[m.twitchLogin.toLowerCase()] ?? m.portrait;
                        return (
                          <Link
                            key={m.slug}
                            href={`/m/${m.slug}` as `/m/${string}`}
                            className="group/avatar relative inline-flex"
                            title={m.stageName}
                          >
                            <Image
                              src={avatar}
                              alt={m.stageName}
                              width={22}
                              height={22}
                              className="h-[22px] w-[22px] rounded-full ring-2 ring-inset transition-transform duration-200 group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-110"
                              style={{ ["--tw-ring-color" as string]: m.accent }}
                            />
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity group-hover/avatar:opacity-100"
                            >
                              {m.stageName}
                            </span>
                          </Link>
                        );
                      })}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {/* Comm chip — surfaced from the linked member. Same big plate
                  the member page uses, so the visual rhythm is identical. */}
              {works.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {works.map((m) => (
                    <span
                      key={m.slug}
                      className="inline-flex items-center gap-3 rounded-lg border px-3 py-2"
                      style={{
                        borderColor: `${m.accent}66`,
                        background: `color-mix(in oklab, ${m.accent} 14%, transparent)`,
                        color: m.accent,
                        boxShadow: `0 0 0 1px ${m.accent}33, 0 12px 28px -16px ${m.accent}88`,
                      }}
                      title={`${m.comm.name} comm · repping with ${m.stageName}`}
                    >
                      <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-black/85 ring-1 ring-inset ring-white/10 p-1">
                        <Image
                          src={m.comm.logo}
                          alt={`${m.comm.name} logo`}
                          width={48}
                          height={48}
                          className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                          style={{
                            transform: `scale(${commScaleFor(m.comm.name)})`,
                            transformOrigin: "center",
                          }}
                        />
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                          Comm
                        </span>
                        <span className="text-[18px] font-bold tracking-tight">
                          {m.comm.name}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ink-dim)] md:text-[16px]">
                {c.name} is on the {roleLabel.toLowerCase()} crew at CORE
                {works.length > 0
                  ? `, working with ${works.map((w) => w.stageName).join(", ")}.`
                  : ", supporting the org from behind the scenes."}
                <br />
                The entertainment exists because they show up.
              </p>

              {c.socials.length > 0 ? (
                <div className="mt-7">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="eyebrow">Socials · Click to follow</p>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                      {c.socials.length} channels
                    </span>
                  </div>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {c.socials.map((s) => (
                      <li key={s.url}>
                        <PlatformLink
                          platform={s.platform as PlatformKey}
                          url={s.url}
                          handle={s.handle ?? s.label}
                          variant="secondary"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY — auto-scrolling marquee, same component as the member page. */}
      {photos.length > 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 pt-12 md:px-8 md:pt-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Gallery · {photos.length} photos</p>
                <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
                  Behind the lens.
                </h2>
              </div>
            </header>
          </div>
          <div className="px-6 pb-12 md:px-8 md:pb-16">
            <AutoScrollGallery
              photos={photos}
              alt={c.name}
              people={[
                {
                  id: `crew:${c.slug}`,
                  slug: c.slug,
                  name: c.name,
                  accent: works[0]?.accent ?? "#a1a1aa",
                  href: `/crew/${c.slug}`,
                },
                ...works.map((m) => ({
                  id: `member:${m.slug}`,
                  slug: m.slug,
                  name: m.stageName,
                  accent: m.accent,
                  avatarUrl: avatars[m.twitchLogin.toLowerCase()] ?? m.portrait,
                  href: `/m/${m.slug}`,
                })),
              ]}
            />
          </div>
        </section>
      ) : null}

      {/* WHO THEY RIDE WITH — same chrome as the member-page Team section. */}
      {works.length > 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Linked roster</p>
                <h2 className="mt-2 text-display text-[clamp(24px,3vw,36px)] font-bold text-[color:var(--ink)]">
                  Who they ride with.
                </h2>
              </div>
            </header>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {works.map((m) => {
                const avatar = avatars[m.twitchLogin.toLowerCase()] ?? m.portrait;
                return (
                  <li key={m.slug}>
                    <Link
                      href={`/m/${m.slug}` as `/m/${string}`}
                      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-all duration-300"
                      style={{ ["--card-accent" as string]: m.accent }}
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black media-tone">
                        <Image
                          src={avatar}
                          alt={m.stageName}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          className="object-cover grayscale-[0.45] transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.04]"
                          style={{ objectPosition: "50% 22%" }}
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(180deg, transparent 50%, rgba(8,8,10,0.95) 100%)",
                          }}
                        />
                        <div className="absolute inset-x-3 bottom-3">
                          <h3 className="text-display text-[20px] font-bold leading-tight tracking-tight text-on-image">
                            {m.stageName}
                          </h3>
                          <p className="mt-0.5 text-[11px] font-medium text-on-image-dim">
                            {m.realName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 border-t border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)]">
                          Open profile <ArrowUpRight size={11} />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* OTHER CREW — parallel to "Check out the other members". */}
      <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)] bg-dot-grid">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">More crew</p>
              <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
                Check out the other crew.
              </h2>
            </div>
            <Link
              href="/#crew"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
            >
              Full crew <ArrowUpRight size={14} />
            </Link>
          </header>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {otherCrew.map((other) => {
              const otherPortrait = getCrewPortrait(other.slug);
              const otherWorks = other.worksWith
                .map((s) => MEMBERS_BY_SLUG[s])
                .filter((m): m is NonNullable<typeof m> => !!m);
              const otherAccent = otherWorks[0]?.accent ?? "#a1a1aa";
              return (
                <li key={other.slug}>
                  <Link
                    href={`/crew/${other.slug}` as `/crew/${string}`}
                    className="member-card relative block overflow-hidden rounded-lg"
                    style={{ ["--card-accent" as string]: otherAccent }}
                  >
                    <span className="relative block aspect-[3/4] w-full overflow-hidden bg-black media-tone">
                      {otherPortrait ? (
                        <Image
                          src={otherPortrait}
                          alt={other.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 20vw"
                          className="member-photo object-cover"
                          style={{ objectPosition: "50% 22%" }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[color:var(--bg-elev)]">
                          <span className="text-display text-[48px] font-black text-[color:var(--ink-faint)]">
                            {other.name
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
                            "linear-gradient(180deg, transparent 55%, rgba(8,8,10,0.95) 100%)",
                        }}
                      />
                      <span className="absolute inset-x-3 bottom-3">
                        <p className="member-name font-display text-[18px] font-bold leading-tight text-on-image">
                          {other.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-on-image-dim">
                          {ROLE_COPY[other.role] ?? other.role}
                        </p>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Mail } from "lucide-react";
import { MEMBERS_BY_SLUG, MEMBERS, CREW } from "@/lib/members";
import { ageFromIso } from "@/lib/utils";
import { fetchUserIdsByLogin, fetchFollowerCount, fetchUsersByLogin, buildLiveResponse, type LiveEntry } from "@/lib/twitch";
import { getMemberPhotos, getCrewPortrait, getGroupPhotos } from "@/lib/asset-index";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PlatformLink, type PlatformKey } from "@/components/ui/PlatformLink";
import { AutoScrollGallery } from "@/components/ui/AutoScrollGallery";
import { FanMailPostcard } from "@/components/sections/FanMailPostcard";
import { MemberLiveStatus } from "@/components/live/MemberLiveStatus";
import { ViralityTimeline } from "@/components/member/ViralityTimeline";
import { SEED_CLIPS } from "@/lib/clips";

// Live status freshness — page regenerates at most every 60s so the
// "Live now" pill in the hero stays roughly current. The client SWR
// hook in MemberLiveStatus refreshes on top of that.
export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) return {};
  return {
    title: `${member.stageName} — The Core Boys`,
    description: member.bio,
    alternates: { canonical: `/m/${member.slug}` },
    openGraph: {
      title: `${member.stageName} — The Core Boys`,
      description: member.bio,
      type: "profile",
      url: `/m/${member.slug}`,
    },
  };
}

const SOCIAL_ORDER: PlatformKey[] = ["twitch", "youtube", "tiktok", "instagram", "x", "snapchat"];

export default async function MemberPage({ params }: Params) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) notFound();

  const age = ageFromIso(member.birthDate);

  // Auto-populated gallery: member's own folder + group photos. Phase 4
  // swaps for `SELECT cdn_url FROM media_assets a JOIN media_face_tags
  // f ON f.asset_id = a.id WHERE f.person_id = $slug ORDER BY taken_at`.
  const memberOwn = getMemberPhotos(member.slug);
  const groupShots = getGroupPhotos();
  const photos = [...memberOwn, ...groupShots];
  const team = CREW.filter((c) => c.worksWith.includes(member.slug));
  const otherMembers = MEMBERS.filter((m) => m.slug !== member.slug);

  // Twitch lookups: follower count for this member + avatars for the
  // "Check out the other members" rail + live status for the hero pill.
  let twitchFollowers: number | null = null;
  const avatarsByLogin: Record<string, string> = {};
  let liveEntry: LiveEntry | undefined;
  try {
    const allLogins = MEMBERS.map((m) => m.twitchLogin);
    const users = await fetchUsersByLogin(allLogins);
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatarsByLogin[login] = u.profile_image_url;
    }
    const user = users[member.twitchLogin.toLowerCase()];
    if (user) {
      twitchFollowers = await fetchFollowerCount(user.id);
    }
    const liveResponse = await buildLiveResponse([member.twitchLogin]);
    liveEntry = liveResponse.live.find(
      (e) => e.login.toLowerCase() === member.twitchLogin.toLowerCase(),
    );
  } catch {
    /* ignore */
  }
  // Older code used fetchUserIdsByLogin alone; kept the helper export
  // so other server components can still use it.
  void fetchUserIdsByLogin;

  // Wikipedia / Fandom intentionally excluded — we don't link out to them.
  const sameAs = member.socials.map((s) => s.url);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: member.stageName,
    alternateName: member.realName,
    url: `https://thecoreboys.com/m/${member.slug}`,
    description: member.bio,
    ...(member.birthDate ? { birthDate: member.birthDate } : {}),
    sameAs,
    memberOf: {
      "@type": "Organization",
      name: "The Core Boys",
      url: "https://thecoreboys.com",
    },
  };


  return (
    <main className="relative pt-20 md:pt-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[color:var(--rule)] bg-dot-grid">
        {/* Layered atmospheric blooms — accent-tinted lens flares + indigo + warm glow. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(50% 40% at 22% 30%, ${member.accent}33, transparent 60%), radial-gradient(40% 35% at 80% 12%, rgba(99,102,241,0.16), transparent 70%), radial-gradient(45% 30% at 50% 100%, ${member.accent}22, transparent 75%)`,
          }}
        />
        <div
          aria-hidden
          className="lens-flare h-[520px] w-[520px]"
          style={{
            left: "-8%",
            top: "20%",
            ["--flare" as string]: `${member.accent}cc`,
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
            href="/#members"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={12} /> The Boys
          </Link>

          <div className="mt-8 grid grid-cols-12 gap-8 md:gap-12">
            <div className="col-span-12 md:col-span-5">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black media-tone">
                <Image
                  src={member.portrait}
                  alt={member.stageName}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-cover"
                />
                <span className="absolute left-3 top-3 tag">{member.index}</span>
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
                {member.stageName}
              </h1>
              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                <div className="inline-flex items-center gap-2">
                  <dt className="text-[color:var(--ink-faint)]">Name</dt>
                  <dd className="text-[color:var(--ink)]">{member.realName}</dd>
                </div>
                {age != null ? (
                  <div className="inline-flex items-center gap-2">
                    <dt className="text-[color:var(--ink-faint)]">Age</dt>
                    <dd className="text-[color:var(--ink)]">{age}</dd>
                  </div>
                ) : null}
                {member.birthDate ? (
                  <div className="inline-flex items-center gap-2">
                    <dt className="text-[color:var(--ink-faint)]">Born</dt>
                    <dd className="text-[color:var(--ink)]">
                      <time dateTime={member.birthDate}>{formatBirthday(member.birthDate)}</time>
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center gap-3 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: `${member.accent}66`,
                    background: `color-mix(in oklab, ${member.accent} 14%, transparent)`,
                    color: member.accent,
                    boxShadow: `0 0 0 1px ${member.accent}33, 0 12px 28px -16px ${member.accent}88`,
                  }}
                  title={`${member.comm.name} comm`}
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-black/85 ring-1 ring-inset ring-white/10 p-1">
                    <Image
                      src={member.comm.logo}
                      alt={`${member.comm.name} logo`}
                      width={48}
                      height={48}
                      className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                      style={{
                        transform: `scale(${commScaleFor(member.comm.name)})`,
                        transformOrigin: "center",
                      }}
                    />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                      Comm
                    </span>
                    <span className="text-[18px] font-bold tracking-tight">
                      {member.comm.name}
                    </span>
                  </span>
                </span>
              </div>

              <div className="mt-5">
                <MemberLiveStatus login={member.twitchLogin} initial={liveEntry} />
              </div>

              <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ink-dim)] md:text-[16px]">
                {member.bio}
              </p>

              {member.managementEmail ? (
                <div className="mt-5">
                  <p className="eyebrow mb-2">Business contact</p>
                  <a
                    href={`mailto:${member.managementEmail}`}
                    className="group inline-flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2 text-[13px] font-medium text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--core)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
                  >
                    <Mail size={13} className="text-[color:var(--ink-faint)] group-hover:text-[color:var(--core)]" />
                    <span className="font-mono text-[12px] tracking-tight">{member.managementEmail}</span>
                  </a>
                </div>
              ) : null}

              {/* Socials — sit right next to the portrait, no scrolling. */}
              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="eyebrow">Socials · Click to follow</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                    {member.socials.length} channels
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SOCIAL_ORDER.flatMap((p) => {
                    const subset = member.socials.filter((s) => s.platform === p);
                    return subset.map((s) => (
                      <li key={s.url}>
                        <PlatformLink
                          platform={p}
                          url={s.url}
                          handle={s.handle ?? s.label}
                          metric={
                            p === "twitch" && twitchFollowers != null
                              ? `${formatCompact(twitchFollowers)} followers`
                              : undefined
                          }
                          variant="secondary"
                        />
                      </li>
                    ));
                  })}
                </ul>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* GALLERY — two rows, auto-scrolling opposite directions, hover to pause. */}
      {photos.length > 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 pt-12 md:px-8 md:pt-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Gallery · {photos.length} photos</p>
                <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] text-[color:var(--ink)]">
                  Recently captured.
                </h2>
              </div>
              <Link
                href="/media"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                All media <ArrowUpRight size={14} />
              </Link>
            </header>
          </div>
          <div className="px-6 pb-12 md:px-8 md:pb-16">
            <AutoScrollGallery
              photos={photos}
              alt={member.stageName}
              people={[
                {
                  id: `member:${member.slug}`,
                  slug: member.slug,
                  name: member.stageName,
                  accent: member.accent,
                  avatarUrl: avatarsByLogin[member.twitchLogin.toLowerCase()] ?? member.portrait,
                  href: `/m/${member.slug}`,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {/* TEAM — same chrome as the home crew wall, just scoped to this member. */}
      {team.length > 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Team · Behind the camera</p>
                <h2 className="mt-2 text-display text-[clamp(24px,3vw,36px)] font-bold text-[color:var(--ink)]">
                  {member.stageName}&apos;s team.
                </h2>
              </div>
            </header>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {team.map((c) => {
                const portrait = getCrewPortrait(c.slug);
                const roleLabel =
                  c.role === "cameraman"
                    ? "Cameraman"
                    : c.role === "management"
                      ? "Management"
                      : c.role;
                return (
                  <li key={c.slug}>
                    <Link
                      href={`/crew/${c.slug}` as `/crew/${string}`}
                      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-all duration-300"
                      style={{ ["--card-accent" as string]: member.accent }}
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black media-tone">
                        {portrait ? (
                          <Image
                            src={portrait}
                            alt={c.name}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
                        <div className="absolute inset-x-3 bottom-3">
                          <h3 className="text-display text-[20px] font-bold leading-tight tracking-tight text-on-image">
                            {c.name}
                          </h3>
                          <p className="mt-0.5 text-[11px] font-medium text-on-image-dim">
                            {roleLabel}
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

      {/* VIRALITY TIMELINE — clips tagged to this member, oldest → newest. */}
      <ViralityTimeline
        clips={SEED_CLIPS.filter((c) => c.memberSlugs.includes(member.slug))}
        memberStageName={member.stageName}
        memberSlug={member.slug}
        accent={member.accent}
      />

      {/* FAN MAIL */}
      <section className="fan-mail-shell relative border-t border-[color:var(--rule)]">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Fan mail · Old-school</p>
              <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] text-[color:var(--ink)]">
                Send something on paper.
              </h2>
              <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
                Letters land on a desk. Postcards make it to a wall. Send {member.stageName}
                {" "}something they can keep.
              </p>
            </div>
          </header>
          <FanMailPostcard
            stageName={member.stageName}
            realName={member.realName}
            initial={member.stageName[0] ?? "C"}
            accent={member.accent}
            poBox={member.poBox ?? null}
            commLogo={member.comm.logo}
            commName={member.comm.name}
          />
        </div>
      </section>

      {/* CHECK OUT THE OTHER MEMBERS — Twitch-pic roster strip. */}
      <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)] bg-dot-grid">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Roster</p>
              <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
                Check out the other members.
              </h2>
            </div>
            <Link
              href="/#members"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
            >
              Full roster <ArrowUpRight size={14} />
            </Link>
          </header>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {otherMembers.map((m) => {
              const avatar = avatarsByLogin[m.twitchLogin.toLowerCase()] ?? m.portrait;
              return (
                <li
                  key={m.slug}
                  className="member-card overflow-hidden rounded-lg"
                  style={{ ["--card-accent" as string]: m.accent }}
                >
                  <Link href={`/m/${m.slug}` as `/m/${string}`} className="block">
                    <span className="relative block aspect-[3/4] w-full overflow-hidden bg-black media-tone">
                      <Image
                        src={avatar}
                        alt={m.stageName}
                        fill
                        sizes="(max-width: 640px) 50vw, 20vw"
                        className="member-photo object-cover"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, transparent 55%, rgba(8,8,10,0.95) 100%)",
                        }}
                      />
                      <span className="absolute inset-x-3 bottom-3">
                        <p className="member-name font-display text-[18px] font-bold leading-tight text-[color:var(--ink)]">
                          {m.stageName}
                        </p>
                        <p className="mt-1 truncate text-[11px] font-medium text-[color:var(--ink-dim)]">
                          {m.realName}
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

/**
 * Comm logo PNGs ship with very different amounts of internal padding;
 * `object-contain` alone leaves M3 + Flock looking small. Per-comm
 * scale tuner brings them roughly to parity.
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

function formatBirthday(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}


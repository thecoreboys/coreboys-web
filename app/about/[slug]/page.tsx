import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Mail01 } from "@untitledui/icons";
import { MEMBERS, CREW } from "@/lib/members";
import { getCrewRoleLabel } from "@/lib/crew";
import { ageFromIso } from "@/lib/utils";
import { fetchUserIdsByLogin, fetchFollowerCount, fetchUsersByLogin, buildLiveResponse, fetchChannelVideos, type LiveEntry, type TwitchVod } from "@/lib/twitch";
import { getProfileSocialMetrics } from "@/lib/profile-social-metrics";
import { getMemberPhotos, getCrewPortrait, getGroupPhotos } from "@/lib/asset-index";
import { getMemberGalleryPhotos } from "@/lib/member-gallery";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PlatformLink, type PlatformKey } from "@/components/ui/PlatformLink";
import { AutoScrollGallery } from "@/components/ui/AutoScrollGallery";
import { FanMailPostcard } from "@/components/sections/FanMailPostcard";
import { MemberLiveStatus } from "@/components/live/MemberLiveStatus";
import { ViralityTimeline } from "@/components/member/ViralityTimeline";
import { VodArchive } from "@/components/member/VodArchive";
import { SEED_CLIPS } from "@/lib/clips";
import { MemberTwitchTrackerStrip } from "@/components/metrics/TwitchTrackerAnalytics";
import { loadMemberTwitchTrackerSummary } from "@/lib/twitchtracker-snapshots";
import { getMemberWithProfileOverrides } from "@/lib/member-profile-overrides";

// Render fresh on every request. Twitch token fetches use `cache:
// "no-store"` which is incompatible with Next 15's static prerender +
// ISR pipeline ("Page changed from static to dynamic"). The client
// SWR hook in MemberLiveStatus also refreshes the live pill, so this
// only affects the initial server render.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const member = await getMemberWithProfileOverrides(slug);
  if (!member) return {};
  return {
    title: member.stageName,
    description: member.bio,
    alternates: { canonical: `/channels/${member.slug}` },
    openGraph: {
      title: `${member.stageName} — CORE`,
      description: member.bio,
      type: "profile",
      url: `/channels/${member.slug}`,
    },
  };
}

const SOCIAL_ORDER: PlatformKey[] = ["twitch", "youtube", "tiktok", "instagram", "x", "snapchat"];

export default async function MemberPage({ params }: Params) {
  const { slug } = await params;
  // Channels are now the canonical member home: live programming, socials,
  // crew, gallery, and fan mail are all available there. Preserve old links
  // without maintaining a competing profile page.
  if (MEMBERS.some((entry) => entry.slug === slug)) redirect(`/channels/${slug}`);
  const member = await getMemberWithProfileOverrides(slug);
  if (!member) notFound();
  const twitchTrackerSummaryPromise = loadMemberTwitchTrackerSummary(slug).catch(() => null);

  const age = ageFromIso(member.birthDate);

  // Auto-populated gallery: member's own folder + group photos. Phase 4
  // remains the safe fallback until an admin explicitly curates a member's
  // ordered selection. The shared resolver keeps /about and /channels in
  // lockstep and falls back cleanly when a gallery override is absent.
  const memberOwn = getMemberPhotos(member.slug);
  const groupShots = getGroupPhotos();
  const photos = await getMemberGalleryPhotos(member.slug, [...memberOwn, ...groupShots]);
  const team = CREW.filter((c) => c.worksWith.includes(member.slug));
  const otherMembers = MEMBERS.filter((m) => m.slug !== member.slug);

  // Twitch lookups: follower count for this member + avatars for the
  // "Check out the other members" rail + live status for the hero pill.
  let twitchFollowers: number | null = null;
  const avatarsByLogin: Record<string, string> = {};
  let liveEntry: LiveEntry | undefined;
  let vods: TwitchVod[] = [];
  try {
    const allLogins = MEMBERS.map((m) => m.twitchLogin);
    const users = await fetchUsersByLogin(allLogins);
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatarsByLogin[login] = u.profile_image_url;
    }
    const user = users[member.twitchLogin.toLowerCase()];
    if (user) {
      [twitchFollowers, vods] = await Promise.all([
        fetchFollowerCount(user.id),
        fetchChannelVideos(user.id, 9),
      ]);
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

  const twitchCountsByUrl = new Map<string, number>();
  const twitchSocial = member.socials.find((social) => social.platform === "twitch");
  if (twitchSocial && twitchFollowers != null) {
    twitchCountsByUrl.set(twitchSocial.url, twitchFollowers);
  }
  const metricByUrl = await getProfileSocialMetrics({
    snapshotSlug: member.slug,
    socials: member.socials,
    manualCounts: member.manualCounts,
    twitchCountsByUrl,
    // The hero lookup above already attempted Helix. If it failed, use the
    // saved snapshot instead of issuing the same request twice.
    fetchMissingTwitch: false,
  });
  const twitchTrackerSummary = await twitchTrackerSummaryPromise;

  // Wikipedia / Fandom intentionally excluded — we don't link out to them.
  const sameAs = member.socials.map((s) => s.url);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: member.stageName,
    alternateName: member.realName,
    url: `https://thecoreboys.com/channels/${member.slug}`,
    description: member.bio,
    ...(member.birthDate ? { birthDate: member.birthDate } : {}),
    sameAs,
    memberOf: {
      "@type": "Organization",
      name: "CORE",
      url: "https://thecoreboys.com",
    },
  };


  return (
    <div className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[color:var(--rule)]">
        <div className="relative z-10 mx-auto max-w-container px-6 py-12 md:px-16 md:py-16">
          <Link
            href="/#members"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={14} /> The six
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
              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                <div className="inline-flex items-center gap-2">
                  <dt className="text-quaternary">Name</dt>
                  <dd className="text-primary">{member.realName}</dd>
                </div>
                {age != null ? (
                  <div className="inline-flex items-center gap-2">
                    <dt className="text-quaternary">Age</dt>
                    <dd className="text-primary">{age}</dd>
                  </div>
                ) : null}
                {member.birthDate ? (
                  <div className="inline-flex items-center gap-2">
                    <dt className="text-quaternary">Born</dt>
                    <dd className="text-primary">
                      <time dateTime={member.birthDate}>{formatBirthday(member.birthDate)}</time>
                    </dd>
                  </div>
                ) : null}
              </dl>

              <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                {member.comm.name}
              </p>

              <div className="mt-5">
                <MemberLiveStatus login={member.twitchLogin} slug={member.slug} initial={liveEntry} />
              </div>

              <MemberTwitchTrackerStrip
                summary={twitchTrackerSummary}
                memberName={member.stageName}
                memberSlug={member.slug}
                accent={member.accent}
              />

              <p className="mt-6 max-w-[60ch] text-md leading-relaxed text-tertiary md:text-lg">
                {member.bio}
              </p>

              {member.nickname || member.favoriteGame ? (
                <dl className="mt-4 flex flex-wrap gap-2 text-sm">
                  {member.nickname ? (
                    <div className="rounded-lg border border-secondary bg-primary px-3 py-2">
                      <dt className="text-xs uppercase tracking-[0.12em] text-quaternary">Nickname</dt>
                      <dd className="mt-0.5 font-semibold text-primary">{member.nickname}</dd>
                    </div>
                  ) : null}
                  {member.favoriteGame ? (
                    <div className="rounded-lg border border-secondary bg-primary px-3 py-2">
                      <dt className="text-xs uppercase tracking-[0.12em] text-quaternary">Favorite game</dt>
                      <dd className="mt-0.5 font-semibold text-primary">{member.favoriteGame}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {member.description ? (
                <p className="mt-4 max-w-[60ch] whitespace-pre-line text-sm leading-relaxed text-tertiary">
                  {member.description}
                </p>
              ) : null}

              {member.managementEmail ? (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold text-brand-secondary">Business contact</p>
                  <a
                    href={`mailto:${member.managementEmail}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-secondary bg-primary px-3.5 py-2.5 text-sm font-semibold text-secondary shadow-xs-skeuomorphic transition-all hover:-translate-y-px hover:text-primary"
                  >
                    <Mail01 className="size-5 text-fg-quaternary" />
                    {member.managementEmail}
                  </a>
                </div>
              ) : null}

              {/* Socials — sit right next to the portrait, no scrolling. */}
              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-brand-secondary">Socials</p>
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
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
                          metric={metricByUrl[s.url]}
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
          <div className="mx-auto max-w-container px-6 pt-12 md:px-8 md:pt-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                  Gallery · {photos.length}
                </p>
                <h2 className="mt-2 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
                  Stills.
                </h2>
              </div>
              <Link
                href="/media"
                className="inline-flex items-center gap-1 text-sm font-medium text-tertiary hover:text-primary"
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
                  avatarUrl: member.portrait ?? avatarsByLogin[member.twitchLogin.toLowerCase()],
                  href: `/about/${member.slug}`,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {/* TEAM — same chrome as the home crew wall, just scoped to this member. */}
      {team.length > 0 ? (
        <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
          <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                  Behind the camera
                </p>
                <h2 className="mt-2 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
                  {member.stageName}&apos;s team.
                </h2>
              </div>
            </header>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {team.map((c) => {
                const portrait = getCrewPortrait(c.slug);
                const roleLabel = getCrewRoleLabel(c);
                return (
                  <li key={c.slug}>
                    <Link
                      href={`/crew/${c.slug}` as `/crew/${string}`}
                      className="group relative flex h-full flex-col overflow-hidden"
                      style={{ ["--card-accent" as string]: member.accent }}
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black media-tone">
                        {portrait ? (
                          <Image
                            src={portrait}
                            alt={c.name}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-cover"
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
                          <h3 className="text-md font-semibold leading-tight tracking-tight text-on-image">
                            {c.name}
                          </h3>
                          <p className="mt-0.5 text-xs font-medium text-on-image-dim">
                            {roleLabel}
                          </p>
                        </div>
                      </div>
                      <div className="px-0 py-3">
                        <span className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                          Profile
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

      {/* STREAM VOD ARCHIVE — recent Twitch past broadcasts. */}
      <VodArchive vods={vods} memberName={member.stageName} memberSlug={member.slug} />

      {/* FAN MAIL */}
      <section className="fan-mail-shell relative border-t border-[color:var(--rule)]">
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-secondary">Fan mail · Old-school</p>
              <h2 className="mt-2 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
                Send something on paper.
              </h2>
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-tertiary">
                Letters land on a desk. Postcards make it to a wall. Send {member.stageName}
                {" "}something they can keep.
              </p>
            </div>
          </header>
          <FanMailPostcard
            slug={member.slug}
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
        <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-secondary">Roster</p>
              <h2 className="mt-2 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] md:text-[32px]">
                The others.
              </h2>
            </div>
            <Link
              href="/#members"
              className="inline-flex items-center gap-1 text-sm font-medium text-tertiary hover:text-primary"
            >
              Full roster <ArrowUpRight size={14} />
            </Link>
          </header>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {otherMembers.map((m) => {
              const avatar = m.portrait ?? avatarsByLogin[m.twitchLogin.toLowerCase()];
              return (
                <li
                  key={m.slug}
                  className="member-card overflow-hidden rounded-lg"
                  style={{ ["--card-accent" as string]: m.accent }}
                >
                  <Link href={`/about/${m.slug}` as Route} className="block">
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
                        <p className="member-name font-display text-md font-semibold leading-tight text-[color:var(--ink)]">
                          {m.stageName}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-[color:var(--ink-dim)]">
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
    </div>
  );
}

function formatBirthday(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

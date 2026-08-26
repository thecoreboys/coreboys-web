"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LayoutGrid, Play } from "lucide-react";
import { Eye, Stars02, TrendUp01 as TrendingUpIcon, Users01, SearchLg, FaceSad } from "@untitledui/icons";
import { ClipEmbed, ClipPlatformBadge, ExternalClipLink } from "@/components/clips/ClipEmbed";
import { ClipUpvoteButton } from "@/components/clips/ClipUpvoteButton";
import { ClipLeaderboard } from "@/components/clips/ClipLeaderboard";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { Input } from "@/components/base/input/input";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { sortClips, type Clip, type ClipSortKey } from "@/lib/clips";
import { usePlayer } from "@/components/providers/PlayerProvider";
import type { Playable } from "@/lib/watch/playable";

export type MemberLite = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

export type ClipsPageClientProps = {
  clips: Clip[];
  members: MemberLite[];
};

const SORT_OPTIONS: Array<{ key: ClipSortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "popular", label: "Most popular" },
  { key: "oldest", label: "Oldest" },
];

export function ClipsPageClient({ clips, members }: ClipsPageClientProps) {
  const player = usePlayer();
  const [sort, setSort] = useState<ClipSortKey>("newest");
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<Clip["source"] | null>(null);
  const [query, setQuery] = useState("");
  // Search is AI-powered by default whenever the user has typed something.
  const aiSearch = query.trim().length > 0;

  // Upvote hydration — counts per clip + which the current fan has upvoted.
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [votesReady, setVotesReady] = useState(false);

  useEffect(() => {
    const ids = clips.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) {
      setVotesReady(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/community/clips/votes?ids=${encodeURIComponent(ids.join(","))}`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : { counts: {}, mine: [] }))
      .then((d: { counts: Record<string, number>; mine: string[] }) => {
        if (cancelled) return;
        setVoteCounts(d.counts ?? {});
        setMyVotes(new Set(d.mine ?? []));
        setVotesReady(true);
      })
      .catch(() => {
        if (!cancelled) setVotesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clips]);

  const totalViews = useMemo(
    () => clips.reduce((sum, c) => sum + (c.viewCount ?? 0), 0),
    [clips],
  );

  const visibleClips = useMemo(() => {
    let filtered = clips;
    if (activeMember) {
      filtered = filtered.filter((c) => c.memberSlugs.includes(activeMember));
    }
    if (activeSource) {
      filtered = filtered.filter((c) => c.source === activeSource);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.aiDescription ?? "").toLowerCase().includes(q),
      );
    }
    return sortClips(filtered, aiSearch ? "ai" : sort, query);
  }, [clips, sort, activeMember, activeSource, aiSearch, query]);

  const playableClips = useMemo(
    () => visibleClips.map((clip) => playableOfClip(clip, members)),
    [members, visibleClips],
  );
  const playableById = useMemo(
    () => new Map(visibleClips.map((clip, index) => [clip.id, playableClips[index]!])),
    [playableClips, visibleClips],
  );

  return (
    <div>
      {/* Top clips this week — fan-upvote leaderboard (UUI ranked list). */}
      <ClipLeaderboard clips={clips} />

      {/* Total views odometer — animates up to the running total. UUI metric card. */}
      {totalViews > 0 ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-secondary bg-secondary p-5 shadow-lg md:p-6">
          <div className="flex items-center gap-4">
            <FeaturedIcon icon={Eye} size="lg" color="brand" theme="modern" />
            <div>
              <p className="text-sm font-medium text-tertiary">Total views · all clips combined</p>
              <p className="mt-1 text-display-sm font-semibold tabular-nums leading-none tracking-tight text-primary">
                <CountUp value={totalViews} />
              </p>
            </div>
          </div>
          <p className="text-sm font-medium text-quaternary">
            Across {clips.length} clip{clips.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      {/* Toolbar — UUI search input + sort button group */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[280px] flex-1">
          <Input
            icon={SearchLg}
            size="md"
            value={query}
            onChange={(v) => setQuery(v)}
            placeholder="AI search — describe the moment, e.g. 'ron clutch'"
            aria-label="Search clips"
          />
        </div>

        <ButtonGroup
          size="md"
          selectedKeys={aiSearch ? new Set<string>() : new Set([sort])}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as ClipSortKey | undefined;
            if (next) setSort(next);
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <ButtonGroupItem
              key={opt.key}
              id={opt.key}
              iconLeading={opt.key === "popular" ? TrendingUpIcon : undefined}
            >
              {opt.label}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>

        <span className="ml-auto text-sm font-medium text-quaternary">
          {visibleClips.length} of {clips.length}
        </span>
      </div>

      {/* AI search backend stub — until the AI ranker is wired up, the
          search box just falls back to substring filtering. Tell users so
          they don't expect natural-language matching yet. */}
      {aiSearch ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-secondary bg-secondary p-4 shadow-xs-skeuomorphic">
          <FeaturedIcon icon={Stars02} size="md" color="brand" theme="light" />
          <p className="text-sm font-medium text-secondary">
            AI search abilty backend is not set up yet sorry guys! &lt;3
          </p>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterChip
          label="All members"
          allIcon
          active={activeMember === null}
          onClick={() => setActiveMember(null)}
        />
        {members.map((m) => (
          <FilterChip
            key={m.slug}
            label={m.stageName}
            color={m.accent}
            avatarUrl={m.avatarUrl}
            active={activeMember === m.slug}
            onClick={() => setActiveMember(activeMember === m.slug ? null : m.slug)}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-border-secondary" aria-hidden />
        {(["twitch", "youtube", "tiktok", "instagram"] as const).map((s) => {
          const brand =
            s === "twitch"
              ? "#9146FF"
              : s === "youtube"
                ? "#FF0033"
                : s === "tiktok"
                  ? "#FE2C55"
                  : "#E1306C";
          const active = activeSource === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSource(activeSource === s ? null : s)}
              aria-pressed={active}
              title={s.charAt(0).toUpperCase() + s.slice(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer hover:-translate-y-0.5"
              style={
                active
                  ? {
                      borderColor: brand,
                      color: brand,
                      background: `color-mix(in oklab, ${brand} 18%, transparent)`,
                      boxShadow: `0 0 0 1px ${brand}55`,
                    }
                  : {
                      borderColor: "var(--rule)",
                      color: "var(--ink-dim)",
                      background: "var(--bg-elev)",
                    }
              }
            >
              <PlatformLogo platform={s} size={14} />
            </button>
          );
        })}
      </div>

      {/* Collage — CSS columns so vertical + horizontal clips pack tightly. */}
      {visibleClips.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-secondary bg-secondary p-10 text-center shadow-xs-skeuomorphic">
          <FeaturedIcon icon={FaceSad} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-lg font-semibold text-primary">
            {clips.length === 0 ? "No clips yet" : "No clips match"}
          </p>
          {clips.length > 0 ? (
            <p className="mt-1 max-w-[44ch] text-sm text-tertiary">
              Try clearing a filter or a different search.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:_balance]">
          {visibleClips.map((c) => {
            const taggedMembers = c.memberSlugs
              .map((slug) => members.find((m) => m.slug === slug))
              .filter((m): m is MemberLite => !!m);
            return (
              <article
                key={c.id}
                className="mb-5 break-inside-avoid overflow-hidden rounded-2xl border border-secondary bg-secondary shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
              >
                <ClipEmbed clip={c} />
                <div className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-balance text-md font-semibold leading-snug tracking-tight text-primary">
                        {c.title}
                      </h3>
                      <p className="mt-1 text-sm text-tertiary">
                        {formatRelative(c.publishedAt)}
                        {c.viewCount != null
                          ? ` · ${formatCompact(c.viewCount)} views`
                          : ""}
                      </p>
                    </div>
                    <ClipPlatformBadge source={c.source} />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-secondary pt-3">
                    <div className="flex items-center gap-1">
                      {taggedMembers.slice(0, 5).map((m) => (
                        <Link
                          key={m.slug}
                          href={`/about/${m.slug}` as never}
                          className="group/avatar relative inline-flex"
                          title={m.stageName}
                        >
                          {m.avatarUrl ? (
                            <Image
                              src={m.avatarUrl}
                              alt={m.stageName}
                              width={26}
                              height={26}
                              className="h-[26px] w-[26px] rounded-full ring-2 ring-inset transition-transform duration-200 group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-110"
                              style={{ ["--tw-ring-color" as string]: m.accent }}
                            />
                          ) : (
                            <span
                              className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full ring-2 ring-inset text-xs font-bold transition-transform duration-200 group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-110"
                              style={{
                                ["--tw-ring-color" as string]: m.accent,
                                color: m.accent,
                                background: "rgba(8,8,10,0.7)",
                              }}
                            >
                              {m.stageName[0]}
                            </span>
                          )}
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary opacity-0 shadow-lg ring-1 ring-inset ring-secondary transition-opacity group-hover/avatar:opacity-100"
                          >
                            {m.stageName}
                          </span>
                        </Link>
                      ))}
                      {taggedMembers.length > 5 ? (
                        <span className="ml-1 text-xs text-quaternary">
                          +{taggedMembers.length - 5}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const playable = playableById.get(c.id);
                          if (playable) player.play(playable, playableClips);
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-tertiary ring-1 ring-inset ring-secondary transition hover:bg-primary_hover hover:text-primary"
                        aria-label={`Play ${c.title} in the CORE player`}
                        title="Play"
                      >
                        <Play className="size-3.5" fill="currentColor" />
                      </button>
                      <Link
                        href="/multiview"
                        onClick={() => {
                          const playable = playableById.get(c.id);
                          if (playable) player.addTile(playable, { focus: true });
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-tertiary ring-1 ring-inset ring-secondary transition hover:bg-primary_hover hover:text-primary"
                        aria-label={`Add ${c.title} to Multiview`}
                        title="Add to Multiview"
                      >
                        <LayoutGrid className="size-3.5" />
                      </Link>
                      {votesReady ? (
                        <ClipUpvoteButton
                          clipId={c.id}
                          initialVoted={myVotes.has(c.id)}
                          initialCount={voteCounts[c.id] ?? 0}
                        />
                      ) : null}
                      <ExternalClipLink clip={c} />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function playableOfClip(clip: Clip, members: MemberLite[]): Playable {
  const memberSlug = clip.memberSlugs[0] ?? null;
  const member = memberSlug ? members.find((entry) => entry.slug === memberSlug) : null;
  return {
    key: `clip-${clip.source}-${clip.id}`,
    kind: "clip",
    platform: clip.source,
    title: clip.title,
    poster: clip.thumbnailUrl ?? "",
    memberSlug,
    memberLabel: member?.stageName ?? "CORE",
    youtubeId: clip.source === "youtube" ? clip.externalId : null,
    twitchLogin: null,
    vodId: null,
    clipSrc: clip.source,
    clipId: clip.externalId,
    url: clip.url,
    sourceUrl: clip.url,
    embeddable: true,
    orientation: clip.aspect === "vertical" ? "portrait" : "landscape",
    format: "short",
    publishedAt: clip.publishedAt,
  };
}

function FilterChip({
  label,
  avatarUrl,
  color,
  active,
  onClick,
  allIcon = false,
}: {
  label: string;
  avatarUrl?: string;
  color?: string;
  active: boolean;
  onClick: () => void;
  /** Render the generic Users glyph in the avatar slot so the chip
   *  matches the height of the member chips even without a portrait. */
  allIcon?: boolean;
}) {
  const tint = color ?? "var(--core)";
  const hasAvatarSlot = !!avatarUrl || allIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-full py-1 ring-1 ring-inset ${
        hasAvatarSlot ? "pl-1 pr-3" : "px-2.5 py-1.5"
      } text-xs font-medium transition-all cursor-pointer ${
        active
          ? "text-primary"
          : "bg-secondary text-tertiary ring-secondary hover:text-primary"
      }`}
      style={
        active
          ? {
              ["--tw-ring-color" as string]: tint,
              background: `color-mix(in oklab, ${tint} 18%, transparent)`,
              boxShadow: `0 0 0 1px ${tint}55`,
            }
          : undefined
      }
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-6 w-6 rounded-full ring-1 ring-inset"
          style={{ ["--tw-ring-color" as string]: `${tint}66` }}
        />
      ) : allIcon ? (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset bg-[color:var(--bg)] text-[color:var(--ink-dim)]"
          style={{ ["--tw-ring-color" as string]: `${tint}66` }}
        >
          <Users01 className="size-3" />
        </span>
      ) : null}
      {label}
    </button>
  );
}

/**
 * Count-up animation for the total-views ticker. Eases out so it lands
 * smoothly on the final number rather than ticking linearly.
 */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const duration = 1400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{shown.toLocaleString("en-US")}</>;
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 14 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

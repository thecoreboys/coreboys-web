"use client";

import { useEffect, useMemo, useState } from "react";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { readableTitle } from "@/lib/watch/presentation";
import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { LayoutGrid, Play } from "lucide-react";
import { Eye, SearchLg, FaceSad } from "@untitledui/icons";
import { ClipEmbed, ClipPlatformBadge, ExternalClipLink } from "@/components/clips/ClipEmbed";
import { ClipUpvoteButton } from "@/components/clips/ClipUpvoteButton";
import { ClipLeaderboard } from "@/components/clips/ClipLeaderboard";
import { FilterSelect } from "@/components/ui/FilterSelect";
import browse from "@/components/ui/BrowseControls.module.css";
import { Input } from "@/components/base/input/input";
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
  { key: "popular", label: "Popular" },
  { key: "oldest", label: "Oldest" },
];

export function ClipsPageClient({ clips, members }: ClipsPageClientProps) {
  const player = usePlayer();
  const { filters, update } = useBrowseFilters({ sort: "newest", creator: "", platform: "", q: "", date: "all" });
  const sort: ClipSortKey = filters.sort === "popular" || filters.sort === "oldest" ? filters.sort : "newest";
  const setSort = (value: ClipSortKey) => update({ sort: value });
  const activeMember = filters.creator || null;
  const setActiveMember = (value: string | null) => update({ creator: value ?? "" });
  const activeSource = filters.platform || null;
  const setActiveSource = (value: Clip["source"] | null) => update({ platform: value ?? "" });
  const query = filters.q;
  const setQuery = (value: string) => update({ q: value });
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => setVisibleCount(24), [filters]);

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
    if (filters.date !== "all") filtered = filtered.filter((clip) => Date.parse(clip.publishedAt) >= Date.now() - Number(filters.date) * 86_400_000);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.aiDescription ?? "").toLowerCase().includes(q),
      );
    }
    return sortClips(filtered, sort, query);
  }, [clips, sort, activeMember, activeSource, query, filters.date]);

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

      <div className={browse.panel} role="search" aria-label="Find clips">
        <div className={browse.primaryRow}>
        <div className={browse.search}>
          <Input
            label="Search"
            icon={SearchLg}
            size="md"
            value={query}
            onChange={(v) => setQuery(v)}
            placeholder="Search clip titles and descriptions"
            aria-label="Search clips"
          />
        </div>

        <FilterSelect label="Sort" ariaLabel="Sort clips" value={sort} onChange={(value) => setSort(value as ClipSortKey)} options={SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))} />
        <FilterSelect label="Date" ariaLabel="Filter clips by date" value={filters.date} onChange={(value) => update({ date: value })} options={[{ value: "all", label: "Any time" }, { value: "7", label: "Past week" }, { value: "30", label: "Past month" }, { value: "365", label: "Past year" }]} />
        </div>
        <div className={browse.secondaryRow}>
        <FilterSelect
          label="Creator"
          ariaLabel="Filter clips by creator"
          value={activeMember ?? ""}
          onChange={(value) => setActiveMember(value || null)}
          options={[{ value: "", label: "All members" }, ...members.map((member) => ({ value: member.slug, label: member.stageName, avatarUrl: member.avatarUrl }))]}
        />
        <FilterSelect label="Platform" ariaLabel="Filter clips by platform" value={activeSource ?? ""} onChange={(value) => setActiveSource(value as Clip["source"] || null)} options={[{ value: "", label: "All platforms" }, { value: "twitch", label: "Twitch" }, { value: "youtube", label: "YouTube" }, { value: "tiktok", label: "TikTok" }, { value: "instagram", label: "Instagram" }]} />
        <p className={browse.resultCount} role="status"><span><strong>{visibleClips.length}</strong> of {clips.length} clips</span></p>
        </div>
      </div>

      {/* Collage — CSS columns so vertical + horizontal clips pack tightly. */}
      {visibleClips.length === 0 ? (
        <div className="collection-empty flex flex-col items-center justify-center p-8 text-center">
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
          {visibleClips.slice(0, visibleCount).map((c) => {
            const taggedMembers = c.memberSlugs
              .map((slug) => members.find((m) => m.slug === slug))
              .filter((m): m is MemberLite => !!m);
            return (
              <article
                key={c.id}
                className="collection-card mb-5 break-inside-avoid overflow-hidden"
              >
                <ClipEmbed clip={c} onPlay={() => player.play(playableOfClip(c, members), playableClips)} />
                <div className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-balance text-md font-semibold leading-snug tracking-tight text-primary">
                        {readableTitle(c.title)}
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
                          href={`/channels/${m.slug}` as never}
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
      {visibleClips.length > visibleCount ? <button type="button" className="my-6 min-h-11 rounded-lg border border-secondary px-5" onClick={() => setVisibleCount((count) => count + 24)}>Show 24 more clips</button> : null}
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

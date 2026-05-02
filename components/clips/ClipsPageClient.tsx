"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Sparkles, TrendingUp, Users } from "lucide-react";
import { ClipEmbed, ClipPlatformBadge, ExternalClipLink } from "@/components/clips/ClipEmbed";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { sortClips, type Clip, type ClipSortKey } from "@/lib/clips";

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
  const [sort, setSort] = useState<ClipSortKey>("newest");
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<Clip["source"] | null>(null);
  const [query, setQuery] = useState("");
  // Search is AI-powered by default whenever the user has typed something.
  const aiSearch = query.trim().length > 0;

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

  return (
    <div>
      {/* Total views odometer — animates up to the running total. */}
      {totalViews > 0 ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-5 py-4">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
              <Eye size={11} /> Total views · all clips combined
            </p>
            <p className="mt-1 text-display text-[clamp(28px,4vw,48px)] font-black tabular-nums leading-none tracking-tight text-[color:var(--ink)]">
              <CountUp value={totalViews} />
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
            Across {clips.length} clip{clips.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Sparkles
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--core)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="AI search — describe the moment, e.g. 'ron clutch'"
            className="w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] py-2.5 pl-9 pr-3 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
          />
        </div>

        <span className="ml-auto text-[12px] text-[color:var(--ink-faint)]">
          {visibleClips.length} of {clips.length}
        </span>
      </div>

      {/* Sort */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              setSort(opt.key);
            }}
            aria-pressed={sort === opt.key && !aiSearch}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
              sort === opt.key && !aiSearch
                ? "border-[color:var(--ink)]/40 bg-[color:var(--bg-elev)] text-[color:var(--ink)]"
                : "border-[color:var(--rule)] bg-transparent text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]"
            }`}
          >
            {opt.key === "popular" ? <TrendingUp size={11} /> : null}
            {opt.label}
          </button>
        ))}
      </div>

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
        <span className="mx-1 h-5 w-px bg-[color:var(--rule)]" aria-hidden />
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
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            {clips.length === 0 ? "Library empty" : "No clips match"}
          </p>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
            {clips.length === 0
              ? "No clips have been published yet. Found a great one? Submit it and we'll review it for the library."
              : "Try clearing a filter or different search."}
          </p>
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
                className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[color:var(--rule-strong)] hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.55)]"
              >
                <ClipEmbed clip={c} />
                <div className="flex flex-col gap-2.5 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-balance text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                        {c.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-[color:var(--ink-dim)]">
                        {formatRelative(c.publishedAt)}
                        {c.viewCount != null
                          ? ` · ${formatCompact(c.viewCount)} views`
                          : ""}
                      </p>
                    </div>
                    <ClipPlatformBadge source={c.source} />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-[color:var(--rule)] pt-2.5">
                    <div className="flex items-center gap-1">
                      {taggedMembers.slice(0, 5).map((m) => (
                        <Link
                          key={m.slug}
                          href={`/m/${m.slug}` as `/m/${string}`}
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
                              className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full ring-2 ring-inset text-[10px] font-bold transition-transform duration-200 group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-110"
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
                            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-semibold text-[color:var(--ink)] opacity-0 shadow-lg transition-opacity group-hover/avatar:opacity-100"
                          >
                            {m.stageName}
                          </span>
                        </Link>
                      ))}
                      {taggedMembers.length > 5 ? (
                        <span className="ml-1 text-[11px] text-[color:var(--ink-faint)]">
                          +{taggedMembers.length - 5}
                        </span>
                      ) : null}
                    </div>
                    <ExternalClipLink clip={c} />
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
      className={`inline-flex items-center gap-2 rounded-full border py-1 ${
        hasAvatarSlot ? "pl-1 pr-3" : "px-2.5 py-1.5"
      } text-[12px] font-medium transition-all cursor-pointer ${
        active
          ? "text-[color:var(--ink)]"
          : "border-[color:var(--rule)] text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]"
      }`}
      style={
        active
          ? {
              borderColor: tint,
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
          <Users size={11} />
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

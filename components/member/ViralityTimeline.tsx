"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Play,
  TrendingUp,
  X,
} from "lucide-react";
import { PlayCircle, Eye as EyeIcon, TrendUp01, SearchLg } from "@untitledui/icons";
import { ClipEmbed, ClipPlatformBadge, ExternalClipLink } from "@/components/clips/ClipEmbed";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { MetricCard } from "@/components/metrics/MetricCard";
import { Input } from "@/components/base/input/input";
import type { Clip } from "@/lib/clips";

const TIMELINE_KEY = "coreboys-virality-curated:v1";

export type ViralityTimelineProps = {
  clips: Clip[];
  memberStageName: string;
  memberSlug: string;
  accent: string;
};

/**
 * Virality archive — designed to scale to hundreds of clips per member.
 *
 * Layout:
 * 1. Stats strip — clips, total views, peak.
 * 2. Year-bar nav — one bar per year, height proportional to year's
 *    combined views. Click to jump to that year section.
 * 3. Year sections — top-3 "featured" tiles (larger), then a compact
 *    grid for the rest. Tiles are thumbnail-only; clicking opens a
 *    modal that mounts the actual `<ClipEmbed>` iframe — so we never
 *    instantiate hundreds of platform embeds at once.
 * 4. Inline search filters across years.
 *
 * Admins curate via the eye toggle on each tile (stored locally per
 * member slug).
 */
export function ViralityTimeline({
  clips,
  memberStageName,
  memberSlug,
  accent,
}: ViralityTimelineProps) {
  const [authed, setAuthed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      setAuthed(localStorage.getItem("coreboys-auth-demo") === "1");
      const raw = localStorage.getItem(TIMELINE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        if (parsed[memberSlug]) setHidden(new Set(parsed[memberSlug]));
      }
    } catch {
      /* ignore */
    }
  }, [memberSlug]);

  useEffect(() => {
    if (!openClipId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenClipId(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [openClipId]);

  const persistHidden = (next: Set<string>) => {
    try {
      const raw = localStorage.getItem(TIMELINE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      parsed[memberSlug] = [...next];
      localStorage.setItem(TIMELINE_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
  };

  const toggleHidden = (clipId: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      persistHidden(next);
      return next;
    });
  };

  // Filter pipeline — admin sees everything (with hidden flag visible),
  // Public view shows approved entries only. Search checks the title and description.
  const all = useMemo(() => {
    const base = authed ? clips : clips.filter((c) => !hidden.has(c.id));
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.aiDescription ?? "").toLowerCase().includes(q),
    );
  }, [clips, hidden, authed, query]);

  // Group by year, newest year first.
  const byYear = useMemo(() => {
    const m = new Map<number, Clip[]>();
    for (const c of all) {
      const y = new Date(c.publishedAt).getFullYear();
      const arr = m.get(y) ?? [];
      arr.push(c);
      m.set(y, arr);
    }
    return [...m.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => ({
        year,
        clips: [...list].sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        ),
      }));
  }, [all]);

  if (clips.length === 0) return null;
  if (all.length === 0 && !authed) return null;

  const totalViews = all.reduce((acc, c) => acc + (c.viewCount ?? 0), 0);
  const peakClip = all.reduce<Clip | null>((peak, c) => {
    if (!peak) return c;
    return (c.viewCount ?? 0) > (peak.viewCount ?? 0) ? c : peak;
  }, null);
  const yearViewMax = Math.max(
    1,
    ...byYear.map((y) => y.clips.reduce((acc, c) => acc + (c.viewCount ?? 0), 0)),
  );

  const openClip = openClipId ? all.find((c) => c.id === openClipId) ?? null : null;

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
        <header className="mb-8 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 md:col-span-7">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand-secondary">
              <TrendingUp size={14} />
              Virality timeline
            </p>
            <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
              {memberStageName}&apos;s biggest <span className="gradient-text">moments.</span>
            </h2>
            {authed ? (
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[color:var(--core)]">
                Admin: hide a clip with the eye icon to remove it from the public archive.
              </p>
            ) : null}
          </div>

          {/* Search — useful at 100+ clips. */}
          <div className="col-span-12 md:col-span-5">
            <Input
              icon={SearchLg}
              aria-label="Search clips"
              value={query}
              onChange={setQuery}
              placeholder={`Search ${clips.length} clips…`}
            />
          </div>
        </header>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3 md:max-w-[640px]">
          <MetricCard icon={PlayCircle} label="Clips" value={`${all.length}`} delta="in archive" trend="neutral" />
          <MetricCard icon={EyeIcon} label="Total views" value={formatCompact(totalViews)} delta="across platforms" trend="neutral" />
          <MetricCard
            icon={TrendUp01}
            label="Peak clip"
            value={formatCompact(peakClip?.viewCount ?? 0)}
            delta={peakClip ? formatYearMonth(peakClip.publishedAt) : "—"}
            trend="neutral"
          />
        </div>

        {/* Year-bar nav — one bar per year, height ∝ that year's combined views.
            Clicking jumps to the section. Compresses gracefully to dozens of years. */}
        <nav
          className="mb-8 flex items-end gap-1.5 overflow-x-auto pb-2"
          aria-label="Jump to year"
        >
          {byYear.map((y) => {
            const yearViews = y.clips.reduce((acc, c) => acc + (c.viewCount ?? 0), 0);
            const heightPct = Math.max(8, (yearViews / yearViewMax) * 100);
            return (
              <a
                key={y.year}
                href={`#${memberSlug}-y-${y.year}`}
                className="group/year flex shrink-0 flex-col items-center gap-1 rounded-md p-1 transition-colors hover:bg-[color:var(--bg-elev)] cursor-pointer"
                aria-label={`${y.year} · ${y.clips.length} clips · ${formatCompact(yearViews)} views`}
              >
                <span
                  className="block h-[44px] w-7 self-end rounded-sm transition-transform group-hover/year:scale-y-110 origin-bottom"
                  style={{
                    background: `linear-gradient(to top, ${accent}55, ${accent}cc)`,
                    transform: `scaleY(${heightPct / 100})`,
                    transformOrigin: "bottom",
                  }}
                  aria-hidden
                />
                <span className="text-xs font-semibold tabular-nums text-tertiary group-hover/year:text-primary">
                  {y.year}
                </span>
                <span className="text-xs tabular-nums text-quaternary">
                  {y.clips.length}
                </span>
              </a>
            );
          })}
        </nav>

        {/* Year sections */}
        <div className="flex flex-col gap-12">
          {byYear.map((y) => {
            const yearViews = y.clips.reduce((acc, c) => acc + (c.viewCount ?? 0), 0);
            // Top 3 by view count = featured row.
            const featured = [...y.clips]
              .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
              .slice(0, 3);
            const featuredIds = new Set(featured.map((c) => c.id));
            const rest = y.clips.filter((c) => !featuredIds.has(c.id));

            return (
              <div
                key={y.year}
                id={`${memberSlug}-y-${y.year}`}
                className="scroll-mt-24"
              >
                <div className="mb-4 flex items-end justify-between gap-3 border-b border-secondary pb-3">
                  <h3 className="text-display-xs font-semibold leading-none tracking-tight text-primary md:text-display-sm">
                    {y.year}
                  </h3>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                    {y.clips.length} clip{y.clips.length === 1 ? "" : "s"} · {formatCompact(yearViews)} views
                  </p>
                </div>

                {/* Featured — top 3, larger */}
                {featured.length > 0 ? (
                  <ul className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {featured.map((c, i) => (
                      <li key={c.id}>
                        <ClipTile
                          clip={c}
                          accent={accent}
                          size="featured"
                          rank={i + 1}
                          authed={authed}
                          isHidden={hidden.has(c.id)}
                          onOpen={() => setOpenClipId(c.id)}
                          onToggleHide={() => toggleHidden(c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* Rest — compact masonry-friendly grid */}
                {rest.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {rest.map((c) => (
                      <li key={c.id}>
                        <ClipTile
                          clip={c}
                          accent={accent}
                          size="compact"
                          authed={authed}
                          isHidden={hidden.has(c.id)}
                          onOpen={() => setOpenClipId(c.id)}
                          onToggleHide={() => toggleHidden(c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal — only here do we mount the actual ClipEmbed iframe. */}
      {openClip ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpenClipId(null)}
        >
          <div
            className="relative w-full max-w-[960px] overflow-hidden rounded-2xl bg-secondary ring-1 ring-inset ring-secondary shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenClipId(null)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/85"
            >
              <X size={15} />
            </button>
            <ClipEmbed clip={openClip} />
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-secondary bg-secondary px-4 py-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-balance text-md font-semibold leading-snug tracking-tight text-primary">
                  {openClip.title}
                </h4>
                <p className="mt-1 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                  <span>{formatLongDate(openClip.publishedAt)}</span>
                  {openClip.viewCount != null ? (
                    <span>· {formatCompact(openClip.viewCount)} views</span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ClipPlatformBadge source={openClip.source} />
                <ExternalClipLink clip={openClip} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClipTile({
  clip,
  accent,
  size,
  rank,
  authed,
  isHidden,
  onOpen,
  onToggleHide,
}: {
  clip: Clip;
  accent: string;
  size: "featured" | "compact";
  rank?: number;
  authed: boolean;
  isHidden: boolean;
  onOpen: () => void;
  onToggleHide: () => void;
}) {
  const isFeatured = size === "featured";
  const aspect = clip.aspect === "vertical" ? "aspect-[9/16]" : "aspect-video";

  return (
    <article
      className={`group/tile relative overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] transition-all duration-300 hover:-translate-y-0.5 ${
        isHidden ? "opacity-60" : ""
      }`}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 16px 40px -20px ${accent}77`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play ${clip.title}`}
        className={`relative block w-full ${aspect} overflow-hidden bg-black cursor-pointer media-tone`}
      >
        {clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clip.thumbnailUrl}
            alt={clip.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/tile:scale-[1.05]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-black to-[color:var(--bg-elev)]">
            <span style={{ color: accent }}>
              <PlatformLogo platform={clip.source} size={isFeatured ? 32 : 20} />
            </span>
          </div>
        )}

        {/* Top-left platform watermark */}
        <span className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md border border-white/15 bg-black/70 p-1.5 text-on-image backdrop-blur">
          <PlatformLogo platform={clip.source} size={isFeatured ? 13 : 11} />
        </span>

        {/* Top-right rank badge for featured */}
        {rank ? (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-tight backdrop-blur"
            style={{
              borderColor: `${accent}77`,
              background: `${accent}1f`,
              color: accent,
            }}
          >
            <TrendingUp size={9} /> #{rank}
          </span>
        ) : null}

        {/* Hover play affordance */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100"
        >
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-full backdrop-blur"
            style={{ background: `${accent}cc`, boxShadow: `0 0 32px ${accent}88` }}
          >
            <Play size={18} className="text-white" fill="currentColor" />
          </span>
        </span>

        {/* Bottom gradient + view count */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 50%, rgba(8,8,10,0.92) 100%)",
          }}
        />
        <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <span
            className={`line-clamp-2 text-balance font-semibold leading-snug tracking-tight text-on-image ${
              isFeatured ? "text-sm" : "text-xs"
            }`}
          >
            {clip.title}
          </span>
        </span>
      </button>

      <div
        className={`flex items-center justify-between gap-2 border-t border-secondary bg-secondary px-2.5 ${
          isFeatured ? "py-2" : "py-1.5"
        }`}
      >
        <span className="text-xs tabular-nums text-tertiary">
          {clip.viewCount != null ? `${formatCompact(clip.viewCount)} views` : "—"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-tight text-quaternary">
            {formatYearMonth(clip.publishedAt)}
          </span>
          <a
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open on platform"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
          >
            <ArrowUpRight size={11} />
          </a>
          {authed ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide();
              }}
              title={isHidden ? "Show on public archive" : "Hide from public archive"}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--core)]"
            >
              {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function formatCompact(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function formatYearMonth(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatLongDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

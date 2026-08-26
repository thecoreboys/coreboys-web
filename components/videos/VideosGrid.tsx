"use client";

import { useCallback, useMemo, useState } from "react";
import { Clock, LayoutGrid, PanelsTopLeft, PlayCircle, Youtube } from "lucide-react";
import type { FeedItem } from "@/lib/social-feed";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/components/providers/PlayerProvider";
import type { Playable } from "@/lib/watch/playable";

export type VideoChannel = {
  key: string;
  label: string;
  /** Number of videos this channel contributed — rendered as a count badge. */
  count?: number;
  /** Member chips show a Twitch avatar; org shows the YouTube mark. */
  kind?: "member" | "org";
  /** Member's real Twitch profile image. Absent → fall back to a monogram. */
  avatarUrl?: string;
};

/**
 * Derive the bare YouTube video id from a FeedItem. RSS items use an
 * `yt-<id>` id and a `watch?v=<id>` url — we try both, returning "" if
 * neither matches (the card then falls back to a plain link, no preview).
 */
function youTubeIdOf(item: FeedItem): string {
  if (item.id?.startsWith("yt-")) return item.id.slice(3);
  const m =
    /[?&]v=([0-9A-Za-z_-]{6,})/.exec(item.url ?? "") ??
    /youtu\.be\/([0-9A-Za-z_-]{6,})/.exec(item.url ?? "") ??
    /\/embed\/([0-9A-Za-z_-]{6,})/.exec(item.url ?? "");
  return m?.[1] ?? "";
}

function playableOf(item: FeedItem): Playable | null {
  const youtubeId = youTubeIdOf(item);
  if (!youtubeId) return null;
  return {
    key: item.id || `yt-${youtubeId}`,
    kind: "youtube",
    platform: "youtube",
    title: item.title,
    poster: item.thumbnailUrl ?? `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
    memberSlug: item.authorSlug === "org" ? null : item.authorSlug ?? null,
    memberLabel: item.authorLabel,
    accountLabel: item.authorLabel,
    youtubeId,
    twitchLogin: null,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: item.url,
    sourceUrl: item.url,
    embeddable: true,
    publishedAt: item.publishedAt,
    format: item.url?.includes("/shorts/") ? "short" : "long",
  };
}

/**
 * Client-side videos grid with a per-channel filter (button-group) plus a
 * centered hover/click video preview.
 *
 *  - Hover a card (after ~400ms) → muted autoplay preview opens centered.
 *  - Click a card → same player, unmuted + pinned until dismissed.
 *
 * Honors prefers-reduced-motion: no auto-open on hover when reduced (click
 * still works). The server resolves + fetches every channel's RSS and
 * hands us the merged, date-sorted list + a duration map; we filter +
 * render UUI-style cards and manage the preview state here.
 */
export function VideosGrid({
  videos,
  channels,
  durationById = {},
}: {
  videos: FeedItem[];
  channels: VideoChannel[];
  durationById?: Record<string, string>;
}) {
  const [active, setActive] = useState<string>("all");
  const player = usePlayer();

  const filtered = useMemo(
    () =>
      active === "all"
        ? videos
        : videos.filter((v) => (v.authorSlug ?? "org") === active),
    [videos, active],
  );

  const context = useMemo(
    () => filtered.map(playableOf).filter((item): item is Playable => Boolean(item)),
    [filtered],
  );

  const onCardClick = useCallback(
    (e: React.MouseEvent, vid: string, item: FeedItem) => {
      if (!vid) return; // no derivable id → let the link navigate normally
      e.preventDefault();
      const playable = playableOf(item);
      if (!playable) return;
      player.play(playable, context);
      void fetch("/api/account/presence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "video_play",
          subject: item.authorSlug ?? "house",
          ref: vid,
        }),
      });
    },
    [context, player],
  );

  if (videos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          No videos available right now
        </p>
      </div>
    );
  }

  const tabs: VideoChannel[] = [
    { key: "all", label: "All", count: videos.length },
    ...channels,
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Channel filter — horizontally scrollable row of avatar/logo pill
          chips. Active chip uses the Ironbow brand; each carries a count. */}
      <div
        role="tablist"
        aria-label="Filter videos by channel"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={cn(
                "group inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors cursor-pointer",
                isActive
                  ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
                  : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]",
              )}
            >
              <ChipMark channel={t} isAll={t.key === "all"} isActive={isActive} />
              <span className="whitespace-nowrap">{t.label}</span>
              {typeof t.count === "number" ? (
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    isActive
                      ? "bg-[color:var(--core)]/20 text-[color:var(--core)]"
                      : "bg-[color:var(--surface)] text-[color:var(--ink-faint)]",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-10 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            No videos from this channel yet
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((it, i) => {
            const vid = youTubeIdOf(it);
            const duration = vid ? durationById[vid] : undefined;
            const isOrg = (it.authorSlug ?? "org") === "org";
            const featured = i === 0;
            return (
              <li key={it.id} className={`group relative ${featured ? "sm:col-span-2" : ""}`}>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-icon="youtube"
                  onClick={(e) => onCardClick(e, vid, it)}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] shadow-xs-skeuomorphic transition-all hover:-translate-y-0.5 hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)] hover:shadow-md"
                >
                  <span className="relative block aspect-video w-full overflow-hidden bg-black media-tone">
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbnailUrl}
                        alt={it.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                        loading="lazy"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 55%, rgba(8,8,10,0.85) 100%)",
                      }}
                    />

                    {/* Channel badge — avatar/logo + label (org → "Main channel"). */}
                    <span className="absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-white/15 bg-black/55 py-1 pl-1 pr-2.5 backdrop-blur">
                      <CardMark
                        isOrg={isOrg}
                        label={it.authorLabel}
                        avatarUrl={
                          channels.find((c) => c.key === (it.authorSlug ?? "org"))
                            ?.avatarUrl
                        }
                      />
                      <span className="truncate text-xs font-semibold tracking-tight text-white">
                        {it.authorLabel}
                      </span>
                    </span>

                    {/* Platform mark — bottom-left. */}
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-1 backdrop-blur">
                      <Youtube size={12} className="text-[#FF0033]" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
                        YouTube
                      </span>
                    </span>

                    {/* Duration badge — bottom-right. Only when known. */}
                    {duration ? (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums tracking-tight text-white backdrop-blur">
                        <Clock size={10} className="opacity-70" />
                        {duration}
                      </span>
                    ) : null}

                    {/* Play affordance. */}
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                      <PlayCircle
                        size={52}
                        className="text-white transition-transform duration-200 group-hover:scale-105"
                        style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,.6))" }}
                      />
                    </span>
                  </span>

                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="line-clamp-2 text-balance text-sm font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                      {it.title}
                    </h3>
                    <span className="mt-auto flex items-center gap-2 border-t border-[color:var(--rule)] pt-2.5 text-xs font-medium text-[color:var(--ink-dim)]">
                      <span className="tabular-nums">
                        {formatRelative(it.publishedAt)}
                      </span>
                      <span aria-hidden className="text-[color:var(--ink-faint)]">
                        ·
                      </span>
                      <span className="truncate">{it.authorLabel}</span>
                    </span>
                  </div>
                </a>
                {vid ? (
                  <button
                    type="button"
                    aria-label={`Add ${it.title} to multiview`}
                    title="Add to multiview"
                    onClick={() => {
                      const playable = playableOf(it);
                      if (playable) player.addTile(playable, { focus: false });
                    }}
                    className="absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-full bg-black/65 text-white opacity-0 ring-1 ring-white/20 backdrop-blur transition hover:bg-black group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <PanelsTopLeft size={15} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}

/**
 * The small mark inside a card's channel badge: org → YouTube-red logo
 * badge; member → real Twitch avatar with monogram fallback.
 */
function CardMark({
  isOrg,
  label,
  avatarUrl,
}: {
  isOrg: boolean;
  label: string;
  avatarUrl?: string;
}) {
  if (isOrg) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF0033]">
        <Youtube size={11} className="text-white" />
      </span>
    );
  }
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className="h-5 w-5 rounded-full object-cover ring-1 ring-white/20"
        loading="lazy"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold uppercase text-white">
      {label.charAt(0)}
    </span>
  );
}

/**
 * The leading mark on each filter chip: a rounded avatar/logo badge.
 *  - "All"        → a neutral grid glyph.
 *  - org channel  → a YouTube-red badge with the YouTube mark.
 *  - member       → real Twitch avatar; falls back to an initial monogram.
 */
function ChipMark({
  channel,
  isAll,
  isActive,
}: {
  channel: VideoChannel;
  isAll: boolean;
  isActive: boolean;
}) {
  const ring = isActive
    ? "ring-[color:var(--core)]/40"
    : "ring-[color:var(--rule)]";

  if (isAll) {
    return (
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--surface)] ring-1",
          ring,
        )}
      >
        <LayoutGrid size={12} className="opacity-80" />
      </span>
    );
  }

  if (channel.kind === "org") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF0033] ring-1 ring-white/20">
        <Youtube size={13} className="text-white" />
      </span>
    );
  }

  if (channel.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={channel.avatarUrl}
        alt=""
        aria-hidden
        className={cn("h-6 w-6 rounded-full object-cover ring-1", ring)}
        loading="lazy"
      />
    );
  }

  // Monogram fallback when Twitch has no avatar / failed to resolve.
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--surface)] text-[11px] font-semibold uppercase ring-1",
        ring,
      )}
    >
      {channel.label.charAt(0)}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
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

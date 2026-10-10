"use client";

import Link from "next/link";
import { useState } from "react";
import { Calendar, Eye, LayoutGrid01, Play, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { MEMBERS } from "@/lib/members";
import type { LiveEntry } from "@/lib/twitch";
import { cn } from "@/lib/utils";
import { LiveDuration } from "@/components/watch/LiveAirtime";
import type { UnifiedLiveEntry } from "@/lib/watch/live-snapshot";
import { groupCrossPlatformLiveSources } from "@/lib/watch/live-source-groups";

type YouTubeLiveEntry = UnifiedLiveEntry & {
  platform: "youtube";
  youtubeId: string;
};

type ModalLiveSource = {
  key: string;
  kind: "live";
  platform: "twitch" | "youtube";
  memberSlug: string | null;
  memberLabel: string;
  entry: LiveEntry | YouTubeLiveEntry;
  member: (typeof MEMBERS)[number] | null;
};

function liveThumb(login: string, thumbnailUrl?: string) {
  if (thumbnailUrl) {
    const joiner = thumbnailUrl.includes("?") ? "&" : "?";
    return `${thumbnailUrl}${joiner}t=${Math.floor(Date.now() / 60_000)}`;
  }
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login.toLowerCase()}-640x360.jpg`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function youtubeThumb(entry: YouTubeLiveEntry): string {
  return entry.poster || `https://i.ytimg.com/vi/${entry.youtubeId}/hqdefault.jpg`;
}

function youtubeLiveHref(entry: YouTubeLiveEntry): string {
  const params = new URLSearchParams({
    kind: "live",
    src: "youtube",
    id: entry.youtubeId,
    ref: entry.id,
    url: entry.sourceUrl ?? `https://www.youtube.com/watch?v=${entry.youtubeId}`,
    title: entry.title ?? "YouTube live",
    format: "live",
    slug: entry.memberSlug ?? "house",
  });
  return `/theater?${params.toString()}`;
}

function LiveNowCard({ sources, onClose }: { sources: ModalLiveSource[]; onClose: () => void }) {
  const [selectedKey, setSelectedKey] = useState(sources[0]?.key ?? "");
  const source = sources.find((item) => item.key === selectedKey) ?? sources[0]!;
  const isYoutube = source.platform === "youtube";
  const twitchEntry = isYoutube ? null : source.entry as LiveEntry;
  const youtubeEntry = isYoutube ? source.entry as YouTubeLiveEntry : null;
  const title = source.entry.title || "On air";
  const poster = youtubeEntry
    ? youtubeThumb(youtubeEntry)
    : liveThumb(twitchEntry!.login, twitchEntry!.thumbnailUrl);
  const href = youtubeEntry
    ? youtubeLiveHref(youtubeEntry)
    : `/watch/live/${twitchEntry!.login}`;
  const viewers = source.entry.viewerCount;
  const startedAt = source.entry.startedAt;

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-[color:var(--bg)] ring-1 ring-[color:var(--rule-strong)]">
      <Link href={href as never} onClick={onClose} className="group relative block aspect-video overflow-hidden bg-black" aria-label={`Watch ${source.member?.stageName ?? source.memberLabel} live on ${isYoutube ? "YouTube" : "Twitch"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--live)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Live</span>
        {viewers != null ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] tabular-nums text-white/90">
            <Eye aria-hidden="true" className="size-3" /><span>{formatCount(viewers)}</span>
          </span>
        ) : null}
        <span className="absolute bottom-2 right-2 rounded-lg border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play aria-hidden="true" className="mr-1 inline size-3" fill="currentColor" />Watch {isYoutube ? "YouTube" : "Twitch"}
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-3">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-black text-[10px] font-bold text-white ring-1 ring-white/10">
          {source.member ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={source.member.comm.logo} alt="" className="h-[78%] w-[78%] object-contain" style={{ imageRendering: "pixelated" }} />
          ) : "YT"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold tracking-tight text-[color:var(--ink)]">{source.member?.stageName ?? source.memberLabel}</span>
          <span className="block text-[11px] text-[color:var(--ink-dim)]">{isYoutube ? "YouTube live" : `${source.member?.stageName ?? "Twitch"}${twitchEntry?.game ? ` · ${twitchEntry.game}` : ""}`}</span>
          <span className="mt-1 block break-words text-[13px] leading-snug text-[color:var(--ink)]">{title}</span>
          <LiveDuration startedAt={startedAt ?? undefined} className="mt-1.5 block text-[11px] tabular-nums text-[color:var(--ink-dim)]" />
          {sources.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Choose a live source">
              {sources.map((item) => {
                const active = item.key === source.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedKey(item.key)}
                    className={cn("min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors", active ? "border-[color:var(--core)] bg-[color:var(--core)]/15 text-[color:var(--ink)]" : "border-[color:var(--rule-strong)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)]/60 hover:text-[color:var(--ink)]")}
                  >
                    {item.platform === "youtube" ? "YouTube" : "Twitch"}{item.entry.viewerCount != null ? ` · ${formatCount(item.entry.viewerCount)}` : ""}
                  </button>
                );
              })}
            </div>
          ) : null}
        </span>
      </div>
    </li>
  );
}

export function LiveNowModal({
  entries,
  youtubeEntries = [],
  combinedViewers,
  onClose,
}: {
  entries: LiveEntry[];
  youtubeEntries?: YouTubeLiveEntry[];
  combinedViewers: number;
  onClose: () => void;
}) {
  const sources: ModalLiveSource[] = [
    ...entries.flatMap((entry) => {
      const member = MEMBERS.find((item) => item.twitchLogin.toLowerCase() === entry.login.toLowerCase());
      return member ? [{ key: `twitch:${entry.login.toLowerCase()}`, kind: "live" as const, platform: "twitch" as const, memberSlug: member.slug, memberLabel: member.stageName, entry, member }] : [];
    }),
    ...youtubeEntries.map((entry) => {
      const member = entry.memberSlug ? MEMBERS.find((item) => item.slug === entry.memberSlug) ?? null : null;
      return { key: `youtube:${entry.id}`, kind: "live" as const, platform: "youtube" as const, memberSlug: entry.memberSlug, memberLabel: member?.stageName ?? "YouTube", entry, member };
    }),
  ];
  const groups = groupCrossPlatformLiveSources(sources);
  const count = groups.length;
  const wide = count >= 2;
  const many = count >= 3;
  const fourOrMore = count >= 4;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live now"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl",
          fourOrMore ? "max-w-7xl" : many ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--rule)] px-5 py-3 md:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="inline-flex shrink-0 items-center gap-2 leading-none text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--live)]">
              <span
                aria-hidden
                className="size-2 rounded-full bg-[color:var(--live)]"
                style={{ animation: "live-blink 1s ease-in-out infinite" }}
              />
              Live now · {count}
            </p>
            {combinedViewers > 0 ? (
              <>
                <span aria-hidden className="hidden h-3.5 w-px shrink-0 bg-white/10 sm:block" />
                <p className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap leading-none text-xs tabular-nums text-[color:var(--ink-dim)]">
                  <Eye aria-hidden="true" className="size-3.5 shrink-0" />
                  {combinedViewers.toLocaleString("en-US")} watching across the house
                </p>
              </>
            ) : null}
          </div>
          <ButtonUtility
            size="sm"
            color="tertiary"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close"
            icon={XClose}
            className="max-md:size-11"
          />
        </div>

        <ul
          className={cn(
            "grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-3 md:p-4",
            count === 1
              ? "grid-cols-1"
              : count === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : count === 3
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {groups.map((group) => <LiveNowCard key={group.key} sources={group.sources} onClose={onClose} />)}
        </ul>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[color:var(--rule)] bg-[color:var(--bg)] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:px-4">
          <Button
            href="/guide"
            onPress={onClose}
            color="secondary"
            size="lg"
            iconLeading={Calendar}
            className="min-w-0 min-h-14 justify-start rounded-xl px-3.5 py-2.5 text-left sm:px-4"
          >
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span>Guide</span>
              <span className="mt-0.5 hidden text-xs font-medium text-current/60 sm:block">Browse the live schedule</span>
            </span>
          </Button>
          <Button
            href="/multiview?live=all"
            onPress={onClose}
            color="primary"
            size="lg"
            iconLeading={LayoutGrid01}
            className="min-w-0 min-h-14 justify-start rounded-xl px-3.5 py-2.5 text-left sm:px-4"
          >
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span>Open in multiview</span>
              <span className="mt-0.5 hidden text-xs font-medium text-current/70 sm:block">
                Watch all {count} live {count === 1 ? "stream" : "streams"}
              </span>
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Calendar, Eye, LayoutGrid01, Play, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { MEMBERS } from "@/lib/members";
import { networkLabel } from "@/lib/members-helpers";
import type { LiveEntry } from "@/lib/twitch";
import { cn } from "@/lib/utils";
import { LiveDuration } from "@/components/watch/LiveAirtime";

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

export function LiveNowModal({
  entries,
  combinedViewers,
  onClose,
}: {
  entries: LiveEntry[];
  combinedViewers: number;
  onClose: () => void;
}) {
  const rows = entries
    .map((e) => {
      const member = MEMBERS.find((m) => m.twitchLogin.toLowerCase() === e.login.toLowerCase());
      return member ? { entry: e, member } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const count = rows.length;
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
          {rows.map(({ entry, member }) => (
            <li key={entry.login}>
              <Link
                href={`/watch/live/${entry.login}` as never}
                onClick={onClose}
                className="group flex h-full flex-col overflow-hidden rounded-xl bg-[color:var(--bg)] ring-1 ring-[color:var(--rule-strong)] transition hover:ring-[color:var(--core)]/50"
              >
                <span className="relative aspect-video overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={liveThumb(entry.login, entry.thumbnailUrl)}
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--live)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                    Live
                  </span>
                  {entry.viewerCount != null ? (
                    <span
                      aria-label={`${entry.viewerCount.toLocaleString("en-US")} viewers`}
                      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] tabular-nums text-white/90"
                    >
                      <Eye aria-hidden="true" className="size-3" />
                      <span aria-hidden="true">{formatCount(entry.viewerCount)}</span>
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 inline-flex min-h-9 -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-white/20 bg-black/70 px-3 text-[11px] font-semibold text-white opacity-0 shadow-[0_8px_28px_rgba(0,0,0,.42)] backdrop-blur-md transition-[opacity,background-color,border-color] duration-150 group-hover:border-white/35 group-hover:bg-black/80 group-hover:opacity-100 group-focus-visible:border-white/40 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  >
                    <Play className="size-3.5" fill="currentColor" />
                    Watch live
                  </span>
                </span>
                <span className="flex items-start gap-2.5 px-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={member.comm.logo}
                      alt=""
                      className="h-[78%] w-[78%] object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold tracking-tight text-[color:var(--ink)]">
                      {networkLabel(member.comm.name)}
                    </span>
                    <span className="block break-words text-[11px] text-[color:var(--ink-dim)]">
                      {member.stageName}
                      {entry.game ? ` · ${entry.game}` : ""}
                    </span>
                    <span className="mt-1 block break-words text-[13px] leading-snug text-[color:var(--ink)]">
                      {entry.title || "On air"}
                    </span>
                    <LiveDuration
                      startedAt={entry.startedAt}
                      className="mt-1.5 block text-[11px] tabular-nums text-[color:var(--ink-dim)]"
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
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

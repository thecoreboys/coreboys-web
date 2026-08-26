"use client";

import Link from "next/link";
import type { WatchItem } from "@/lib/watch/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { resolveWatchState } from "@/lib/watch/status";
import { GROUP } from "@/lib/group";
import { formatHandleDisplay } from "@/lib/watch/display-label";
import { WatchMark } from "./WatchMark";
import { WatchThumb } from "./WatchThumb";
import { usePlayer } from "@/components/providers/PlayerProvider";

function publishedLabel(iso?: string) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GuideFeatured({
  featured,
  more = [],
}: {
  featured: WatchItem;
  more?: WatchItem[];
}) {
  const { user, loading: authLoading } = useAuth();
  const { map, ready } = useWatchProgress();
  const player = usePlayer();
  const yt = youtubeIdFromHref(featured.href);
  const mark = [featured.id, yt].filter(Boolean).map((r) => map[r as string]).find(Boolean);
  const signedIn = Boolean(user) && !authLoading && ready;
  const state = resolveWatchState({
    kind: featured.kind,
    publishedAt: featured.publishedAt,
    progress: mark?.progress ?? 0,
    completed: mark?.completed,
    signedIn,
  });

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="watch-kicker">Main channel</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl">
            Latest from CORE
          </h2>
        </div>
        <a
          href={GROUP.socials.youtube.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs uppercase tracking-widest text-[color:var(--ink-faint)] hover:text-[color:var(--core)]"
        >
          {formatHandleDisplay(GROUP.socials.youtube.handle)}
        </a>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.9fr)]">
        <Link
          href={featured.href as never}
          onClick={(e) => {
            e.preventDefault();
            player.play(featured, more);
          }}
          className="group relative overflow-hidden rounded-xl bg-[color:var(--bg-elev)] ring-1 ring-[color:var(--rule-strong)]"
        >
          <div className="relative aspect-video overflow-hidden bg-black">
            <WatchThumb
              youtubeId={yt}
              src={featured.backdrop || featured.poster}
              loading="eager"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            <span className="watch-preview-play opacity-90" aria-hidden />
            <div className="absolute left-3 top-3">
              <WatchMark state={state} inline />
            </div>
            {featured.duration ? (
              <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-white">
                {featured.duration}
              </span>
            ) : null}
          </div>
          <div className="px-4 py-4 md:px-5">
            <p className="watch-kicker">CORE · Latest upload</p>
            <h3 className="watch-title mt-1.5 text-2xl md:text-3xl">{featured.title}</h3>
            <p className="mt-2 text-sm text-[color:var(--ink-dim)]">
              Main channel
              {featured.publishedAt ? ` · ${publishedLabel(featured.publishedAt)}` : ""}
            </p>
            <span className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-[color:var(--core)] px-4 text-sm font-semibold text-white">
              Play
            </span>
          </div>
        </Link>

        {more.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {more.map((it) => (
              <MoreRow key={it.id} item={it} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function MoreRow({ item }: { item: WatchItem }) {
  const yt = youtubeIdFromHref(item.href);
  const player = usePlayer();
  return (
    <li>
      <Link
        href={item.href as never}
        onClick={(e) => {
          e.preventDefault();
          player.play(item);
        }}
        className="group flex gap-3 overflow-hidden rounded-xl bg-[color:var(--bg-elev)] ring-1 ring-[color:var(--rule-strong)]"
      >
        <span className="relative aspect-video w-[9.5rem] shrink-0 overflow-hidden bg-black">
          <WatchThumb
            youtubeId={yt}
            src={item.poster}
            className="h-full w-full object-cover transition duration-400 group-hover:scale-[1.04]"
          />
        </span>
        <span className="min-w-0 flex-1 py-2.5 pr-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
            Main channel
          </span>
          <span className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--ink)]">
            {item.title}
          </span>
          <span className="mt-1 block text-[11px] text-[color:var(--ink-dim)]">
            {publishedLabel(item.publishedAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

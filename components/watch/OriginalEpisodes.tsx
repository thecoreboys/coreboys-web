"use client";

import { useMemo } from "react";
import type { CoreOriginalItem } from "@/lib/core-originals";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { playableFromUrl } from "@/lib/watch/playable";
import { readableTitle } from "@/lib/watch/presentation";
import { WatchThumb } from "./WatchThumb";

function episodePlayable(item: CoreOriginalItem) {
  const parsed = playableFromUrl(item.sourceUrl);
  return parsed ? { ...parsed, title: item.title, poster: item.posterUrl || parsed.poster } : null;
}

export function OriginalStartButton({ items }: { items: CoreOriginalItem[] }) {
  const player = usePlayer();
  const { map } = useWatchProgress();
  const queue = useMemo(() => items.map(episodePlayable).filter((item) => item !== null), [items]);
  const resume = queue.find((item) => { const mark = map[item.key] ?? (item.youtubeId ? map[item.youtubeId] : undefined); return mark && !mark.completed && mark.positionSeconds >= 15; });
  const first = resume ?? queue[0];
  if (!first) return null;
  return <button type="button" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black" onClick={() => player.play(first, queue)}>{resume ? "Resume watching" : "Start watching"}</button>;
}

export function OriginalEpisodes({ items }: { items: CoreOriginalItem[] }) {
  const player = usePlayer();
  const { map } = useWatchProgress();
  const queue = useMemo(() => items.map(episodePlayable).filter((item) => item !== null), [items]);
  return <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => {
    const playable = episodePlayable(item);
    const mark = playable ? map[playable.key] ?? (playable.youtubeId ? map[playable.youtubeId] : undefined) : undefined;
    return <article key={item.id} className="overflow-hidden rounded-lg border border-white/15 bg-white/5">
      <div className="relative aspect-video bg-white/5"><WatchThumb src={item.posterUrl ?? ""} alt="" className="h-full w-full object-cover" />{mark?.progress ? <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50"><span className="block h-full bg-[color:var(--core)]" style={{ width: `${Math.min(100, mark.progress * 100)}%` }} /></span> : null}</div>
      <div className="space-y-2 p-4"><p className="text-sm text-white/65">Episode {index + 1} · {item.platform === "youtube" ? "YouTube" : item.platform}</p><h3 className="text-base font-semibold" title={item.title}>{readableTitle(item.title)}</h3>{item.subtitle ? <p className="text-sm text-white/70">{item.subtitle}</p> : null}<div className="flex flex-wrap items-center gap-4">{playable ? <button type="button" className="min-h-11 font-semibold underline underline-offset-4" onClick={() => player.play(playable, queue)}>{mark?.completed ? "Watch again" : mark?.progress ? "Resume" : "Play episode"}</button> : <span className="text-sm text-white/65">Watch on the source platform</span>}<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 py-3 text-sm text-white/70 underline underline-offset-4">Open original ↗</a></div></div>
    </article>;
  })}</div>;
}

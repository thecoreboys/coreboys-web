"use client";

import { useId, useMemo } from "react";
import { Check, ExternalLink, Play, RotateCcw } from "lucide-react";
import type { CoreOriginalItem } from "@/lib/core-originals";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { playableFromUrl } from "@/lib/watch/playable";
import { readableTitle } from "@/lib/watch/presentation";
import { WatchThumb } from "./WatchThumb";
import styles from "./OriginalEpisodes.module.css";

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

const PLATFORM_LABEL: Record<CoreOriginalItem["platform"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  twitch: "Twitch",
  x: "X",
  other: "Source",
};

export function OriginalEpisodes({ items }: { items: CoreOriginalItem[] }) {
  const player = usePlayer();
  const { map } = useWatchProgress();
  const idPrefix = useId();
  const queue = useMemo(() => items.map(episodePlayable).filter((item) => item !== null), [items]);
  return <ol className={styles.grid} aria-label="Episodes">{items.map((item, index) => {
    const playable = episodePlayable(item);
    const mark = playable ? map[playable.key] ?? (playable.youtubeId ? map[playable.youtubeId] : undefined) : undefined;
    const titleId = `${idPrefix}-episode-${index}`;
    const platform = PLATFORM_LABEL[item.platform] ?? "Source";
    const progress = mark?.progress && !mark.completed ? Math.min(1, mark.progress) : 0;
    const percentWatched = Math.round(progress * 100);
    const playLabel = mark?.completed ? "Watch again" : progress ? "Resume" : "Play episode";
    const play = playable ? () => player.play(playable, queue) : undefined;
    return <li key={item.id} className={styles.card}>
      <div className={styles.media}>
        {/* The thumbnail is a pointer shortcut. Keyboard and screen reader users get the labelled Play button below, so it stays out of the tab order. */}
        <button type="button" className={styles.thumb} onClick={play} disabled={!play} tabIndex={-1} aria-hidden="true" data-cursor-hint={progress ? "Resume episode" : "Play episode"}>
          <WatchThumb src={item.posterUrl ?? ""} alt="" className={styles.thumbImage} />
          <span className={styles.scrim} />
          {play ? <span className={styles.playOverlay}><Play size={22} strokeWidth={0} fill="currentColor" /></span> : null}
        </button>
        <span className={styles.badge}>Ep {index + 1}</span>
        {mark?.completed ? <span className={styles.status}><Check size={12} strokeWidth={3} aria-hidden="true" />Watched</span> : null}
        {progress ? <span className={styles.progress} role="progressbar" aria-label={`${percentWatched}% watched`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentWatched}><span style={{ width: `${progress * 100}%` }} /></span> : null}
      </div>
      <div className={styles.body}>
        <h3 id={titleId} className={styles.title} title={item.title}><span className={styles.srOnly}>Episode {index + 1}: </span>{readableTitle(item.title)}</h3>
        <p className={styles.meta}>{item.subtitle ? <span className={styles.metaStrong}>{item.subtitle}</span> : null}<span>{platform}</span></p>
        <div className={styles.actions}>
          {play ? <button type="button" className={`${styles.button} ${styles.primary}`} onClick={play} aria-describedby={titleId}>{mark?.completed ? <RotateCcw size={16} strokeWidth={2.4} aria-hidden="true" /> : <Play size={16} strokeWidth={0} fill="currentColor" aria-hidden="true" />}{playLabel}</button> : null}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${styles.button} ${styles.secondary}${play ? "" : ` ${styles.secondaryAsPrimary}`}`} aria-describedby={titleId}>{play ? "Open original" : `Watch on ${platform}`}<ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" /><span className={styles.srOnly}> (opens in a new tab)</span></a>
        </div>
      </div>
    </li>;
  })}</ol>;
}

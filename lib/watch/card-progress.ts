import type { WatchItem } from "./types";
import { homeItemReferences } from "./home-catalog";

type PlaybackMark = {
  progress: number;
  completed: boolean;
  positionSeconds: number;
  durationSeconds: number;
  positionUpdatedAt?: string | null;
};

/** Resolve the same catalog/provider aliases used by Continue Watching. */
export function cardPlaybackProgress(item: WatchItem, map: Readonly<Record<string, PlaybackMark | undefined>>) {
  const marks = homeItemReferences(item).flatMap((ref) => map[ref] ? [map[ref]!] : []);
  const positionTime = (mark: PlaybackMark) => {
    const time = Date.parse(mark.positionUpdatedAt ?? "");
    return Number.isFinite(time) ? time : -Infinity;
  };
  const latest = [...marks].sort((left, right) => {
    const leftTime = positionTime(left), rightTime = positionTime(right);
    return leftTime === rightTime ? right.positionSeconds - left.positionSeconds : rightTime - leftTime;
  })[0];
  const progress = Math.min(1, Math.max(0, ...marks.map((mark) => mark.progress)));
  const done = marks.some((mark) => mark.completed);
  const durationSeconds = Math.max(0, item.durationSeconds ?? 0, ...marks.map((mark) => mark.durationSeconds));
  // A measured zero is a real rewind, not missing history. Only legacy marks
  // without a measured position fall back to their own progress percentage.
  const position = latest && (positionTime(latest) !== -Infinity || latest.positionSeconds > 0)
    ? latest.positionSeconds
    : durationSeconds * (latest?.progress ?? 0);
  return { progress, done, durationSeconds, positionSeconds: done ? 0 : Math.min(durationSeconds || Infinity, Math.max(0, position)) };
}

import type { WatchItem } from "./types";

export const CONTINUE_WATCHING_MIN_SECONDS = 60;
export const CONTINUE_WATCHING_TTL_DAYS = 30;
export const CONTINUE_WATCHING_TTL_MS = CONTINUE_WATCHING_TTL_DAYS * 24 * 60 * 60 * 1_000;
export const CONTINUE_WATCHING_CLOCK_SKEW_MS = 5 * 60 * 1_000;
export const HERO_CONTINUE_WATCHING_LIMIT = 3;

export type ContinueWatchingMark = {
  completed?: boolean;
  seconds?: number;
  progress?: number;
  positionUpdatedAt?: string | null;
  updatedAt?: string | null;
};

function parsedTime(value: string | null | undefined) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

/**
 * Playback recency deliberately ignores ordinary hover activity. Older marks
 * did not store a separate position timestamp, so an absent/null field falls
 * back to their general activity timestamp when real watch seconds exist.
 */
export function continueWatchingPlaybackTime(mark: ContinueWatchingMark): number {
  if ((mark.seconds ?? 0) <= 0) return -Infinity;
  return parsedTime(mark.positionUpdatedAt ?? mark.updatedAt);
}

export function isContinueWatchingMark(
  mark: ContinueWatchingMark | null | undefined,
  now = Date.now(),
): boolean {
  if (
    !mark ||
    mark.completed ||
    (mark.progress ?? 0) >= 0.9 ||
    Math.max(0, mark.seconds ?? 0) < CONTINUE_WATCHING_MIN_SECONDS
  ) {
    return false;
  }
  const activityAt = continueWatchingPlaybackTime(mark);
  const age = now - activityAt;
  return Number.isFinite(activityAt) &&
    age >= -CONTINUE_WATCHING_CLOCK_SKEW_MS &&
    age <= CONTINUE_WATCHING_TTL_MS;
}

/** Combine catalog/provider aliases without double-counting their watch time. */
export function bestWatchProgressMark<T extends ContinueWatchingMark>(
  marks: readonly (T | null | undefined)[],
): T | undefined {
  const known = marks.filter((mark): mark is T => Boolean(mark));
  if (!known.length) return undefined;
  const playbackWinner = [...known].sort(
    (left, right) =>
      continueWatchingPlaybackTime(right) - continueWatchingPlaybackTime(left) ||
      (right.seconds ?? 0) - (left.seconds ?? 0) ||
      (right.progress ?? 0) - (left.progress ?? 0),
  )[0]!;
  return {
    ...playbackWinner,
    completed: known.some((mark) => mark.completed || (mark.progress ?? 0) >= 0.9),
    seconds: Math.max(0, ...known.map((mark) => mark.seconds ?? 0)),
    progress: Math.max(0, ...known.map((mark) => mark.progress ?? 0)),
    positionUpdatedAt: playbackWinner.positionUpdatedAt,
    updatedAt: playbackWinner.updatedAt,
  } as T;
}

export function selectContinueWatchingItems<T extends ContinueWatchingMark>(
  items: readonly WatchItem[],
  progress: Readonly<Record<string, T | undefined>>,
  itemReferences: (item: WatchItem) => readonly string[],
  options: { limit?: number; now?: number } = {},
): WatchItem[] {
  const now = options.now ?? Date.now();
  const candidates = items
    .map((item, index) => {
      const references = [...new Set(itemReferences(item).filter(Boolean))];
      return {
        index,
        item,
        mark: bestWatchProgressMark(references.map((reference) => progress[reference])),
        references,
      };
    })
    .filter(
      ({ item, mark }) =>
        item.kind !== "live" &&
        item.kind !== "post" &&
        item.format !== "live" &&
        item.format !== "photo" &&
        isContinueWatchingMark(mark, now),
    )
    .sort(
      (left, right) =>
        continueWatchingPlaybackTime(right.mark!) - continueWatchingPlaybackTime(left.mark!) ||
        left.index - right.index,
    );

  const selected: WatchItem[] = [];
  const seen = new Set<string>();
  const limit = Math.max(0, options.limit ?? Number.POSITIVE_INFINITY);
  if (limit === 0) return selected;
  for (const candidate of candidates) {
    const identities = [candidate.item.id, ...candidate.references];
    if (identities.some((identity) => seen.has(identity))) continue;
    identities.forEach((identity) => seen.add(identity));
    selected.push(candidate.item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function buildWatchHeroItems(
  live: readonly WatchItem[],
  continueWatching: readonly WatchItem[],
  latestCore: WatchItem | null | undefined,
): WatchItem[] {
  const seen = new Set<string>();
  const hero: WatchItem[] = [];
  const add = (item: WatchItem) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    hero.push(item);
    return true;
  };
  live.forEach(add);
  if (latestCore) add(latestCore);
  let addedContinue = 0;
  for (const item of continueWatching) {
    if (!add(item)) continue;
    addedContinue += 1;
    if (addedContinue === HERO_CONTINUE_WATCHING_LIMIT) break;
  }
  return hero;
}

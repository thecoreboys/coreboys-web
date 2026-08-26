import type { WatchFeedbackEntry } from "./discovery-state";
import type { WatchItem } from "./types";

export type CreatorAffinityMark = {
  completed?: boolean;
  hoverCount?: number;
  progress?: number;
  seconds?: number;
  updatedAt?: string;
};

export type CreatorAffinityProfile = {
  personalized: boolean;
  scores: ReadonlyMap<string, number>;
  orderedCreators: string[];
};

type CreatorAffinityOptions = {
  enabled: boolean;
  feedback?: Record<string, WatchFeedbackEntry>;
  favoriteSlug?: string | null;
  itemReferences?: (item: WatchItem) => readonly string[];
  now?: number;
  progress?: Readonly<Record<string, CreatorAffinityMark | undefined>>;
  savedItemIds?: readonly string[];
};

function creatorKey(item: WatchItem) {
  return item.memberSlug ?? "house";
}

function validTimestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function markWeight(mark: CreatorAffinityMark) {
  return (
    Math.max(0, mark.seconds ?? 0) +
    Math.max(0, Math.min(1, mark.progress ?? 0)) * 600 +
    (mark.completed ? 900 : 0)
  );
}

function bestMark(
  item: WatchItem,
  progress: Readonly<Record<string, CreatorAffinityMark | undefined>>,
  itemReferences: (item: WatchItem) => readonly string[],
) {
  return [...new Set(itemReferences(item).filter(Boolean))]
    .map((reference) => ({ mark: progress[reference], reference }))
    .filter((entry): entry is { mark: CreatorAffinityMark; reference: string } => Boolean(entry.mark))
    .sort((left, right) => markWeight(right.mark) - markWeight(left.mark))[0];
}

/**
 * Builds a small, explainable creator preference profile from activity the
 * viewer generated on CORE. Recent watch time is the main signal; saves,
 * ratings, completions, and the explicit favorite refine it. Callers decide
 * whether that profile is allowed to reorder account-only surfaces.
 */
export function buildCreatorAffinity(
  items: readonly WatchItem[],
  options: CreatorAffinityOptions,
): CreatorAffinityProfile {
  if (!options.enabled) {
    return { personalized: false, scores: new Map(), orderedCreators: [] };
  }

  const scores = new Map<string, number>();
  const progress = options.progress ?? {};
  const saved = new Set(options.savedItemIds ?? []);
  const itemReferences = options.itemReferences ?? ((item: WatchItem) => [item.id]);
  const usedProgressRefs = new Set<string>();
  const now = options.now ?? Date.now();
  let signalCount = 0;
  const add = (key: string, amount: number) => {
    scores.set(key, (scores.get(key) ?? 0) + amount);
    signalCount += 1;
  };

  for (const item of items) {
    const key = creatorKey(item);
    const watched = bestMark(item, progress, itemReferences);
    if (watched && !usedProgressRefs.has(watched.reference)) {
      usedProgressRefs.add(watched.reference);
      const mark = watched.mark;
      const seconds = Math.max(0, mark.seconds ?? 0);
      const progressValue = Math.max(0, Math.min(1, mark.progress ?? 0));
      if (seconds > 0 || progressValue > 0 || mark.completed) {
        const updatedAt = validTimestamp(mark.updatedAt);
        const ageMs = updatedAt === null ? 0 : Math.max(0, now - updatedAt);
        const recency = updatedAt === null
          ? 1
          : Math.max(0.3, Math.exp(-ageMs / (90 * 86_400_000)));
        // Logarithmic time keeps one marathon stream from permanently
        // outweighing a consistent habit across several titles.
        const watchSignal = (
          Math.log2(1 + seconds / 30) * 70 +
          progressValue * 90 +
          (mark.completed ? 70 : 0)
        ) * recency;
        add(key, watchSignal);
      }
    }

    if (saved.has(item.id)) add(key, 70);
    const rating = options.feedback?.[item.id]?.value;
    if (rating === "like") add(key, 260);
    if (rating === "dislike") add(key, -90);
    if (rating === "not_interested") add(key, -180);
  }

  if (options.favoriteSlug) add(options.favoriteSlug, 600);

  const orderedCreators = [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key]) => key);

  return {
    personalized: signalCount > 0,
    scores,
    orderedCreators,
  };
}

export function rankByCreatorAffinity<T extends Pick<WatchItem, "memberSlug">>(
  items: readonly T[],
  scores: ReadonlyMap<string, number>,
): T[] {
  if (scores.size === 0) return [...items];
  return items
    .map((item, index) => ({
      index,
      item,
      score: scores.get(item.memberSlug ?? "house") ?? 0,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export function rankCreatorSlugs(
  slugs: readonly string[],
  scores: ReadonlyMap<string, number>,
) {
  if (scores.size === 0) return [...slugs];
  return slugs
    .map((slug, index) => ({ index, score: scores.get(slug) ?? 0, slug }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ slug }) => slug);
}

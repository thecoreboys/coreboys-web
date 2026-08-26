export type ShortFormNavigationDirection = "next" | "previous";

type ShortFormNavigationItem = {
  key: string;
  kind?: string | null;
  platform?: string | null;
  format?: string | null;
  orientation?: string | null;
};

export type ShortFormNavigationTarget<T> = {
  item: T;
  index: number;
  total: number;
};

/**
 * Keep Theater's vertical navigation limited to playable short-form media.
 * Portrait photos, posts, and live channels remain outside the swipe/scroll
 * session even when their artwork happens to be vertical.
 */
export function isShortFormNavigationItem(item: ShortFormNavigationItem): boolean {
  if (item.kind === "live" || item.kind === "post" || item.format === "photo") return false;
  return item.format === "short" || item.orientation === "portrait";
}

/**
 * Short-form viewing is continuous: finished Shorts, Reels, TikToks, and
 * other portrait videos move on immediately. Standard videos retain the
 * calmer decision window before autoplay advances.
 */
export function autoplayCountdownSeconds(
  item: ShortFormNavigationItem,
  hasQueuedItem: boolean,
): number {
  if (isShortFormNavigationItem(item)) return 0;
  return hasQueuedItem ? 8 : 4;
}

export function shortFormNavigationItems<T extends ShortFormNavigationItem>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!isShortFormNavigationItem(item) || seen.has(item.key)) continue;
    seen.add(item.key);
    result.push(item);
  }
  return result;
}

export function shortFormNavigationPosition<T extends ShortFormNavigationItem>(
  items: readonly T[],
  currentKey: string | null | undefined,
): { index: number; total: number } | null {
  const eligible = shortFormNavigationItems(items);
  const index = eligible.findIndex((item) => item.key === currentKey);
  if (index < 0 || eligible.length < 2) return null;
  return { index: index + 1, total: eligible.length };
}

/**
 * Return a small, ordered window after the current short. The window wraps in
 * the same order as navigation but never includes the current item, allowing
 * Theater to keep upcoming provider frames warm without loading the full
 * channel at once.
 */
export function shortFormPreloadItems<T extends ShortFormNavigationItem>(
  items: readonly T[],
  currentKey: string | null | undefined,
  limit = 3,
): T[] {
  const eligible = shortFormNavigationItems(items);
  const currentIndex = eligible.findIndex((item) => item.key === currentKey);
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (currentIndex < 0 || eligible.length < 2 || boundedLimit === 0) return [];

  const result: T[] = [];
  const count = Math.min(boundedLimit, eligible.length - 1);
  for (let offset = 1; offset <= count; offset += 1) {
    const item = eligible[(currentIndex + offset) % eligible.length];
    if (item) result.push(item);
  }
  return result;
}

export function shortFormNavigationTarget<T extends ShortFormNavigationItem>(
  items: readonly T[],
  currentKey: string | null | undefined,
  direction: ShortFormNavigationDirection,
): ShortFormNavigationTarget<T> | null {
  const eligible = shortFormNavigationItems(items);
  if (eligible.length < 2) return null;
  const currentIndex = eligible.findIndex((item) => item.key === currentKey);
  if (currentIndex < 0) return null;
  const step = direction === "next" ? 1 : -1;
  const index = (currentIndex + step + eligible.length) % eligible.length;
  const item = eligible[index];
  return item ? { item, index: index + 1, total: eligible.length } : null;
}

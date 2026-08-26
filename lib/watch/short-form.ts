import type { WatchItem, WatchPlatform } from "./types";

const SHORT_FORM_PLATFORMS = ["youtube", "instagram", "tiktok"] as const;

type ShortFormPlatform = (typeof SHORT_FORM_PLATFORMS)[number];

function isShortFormPlatform(platform: WatchPlatform): platform is ShortFormPlatform {
  return (SHORT_FORM_PLATFORMS as readonly WatchPlatform[]).includes(platform);
}

function sourceKey(item: WatchItem): string {
  return `${item.memberSlug ?? "core"}:${item.accountLabel ?? item.memberLabel}`;
}

/**
 * Round-robin creator accounts without changing the order inside an account.
 * The input is already ranked by recency or viewer affinity.
 */
function balanceCreators(items: readonly WatchItem[]): WatchItem[] {
  const buckets = new Map<string, WatchItem[]>();
  for (const item of items) {
    const key = sourceKey(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const balanced: WatchItem[] = [];
  let depth = 0;
  while (balanced.length < items.length) {
    let added = false;
    for (const bucket of buckets.values()) {
      const item = bucket[depth];
      if (!item) continue;
      balanced.push(item);
      added = true;
    }
    if (!added) break;
    depth += 1;
  }
  return balanced;
}

/**
 * Keep Shorts, Reels, and TikToks visibly mixed. Every connected platform
 * receives one turn before any platform receives another, and creators are
 * round-robined inside each platform so one busy account cannot take over.
 */
export function selectShortFormRailItems(
  items: readonly WatchItem[],
  limit = 30,
): WatchItem[] {
  if (limit <= 0) return [];

  const eligible = items.filter(
    (item) => item.format === "short" && isShortFormPlatform(item.platform),
  );
  const firstIndex = new Map<ShortFormPlatform, number>();
  const byPlatform = new Map<ShortFormPlatform, WatchItem[]>();
  for (const [index, item] of eligible.entries()) {
    const platform = item.platform as ShortFormPlatform;
    if (!firstIndex.has(platform)) firstIndex.set(platform, index);
    const bucket = byPlatform.get(platform);
    if (bucket) bucket.push(item);
    else byPlatform.set(platform, [item]);
  }

  const platforms = [...byPlatform.keys()].sort(
    (left, right) => (firstIndex.get(left) ?? 0) - (firstIndex.get(right) ?? 0),
  );
  const queues = new Map(
    platforms.map((platform) => [platform, balanceCreators(byPlatform.get(platform) ?? [])]),
  );
  const selected: WatchItem[] = [];
  let depth = 0;
  while (selected.length < Math.min(limit, eligible.length)) {
    let added = false;
    for (const platform of platforms) {
      const item = queues.get(platform)?.[depth];
      if (!item) continue;
      selected.push(item);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
    depth += 1;
  }
  return selected;
}

export function shortFormPlatformLabel(item: Pick<WatchItem, "format" | "platform">): string | null {
  if (item.format !== "short") return null;
  if (item.platform === "youtube") return "YouTube Short";
  if (item.platform === "instagram") return "Instagram Reel";
  if (item.platform === "tiktok") return "TikTok";
  return null;
}

export function shortFormRailSummary(items: readonly WatchItem[]): string {
  const counts = new Map<ShortFormPlatform, number>();
  for (const item of items) {
    if (item.format !== "short" || !isShortFormPlatform(item.platform)) continue;
    counts.set(item.platform, (counts.get(item.platform) ?? 0) + 1);
  }

  const labels: string[] = [];
  const youtube = counts.get("youtube") ?? 0;
  const instagram = counts.get("instagram") ?? 0;
  const tiktok = counts.get("tiktok") ?? 0;
  if (youtube) labels.push(`${youtube} YouTube ${youtube === 1 ? "Short" : "Shorts"}`);
  if (instagram) labels.push(`${instagram} Instagram ${instagram === 1 ? "Reel" : "Reels"}`);
  if (tiktok) labels.push(`${tiktok} ${tiktok === 1 ? "TikTok" : "TikToks"}`);
  return labels.join(" · ") || "Connected YouTube Shorts, Instagram Reels, and TikToks";
}

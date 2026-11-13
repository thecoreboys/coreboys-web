import type { SocialContentType } from "@/lib/social-alert";
import type { WatchItem } from "@/lib/watch/types";

/**
 * "Catch up": what a signed-in fan missed since they last caught up. Pure and
 * client-safe. The server (lib/catch-up-server.ts) selects items from the
 * normalized Watch catalog, so catch-up always matches what the site can play.
 */

/** Window event fired after a fan marks items seen or changes catch-up choices. */
export const CATCH_UP_CHANGED_EVENT = "core:catch-up-changed";

export type CatchUpKind = "live" | "broadcast" | "video" | "clip" | "short" | "reel" | "photo" | "post";

export const CATCH_UP_KIND_LABEL: Record<CatchUpKind, string> = {
  live: "Went live",
  broadcast: "Past broadcast",
  video: "New video",
  clip: "New clip",
  short: "New short",
  reel: "New Reel",
  photo: "New photo",
  post: "New post",
};

/** Plural filter labels for the catch-up page. */
export const CATCH_UP_KIND_FILTER_LABEL: Record<CatchUpKind, string> = {
  live: "Live",
  broadcast: "Broadcasts",
  video: "Videos",
  clip: "Clips",
  short: "Shorts",
  reel: "Reels",
  photo: "Photos",
  post: "Posts",
};

/** Default look-back for a fan who has never caught up before. */
export const CATCH_UP_FIRST_VISIT_MS = 7 * 24 * 60 * 60 * 1_000;
/** Older misses are not useful as "new"; the channel pages keep the archive. */
export const CATCH_UP_MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000;
export const CATCH_UP_ITEM_LIMIT = 200;
export const CATCH_UP_KEY_PATTERN = /^[a-z]+:\S{1,300}$/;

export function catchUpKindOf(item: WatchItem): CatchUpKind {
  if (item.kind === "live") return "live";
  if (item.kind === "vod") return "broadcast";
  if (item.format === "photo") return "photo";
  // TikTok/Instagram posts are normalized with kind "clip"; they are short-form.
  if (item.platform === "instagram") return "reel";
  if (item.platform === "tiktok") return "short";
  if (item.platform === "x") return "post";
  if (item.kind === "clip") return "clip";
  if (item.format === "short") return "short";
  return "video";
}

/**
 * Catch-up reuses the creator alert rules (Account settings > Creator alerts),
 * so one per-creator, per-type choice controls both surfaces.
 */
export function socialContentTypeForCatchUp(kind: CatchUpKind): SocialContentType {
  if (kind === "live" || kind === "broadcast") return "live";
  if (kind === "short" || kind === "reel") return "short";
  if (kind === "photo") return "photo";
  if (kind === "post") return "post";
  return "video";
}

export function catchUpItemKey(item: Pick<WatchItem, "platform" | "id">): string {
  return `${item.platform}:${item.id}`;
}

export function catchUpTimestamp(item: WatchItem): number {
  const values = item.kind === "live" ? [item.live?.startedAt, item.publishedAt] : [item.publishedAt, item.live?.startedAt];
  for (const value of values) {
    const parsed = Date.parse(value ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export type CatchUpRule = { memberSlug: string; contentType: SocialContentType; enabled: boolean };

export function catchUpRuleKey(memberSlug: string | null) {
  return memberSlug ?? "core";
}

/** Rules default on: only an explicit `enabled: false` hides a creator/type. */
export function isCatchUpAllowed(item: WatchItem, rules: readonly CatchUpRule[]): boolean {
  const member = catchUpRuleKey(item.memberSlug);
  const type = socialContentTypeForCatchUp(catchUpKindOf(item));
  return !rules.some((rule) => rule.memberSlug === member && rule.contentType === type && !rule.enabled);
}

export type CatchUpEntry = {
  key: string;
  kind: CatchUpKind;
  at: string;
  item: WatchItem;
};

export type CatchUpSelection = {
  since: number;
  /** New since `since`, newest first, excluding seen/watched/muted items. */
  entries: CatchUpEntry[];
  /** Currently live rooms that started before `since` (shown, not counted). */
  liveNow: CatchUpEntry[];
};

/**
 * Selects what a fan missed. `seen` holds per-item dismissals and `watched`
 * holds item keys the fan already played on CORE: either one means the item
 * is no longer "missed".
 */
export function selectCatchUp({ items, since, now, rules, seen, watched, limit = CATCH_UP_ITEM_LIMIT }: {
  items: readonly WatchItem[];
  since: number;
  now: number;
  rules: readonly CatchUpRule[];
  seen: ReadonlySet<string>;
  watched: ReadonlySet<string>;
  limit?: number;
}): CatchUpSelection {
  const floor = Math.max(since, now - CATCH_UP_MAX_LOOKBACK_MS);
  const entries: CatchUpEntry[] = [];
  const liveNow: CatchUpEntry[] = [];
  const keys = new Set<string>();
  for (const item of items) {
    const key = catchUpItemKey(item);
    if (keys.has(key)) continue;
    keys.add(key);
    if (!isCatchUpAllowed(item, rules)) continue;
    const at = catchUpTimestamp(item);
    const entry = { key, kind: catchUpKindOf(item), at: new Date(at || now).toISOString(), item };
    if (at > floor && at <= now + 60_000) {
      if (seen.has(key) || watched.has(key)) continue;
      entries.push(entry);
    } else if (item.kind === "live") {
      liveNow.push(entry);
    }
  }
  const newest = (a: CatchUpEntry, b: CatchUpEntry) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key);
  entries.sort((a, b) => Number(b.kind === "live") - Number(a.kind === "live") || newest(a, b));
  liveNow.sort(newest);
  return { since: floor, entries: entries.slice(0, limit), liveNow };
}

export type CatchUpGroup = {
  memberSlug: string;
  label: string;
  count: number;
  kinds: Partial<Record<CatchUpKind, number>>;
};

export function groupCatchUp(entries: readonly CatchUpEntry[]): CatchUpGroup[] {
  const groups = new Map<string, CatchUpGroup>();
  for (const entry of entries) {
    const slug = catchUpRuleKey(entry.item.memberSlug);
    const group = groups.get(slug) ?? { memberSlug: slug, label: entry.item.memberSlug ? entry.item.memberLabel : "CORE", count: 0, kinds: {} };
    group.count += 1;
    group.kinds[entry.kind] = (group.kinds[entry.kind] ?? 0) + 1;
    groups.set(slug, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type CatchUpSummary = {
  count: number;
  since: string;
  creators: Array<{ memberSlug: string; label: string; count: number }>;
  liveNow: number;
};

export type CatchUpResponse = CatchUpSummary & {
  generatedAt: string;
  entries: CatchUpEntry[];
  liveEntries: CatchUpEntry[];
  groups: CatchUpGroup[];
  /** False until the catch-up tables exist; the page then works read-only. */
  persistent: boolean;
};

export function summarizeCatchUp(selection: CatchUpSelection): CatchUpSummary {
  return {
    count: selection.entries.length,
    since: new Date(selection.since).toISOString(),
    creators: groupCatchUp(selection.entries).slice(0, 4).map(({ memberSlug, label, count }) => ({ memberSlug, label, count })),
    liveNow: selection.liveNow.length + selection.entries.filter((entry) => entry.kind === "live").length,
  };
}

export function catchUpSinceLabel(since: string, now = Date.now()): string {
  const at = Date.parse(since);
  if (!Number.isFinite(at)) return "recently";
  const hours = Math.round((now - at) / 3_600_000);
  if (hours < 1) return "the last hour";
  if (hours < 24) return `the last ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `the last ${days} days`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(at);
}

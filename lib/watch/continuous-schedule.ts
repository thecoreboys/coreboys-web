// Node's type-stripping test runner requires the explicit suffix; Next resolves it as well.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { itemDurationSeconds, type GuideNetworkGroup, type GuideNetworkRow } from "./channels.ts";
import { projectedLiveEndMs } from "./live-schedule";
import type { WatchItem } from "./types";

/** The Guide never promises a linear schedule more than this far ahead. */
export const CONTINUOUS_GUIDE_FUTURE_HORIZON_MS = 18 * 60 * 60 * 1000;

/**
 * Provider durations can occasionally be absent or implausibly tiny. This is
 * also the minimum already enforced by `itemDurationSeconds`.
 */
export const CONTINUOUS_GUIDE_MIN_AIRING_MS = 30 * 1000;

const UNKNOWN_AVAILABILITY_EPOCH_MS = Date.UTC(2020, 0, 1);

export type ContinuousGuideScheduleBlock = {
  id: string;
  item: WatchItem;
  /** Exact millisecond boundaries for timeline math. */
  startMs: number;
  endMs: number;
  /** ISO mirrors for direct conversion into the Guide's program shape. */
  startsAt: string;
  endsAt: string;
  source: "rotation" | "live";
  current: boolean;
  /** True when a live broadcast interrupted or resumed this airing. */
  interrupted: boolean;
  /** True only when the 18-hour planning horizon shortened this block. */
  horizonClipped: boolean;
};

export type BuildContinuousGuideScheduleInput = {
  group: GuideNetworkGroup;
  row: GuideNetworkRow;
  rangeStart: number;
  rangeEnd: number;
  /** Required rather than read internally so identical inputs stay pure. */
  nowMs: number;
  /**
   * Recently ended provider streams whose interruption must remain part of
   * the shared clock. This lets a client resume the exact program remainder
   * after a catalog refresh reports that a stream has ended.
   */
  completedLiveInterruptions?: readonly CompletedLiveInterruption[];
};

export type CompletedLiveInterruption = {
  item: WatchItem;
  startsAtMs: number;
  endsAtMs: number;
};

type Candidate = {
  item: WatchItem;
  availableAt: number;
  durationMs: number;
  orderKey: string;
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finiteTimestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Replays become eligible when published, while a current live broadcast is
 * eligible from its reported start. Falling back to the other timestamp keeps
 * partially populated provider records safe without inventing a later date.
 */
function itemAvailability(item: WatchItem): number | null {
  const published = finiteTimestamp(item.publishedAt);
  const liveStart = finiteTimestamp(item.live?.startedAt);
  if (item.kind === "live" || item.format === "live") {
    return liveStart ?? published;
  }
  return published ?? liveStart;
}

function itemKey(item: WatchItem): string {
  return `${item.platform}:${item.id}`;
}

function playable(item: WatchItem): boolean {
  if (item.format === "photo" || item.kind === "post") return false;
  return item.embeddable !== false || Boolean(item.mediaUrl || item.embedUrl);
}

function uniqueNetworkItems(group: GuideNetworkGroup, row: GuideNetworkRow): WatchItem[] {
  const unique = new Map<string, WatchItem>();
  // `row.items` remains authoritative and first. The other network rows add
  // live, replay and short-form sources to the all-platform 24/7 channel.
  for (const item of [row.items, ...group.rows.map((entry) => entry.items)].flat()) {
    if (playable(item) && !unique.has(itemKey(item))) unique.set(itemKey(item), item);
  }
  return [...unique.values()];
}

function candidateDuration(item: WatchItem): number {
  return Math.max(CONTINUOUS_GUIDE_MIN_AIRING_MS, itemDurationSeconds(item) * 1000);
}

function orderKey(seed: string, item: WatchItem): string {
  return `${stableHash(`${seed}:${itemKey(item)}`).toString(16).padStart(8, "0")}:${itemKey(item)}`;
}

function insertByOrder(active: Candidate[], candidate: Candidate): void {
  let low = 0;
  let high = active.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (active[middle]!.orderKey < candidate.orderKey) low = middle + 1;
    else high = middle;
  }
  active.splice(low, 0, candidate);
}

function nextAfter(active: readonly Candidate[], previousOrderKey: string | null): Candidate | undefined {
  if (active.length === 0) return undefined;
  if (previousOrderKey === null) return active[0];
  let low = 0;
  let high = active.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (active[middle]!.orderKey <= previousOrderKey) low = middle + 1;
    else high = middle;
  }
  return active[low] ?? active[0];
}

function block(
  seed: string,
  item: WatchItem,
  startMs: number,
  endMs: number,
  source: ContinuousGuideScheduleBlock["source"],
  nowMs: number,
  interrupted = false,
  horizonClipped = false,
): ContinuousGuideScheduleBlock {
  return {
    id: `${source}:${seed}:${startMs}:${itemKey(item)}`,
    item,
    startMs,
    endMs,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    source,
    current: startMs <= nowMs && nowMs < endMs,
    interrupted,
    horizonClipped,
  };
}

function buildRotation(
  seed: string,
  items: readonly WatchItem[],
  rangeStart: number,
  queryEnd: number,
  futureLimit: number,
  nowMs: number,
): ContinuousGuideScheduleBlock[] {
  const nonLive = items.filter((item) => item.kind !== "live" && item.format !== "live");
  if (nonLive.length === 0) return [];

  const knownAvailability = nonLive
    .map(itemAvailability)
    .filter((value): value is number => value !== null);
  const firstKnown = knownAvailability.length > 0
    ? Math.min(...knownAvailability)
    : UNKNOWN_AVAILABILITY_EPOCH_MS;
  const anchor = Math.min(firstKnown, UNKNOWN_AVAILABILITY_EPOCH_MS);
  const candidates = nonLive
    .map((item): Candidate => ({
      item,
      availableAt: itemAvailability(item) ?? anchor,
      durationMs: candidateDuration(item),
      orderKey: orderKey(seed, item),
    }))
    .sort((left, right) => left.availableAt - right.availableAt || left.orderKey.localeCompare(right.orderKey));

  const actualAnchor = candidates[0]?.availableAt;
  if (actualAnchor === undefined || actualAnchor >= queryEnd) return [];

  const active: Candidate[] = [];
  const pending: Candidate[] = [];
  const output: ContinuousGuideScheduleBlock[] = [];
  let candidateIndex = 0;
  let activeCycleDuration = 0;
  let cursor = actualAnchor;
  let previousOrderKey: string | null = null;

  while (cursor < queryEnd) {
    while (candidateIndex < candidates.length && candidates[candidateIndex]!.availableAt <= cursor) {
      const candidate = candidates[candidateIndex]!;
      insertByOrder(active, candidate);
      activeCycleDuration += candidate.durationMs;
      pending.push(candidate);
      candidateIndex += 1;
    }

    if (active.length === 0) {
      const nextAvailability = candidates[candidateIndex]?.availableAt;
      if (nextAvailability === undefined || nextAvailability >= queryEnd) break;
      cursor = nextAvailability;
      continue;
    }

    // Skip whole deterministic cycles when the requested historical window is
    // far away. Stop at the next release because it must enter at the first
    // natural program boundary after publication.
    if (pending.length === 0 && cursor < rangeStart && activeCycleDuration > 0) {
      const nextAvailability = candidates[candidateIndex]?.availableAt ?? Number.POSITIVE_INFINITY;
      const jumpTarget = Math.min(rangeStart, nextAvailability);
      const wholeCycles = Math.floor((jumpTarget - cursor) / activeCycleDuration);
      if (wholeCycles > 0) {
        cursor += wholeCycles * activeCycleDuration;
        if (previousOrderKey === null) previousOrderKey = active[active.length - 1]!.orderKey;
        continue;
      }
    }

    // Fresh items are aired at the next content boundary instead of waiting
    // behind a potentially multi-day library cycle.
    const selected: Candidate | undefined = pending.shift() ?? nextAfter(active, previousOrderKey);
    if (!selected) break;
    const startsAt = cursor;
    const naturalEnd = startsAt + selected.durationMs;
    const endsAt = Math.min(naturalEnd, futureLimit);

    if (naturalEnd > rangeStart && startsAt < queryEnd && endsAt > startsAt) {
      output.push(block(
        seed,
        selected.item,
        startsAt,
        endsAt,
        "rotation",
        nowMs,
        false,
        endsAt < naturalEnd,
      ));
    }

    previousOrderKey = selected.orderKey;
    cursor = naturalEnd;
  }

  return output;
}

function currentLive(items: readonly WatchItem[], nowMs: number, seed: string): Candidate | null {
  return items
    .filter((item) => item.kind === "live" || item.format === "live")
    .map((item): Candidate => ({
      item,
      availableAt: itemAvailability(item) ?? nowMs,
      durationMs: candidateDuration(item),
      orderKey: orderKey(seed, item),
    }))
    .filter((candidate) => candidate.availableAt <= nowMs)
    .sort((left, right) => right.availableAt - left.availableAt || left.orderKey.localeCompare(right.orderKey))[0] ?? null;
}

function overlayLiveWindow(
  rotation: readonly ContinuousGuideScheduleBlock[],
  live: Candidate | null,
  liveEnd: number | null,
  seed: string,
  rangeStart: number,
  queryEnd: number,
  futureLimit: number,
  nowMs: number,
): ContinuousGuideScheduleBlock[] {
  if (!live || liveEnd === null) return [...rotation];
  const liveStart = live.availableAt;
  // A provider-marked current stream remains on now even if its initial
  // duration estimate has elapsed. The forecast is intentionally bucketed so
  // a 24/7 program after it keeps a stable start time between UI clock ticks.
  const boundedLiveEnd = Math.min(liveEnd, futureLimit);
  if (boundedLiveEnd <= rangeStart || liveStart >= queryEnd) return [...rotation];

  /*
   * A live source occupies the channel; it must not simply hide whatever was
   * scheduled beneath it.  Treat the live window like an insertion in the
   * linear clock instead: preserve the part of an airing that already played,
   * resume its unplayed remainder after the live broadcast, then move every
   * following rotation block forward by the exact live duration.  That makes
   * the future queue truthful (and avoids silently skipping a video whenever
   * a creator goes live).
   */
  const delayMs = boundedLiveEnd - liveStart;
  const result: ContinuousGuideScheduleBlock[] = [];
  for (const airing of rotation) {
    if (airing.endMs <= liveStart) {
      result.push(airing);
      continue;
    }

    // The program was already under way when the live broadcast started.
    // Keep its completed part at the original time, then put its remaining
    // portion immediately after the live handoff.
    if (airing.startMs < liveStart) {
      result.push(block(seed, airing.item, airing.startMs, liveStart, "rotation", nowMs, true));
      result.push(block(
        seed,
        airing.item,
        boundedLiveEnd,
        Math.min(futureLimit, boundedLiveEnd + (airing.endMs - liveStart)),
        "rotation",
        nowMs,
        true,
        airing.horizonClipped || boundedLiveEnd + (airing.endMs - liveStart) > futureLimit,
      ));
      continue;
    }

    // Everything that had not started yet is deferred, not discarded.  The
    // original duration remains intact, including long broadcasts.
    const shiftedStart = airing.startMs + delayMs;
    const shiftedNaturalEnd = airing.endMs + delayMs;
    if (shiftedStart >= futureLimit) continue;
    result.push(block(
      seed,
      airing.item,
      shiftedStart,
      Math.min(shiftedNaturalEnd, futureLimit),
      "rotation",
      nowMs,
      true,
      airing.horizonClipped || shiftedNaturalEnd > futureLimit,
    ));
  }

  result.push(block(
    seed,
    live.item,
    liveStart,
    boundedLiveEnd,
    "live",
    nowMs,
    false,
    boundedLiveEnd < liveEnd,
  ));
  return result
    .filter((entry) => entry.endMs > rangeStart && entry.startMs < queryEnd)
    .sort((left, right) => left.startMs - right.startMs || (left.source === "live" ? -1 : 1));
}

/**
 * Builds one deterministic, duration-accurate 24/7 network schedule.
 *
 * The output is independent of call time except for the explicit `nowMs`,
 * current-live forecast, and hard 18-hour future boundary. New catalog items
 * cannot alter airings before their provider timestamp and join at the next
 * natural item boundary. Historical queries start at the earliest provider
 * timestamp and skip complete cycles rather than iterating from "today".
 */
export function buildContinuousGuideSchedule({
  group,
  row,
  rangeStart,
  rangeEnd,
  nowMs,
  completedLiveInterruptions,
}: BuildContinuousGuideScheduleInput): ContinuousGuideScheduleBlock[] {
  if (![rangeStart, rangeEnd, nowMs].every(Number.isFinite)) {
    throw new RangeError("Continuous Guide schedule boundaries must be finite milliseconds.");
  }
  if (rangeEnd <= rangeStart || row.kind !== "continuous") return [];

  const futureLimit = nowMs + CONTINUOUS_GUIDE_FUTURE_HORIZON_MS;
  const queryEnd = Math.min(rangeEnd, futureLimit);
  if (queryEnd <= rangeStart) return [];

  const seed = `${group.network.slug}:${row.id}`;
  const items = uniqueNetworkItems(group, row);
  const live = currentLive(items, nowMs, seed);
  const liveKey = live ? itemKey(live.item) : null;
  const completedLive = (completedLiveInterruptions ?? [])
    .filter((entry) => (
      Number.isFinite(entry.startsAtMs)
      && Number.isFinite(entry.endsAtMs)
      && entry.endsAtMs > entry.startsAtMs
      && entry.endsAtMs > rangeStart
      && entry.startsAtMs < queryEnd
      && itemKey(entry.item) !== liveKey
    ))
    .sort((left, right) => left.startsAtMs - right.startsAtMs)
    .map((entry): { candidate: Candidate; endsAtMs: number } => ({
      candidate: {
        item: entry.item,
        availableAt: entry.startsAtMs,
        durationMs: Math.max(CONTINUOUS_GUIDE_MIN_AIRING_MS, entry.endsAtMs - entry.startsAtMs),
        orderKey: orderKey(seed, entry.item),
      },
      endsAtMs: entry.endsAtMs,
    }));
  // If a long-running live broadcast began before the requested visual
  // window, we still need the rotation block that it interrupted in order to
  // resume it faithfully when the live window ends.  Building from its real
  // start keeps that continuation deterministic without exposing extra rows.
  const rotationStart = Math.min(
    rangeStart,
    live?.availableAt ?? rangeStart,
    ...completedLive.map((entry) => entry.candidate.availableAt),
  );
  // After a live interruption, a raw rotation timestamp is shifted forward
  // by the live duration.  Build only the source window that can land inside
  // the requested output window; without this bound a stale multi-day live
  // flag could make a short-form-heavy channel rebuild days of invisible
  // rotation just to show the next few hours.
  const projectedLiveEnd = live
    ? Math.min(projectedLiveEndMs(live.availableAt, live.durationMs, nowMs), futureLimit)
    : null;
  const rotationEnd = live && projectedLiveEnd !== null
    ? Math.max(
      rotationStart + 1,
      live.availableAt + Math.max(0, queryEnd - projectedLiveEnd),
    )
    : queryEnd;
  const rotation = buildRotation(seed, items, rotationStart, rotationEnd, futureLimit, nowMs);
  const afterCompletedLives = completedLive.reduce(
    (scheduled, entry) => overlayLiveWindow(
      scheduled,
      entry.candidate,
      entry.endsAtMs,
      seed,
      rotationStart,
      queryEnd,
      futureLimit,
      nowMs,
    ),
    rotation,
  );
  const activeLiveEnd = live
    ? projectedLiveEndMs(live.availableAt, live.durationMs, nowMs)
    : null;
  return overlayLiveWindow(
    afterCompletedLives,
    live,
    activeLiveEnd,
    seed,
    rotationStart,
    queryEnd,
    futureLimit,
    nowMs,
  ).filter((entry) => entry.endMs > rangeStart);
}

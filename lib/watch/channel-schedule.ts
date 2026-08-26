import { itemDurationSeconds, type NetworkChannelMode } from "./channels";
import { projectedLiveEndMs } from "./live-schedule";
import type { WatchItem } from "./types";

export type ChannelScheduleEntry = {
  key: string;
  item: WatchItem;
  startsAt: number;
  endsAt: number;
  current: boolean;
};

/**
 * Resolve the deterministic program clock shared by a network page's lineup,
 * hero preview, and tune-in action. Keeping this pure prevents the visual
 * preview and the actual player handoff from drifting onto different titles.
 */
export function networkChannelSchedule(
  items: readonly WatchItem[],
  now: number,
  mode: NetworkChannelMode,
  count = 7,
): ChannelScheduleEntry[] {
  if (!items.length || !Number.isFinite(now) || count <= 0) return [];
  const outputCount = Math.max(0, Math.floor(count));

  if (mode === "live") {
    return items.slice(0, outputCount).map((item, index) => {
      const reported = Date.parse(item.live?.startedAt ?? item.publishedAt ?? "");
      const startsAt = Number.isFinite(reported) ? reported : now - index * 24 * 60 * 60 * 1000;
      const isCurrent = item.kind === "live" || item.format === "live";
      return {
        key: `${item.platform}:${item.id}:${index}`,
        item,
        startsAt,
        endsAt: isCurrent
          ? projectedLiveEndMs(startsAt, itemDurationSeconds(item) * 1000, now)
          : startsAt + itemDurationSeconds(item) * 1000,
        current: isCurrent,
      };
    });
  }

  const liveIndex = items.findIndex((item) => item.kind === "live" || item.format === "live");
  let currentIndex = 0;
  let currentStart = Math.floor(now / 1000) * 1000;

  if (liveIndex >= 0) {
    currentIndex = liveIndex;
    const reported = Date.parse(items[liveIndex]?.live?.startedAt ?? items[liveIndex]?.publishedAt ?? "");
    currentStart = Number.isFinite(reported) ? Math.min(reported, now) : currentStart;
  } else {
    const durations = items.map(itemDurationSeconds);
    const cycle = durations.reduce((total, duration) => total + duration, 0);
    const anchor = Date.UTC(2026, 0, 1);
    const nowSecond = Math.floor(now / 1000) * 1000;
    const position = ((Math.floor((nowSecond - anchor) / 1000) % cycle) + cycle) % cycle;
    let elapsed = 0;
    for (let index = 0; index < durations.length; index += 1) {
      const duration = durations[index] ?? 60;
      if (position < elapsed + duration) {
        currentIndex = index;
        currentStart = nowSecond - (position - elapsed) * 1000;
        break;
      }
      elapsed += duration;
    }
  }

  const output: ChannelScheduleEntry[] = [];
  let startsAt = currentStart;
  for (let offset = 0; offset < outputCount; offset += 1) {
    const index = (currentIndex + offset) % items.length;
    const item = items[index];
    if (!item) continue;
    let duration = itemDurationSeconds(item) * 1000;
    if (offset === 0 && (item.kind === "live" || item.format === "live")) {
      duration = projectedLiveEndMs(startsAt, duration, now) - startsAt;
    }
    const endsAt = startsAt + duration;
    output.push({
      key: `${item.platform}:${item.id}:${offset}`,
      item,
      startsAt,
      endsAt,
      current: offset === 0,
    });
    startsAt = endsAt;
  }
  return output;
}

export function channelProgramElapsedSeconds(entry: ChannelScheduleEntry, now: number): number {
  if (!Number.isFinite(now) || entry.item.kind === "live" || entry.item.format === "live") return 0;
  const duration = Math.max(1, Math.floor((entry.endsAt - entry.startsAt) / 1000));
  return Math.min(duration - 1, Math.max(0, Math.floor((now - entry.startsAt) / 1000)));
}

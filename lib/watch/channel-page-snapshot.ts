import { buildCuratedChannelRails } from "./creator-platform-rails";
import { networkChannelSchedule, type ChannelScheduleEntry } from "./channel-schedule";
import { buildContinuousGuideSchedule, CONTINUOUS_GUIDE_FUTURE_HORIZON_MS, type CompletedLiveInterruption } from "./continuous-schedule";
import { packWatchItemLists, unpackWatchItemLists, type WatchItemPayload } from "./item-payload";
import type { NetworkChannel, NetworkChannelHub, NetworkChannelMode, GuideNetworkRow } from "./channels";
import type { WatchItem } from "./types";

export const CHANNEL_INITIAL_ITEMS_PER_RAIL = 6;
export const CHANNEL_SCHEDULE_ITEM_LIMIT = 60;
export const CHANNEL_ARCHIVE_PAGE_SIZE = 24;
type ScheduleTiming = Omit<ChannelScheduleEntry, "item">;

/** The full archive stays on the server. Only visible shelves and upcoming airings travel. */
export type ChannelPageSnapshot = {
  payload: WatchItemPayload;
  schedule: ScheduleTiming[];
  continuousSchedule: ScheduleTiming[];
  railTotals: Record<string, number>;
};

export function channelLibraryPreview(hub: NetworkChannelHub) {
  const rails = buildCuratedChannelRails(hub.all);
  const selected = new Set(hub.live);
  const railTotals: Record<string, number> = {};
  for (const rail of rails) {
    railTotals[rail.id] = rail.items.length;
    for (const item of rail.items.slice(0, CHANNEL_INITIAL_ITEMS_PER_RAIL)) selected.add(item);
  }
  for (const item of hub.more.slice(0, CHANNEL_INITIAL_ITEMS_PER_RAIL)) selected.add(item);
  return {
    hub: Object.fromEntries(Object.entries(hub).map(([name, entries]) => [name, entries.filter((item) => selected.has(item))])) as NetworkChannelHub,
    railTotals,
  };
}

export function channelArchivePage(hub: NetworkChannelHub, railId: string, after: string | null) {
  const rail = buildCuratedChannelRails(hub.all).find((entry) => entry.id === railId);
  if (!rail) return null;
  const previous = after ? rail.items.findIndex((item) => `${item.platform}:${item.id}` === after) : -1;
  // If a provider removed the cursor item, restart safely; the client deduplicates.
  const offset = previous + 1;
  const items = rail.items.slice(offset, offset + CHANNEL_ARCHIVE_PAGE_SIZE);
  const last = items.at(-1);
  return { items, total: rail.items.length, nextCursor: last && offset + items.length < rail.items.length ? `${last.platform}:${last.id}` : null };
}

export function createChannelPageSnapshot({ channel, mode, items, continuousItems, hub, now, completedLiveInterruptions }: {
  channel: NetworkChannel;
  mode: NetworkChannelMode;
  items: WatchItem[];
  continuousItems: WatchItem[];
  hub: NetworkChannelHub;
  now: number;
  completedLiveInterruptions?: readonly CompletedLiveInterruption[];
}): ChannelPageSnapshot {
  const schedule = networkChannelSchedule(items, now, mode, CHANNEL_SCHEDULE_ITEM_LIMIT);
  const row: GuideNetworkRow = {
    id: `${channel.slug}:continuous`, networkSlug: channel.slug, kind: "continuous", label: "24/7",
    description: "", timelineSlug: channel.memberSlug ?? "house",
    channel: { id: `${channel.slug}:continuous`, title: channel.name, subtitle: "", href: `/channels/${channel.slug}`, artwork: channel.artwork },
    items: continuousItems,
  };
  // Use the complete source window for the deterministic clock. Truncating its
  // input would pick a different on-air program from the Guide and player.
  const continuousSchedule = buildContinuousGuideSchedule({
    group: { network: channel, rows: [row] }, row,
    rangeStart: now - 24 * 60 * 60 * 1_000,
    rangeEnd: now + CONTINUOUS_GUIDE_FUTURE_HORIZON_MS,
    nowMs: now, completedLiveInterruptions,
  }).filter((entry) => entry.endMs > now).slice(0, CHANNEL_SCHEDULE_ITEM_LIMIT).map((entry): ChannelScheduleEntry => ({
    key: entry.id, item: entry.item, startsAt: entry.startMs, endsAt: entry.endMs,
    current: entry.startMs <= now && now < entry.endMs,
  }));
  const preview = channelLibraryPreview(hub);
  const timings = (entries: ChannelScheduleEntry[]) => entries.map(({ item: _item, ...timing }) => timing);
  return {
    payload: packWatchItemLists({
      items: schedule.map((entry) => entry.item),
      continuous: continuousSchedule.map((entry) => entry.item),
      ...Object.fromEntries(Object.entries(preview.hub).map(([name, entries]) => [`hub:${name}`, entries])),
    }),
    schedule: timings(schedule), continuousSchedule: timings(continuousSchedule), railTotals: preview.railTotals,
  };
}

export function unpackChannelPageSnapshot(snapshot: ChannelPageSnapshot) {
  const lists = unpackWatchItemLists(snapshot.payload);
  return {
    items: lists.items!, continuousItems: lists.continuous!,
    hub: Object.fromEntries(Object.entries(lists).filter(([name]) => name.startsWith("hub:")).map(([name, items]) => [name.slice(4), items])) as NetworkChannelHub,
    scheduleSnapshot: {
      schedule: snapshot.schedule.map((entry, index) => ({ ...entry, item: lists.items![index]! })),
      continuous: snapshot.continuousSchedule.map((entry, index) => ({ ...entry, item: lists.continuous![index]! })),
    },
    railTotals: snapshot.railTotals,
  };
}

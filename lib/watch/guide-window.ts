import { buildContinuousGuideSchedule } from "./continuous-schedule";
import type { GuideNetworkGroup } from "./channels";
import type { GuidePayload, GuideProgram } from "./guide-response";
import type { WatchItem } from "./types";

const HOUR = 3_600_000;
// Eight local calendar days can span 193 hours when clocks move back.
export const GUIDE_MAX_WINDOW_MS = 9 * 24 * HOUR;

export function guideProgramFromItem(item: WatchItem, fallbackStart?: string): GuideProgram | null {
  const startsAt = item.live?.startedAt ?? item.publishedAt ?? fallbackStart;
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return null;
  const live = item.kind === "live";
  return {
    id: `catalog-${item.id}`, slug: item.memberSlug ?? "house", login: item.live?.login ?? null,
    title: item.title, game: item.subtitle ?? item.live?.game ?? null, startsAt,
    endsAt: !live && item.durationSeconds ? new Date(Date.parse(startsAt) + item.durationSeconds * 1000).toISOString() : null,
    status: live ? "live" : item.kind === "vod" ? "replay" : "published", platform: item.platform,
    thumbnailUrl: item.poster || item.backdrop || null,
    vodId: item.kind === "vod" && item.platform === "twitch" ? /(?:vod-)?(\d+)$/.exec(item.id)?.[1] ?? null : null,
    youtubeId: item.platform === "youtube" ? /(?:[?&]id=|yt-)([\w-]+)/.exec(item.href)?.[1] ?? item.id.replace(/^yt-/, "") : null,
    sourceUrl: item.sourceUrl ?? item.href, watchItem: item,
    contentType: live ? "live" : item.kind === "vod" ? "broadcast" : item.format === "short" ? "short" : item.format === "photo" ? "photo" : item.kind === "post" ? "post" : item.kind === "clip" ? "clip" : "video",
    orientation: item.orientation, durationSeconds: item.durationSeconds,
  };
}

/** Compute with the complete archive, then transfer only the requested window. */
export function projectGuideWindow(payload: GuidePayload, start: number, end: number, includeLinear = true): GuidePayload {
  const nowMs = Date.parse(payload.serverNow);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > GUIDE_MAX_WINDOW_MS) throw new Error("Invalid guide window");
  const allPrograms = payload.programs.filter((program) => {
    if (program.continuous) return false;
    const begins = Date.parse(program.startsAt);
    const finishes = program.endsAt ? Date.parse(program.endsAt) : begins + (program.durationSeconds ?? 900) * 1000;
    return program.status === "live" || (begins < end && finishes > start);
  });
  for (const group of includeLinear ? payload.networks ?? [] : []) {
    for (const row of group.rows.filter((entry) => entry.kind === "continuous")) {
      for (const block of buildContinuousGuideSchedule({ group, row, rangeStart: start, rangeEnd: end, nowMs })) {
        const program = guideProgramFromItem(block.item, block.startsAt);
        if (!program) continue;
        allPrograms.push({ ...program, id: `continuous:${row.id}:${block.id}`, slug: row.timelineSlug,
          startsAt: block.startsAt, endsAt: block.endsAt, status: block.source === "live" ? "live" : "published",
          game: `${group.network.name} nonstop rotation`, guideRowId: row.id, channelMode: "continuous", continuous: true,
          continuousPhase: block.current ? "now" : block.endMs <= nowMs ? "past" : "future",
          durationSeconds: (block.endMs - block.startMs) / 1000,
        });
      }
    }
  }
  const visibleIds = new Set(allPrograms.flatMap((program) => program.watchItem ? [`${program.watchItem.platform}:${program.watchItem.id}`] : []));
  const dates = payload.programs.map((program) => Date.parse(program.startsAt)).filter(Number.isFinite);
  return { ...payload, programs: allPrograms,
    networks: includeLinear ? payload.networks?.map((group): GuideNetworkGroup => ({ ...group,
      rows: group.rows.map((row) => ({ ...row, items: row.items.filter((item) => visibleIds.has(`${item.platform}:${item.id}`)) })),
    })) : undefined,
    window: { start, end, earliest: dates.length ? Math.min(...dates) : nowMs },
  };
}

"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import useSWR from "swr";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { itemToPlayable } from "@/lib/watch/playable";
import { removeActiveTwitchArchiveDuplicates } from "@/lib/watch/guide-programs";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import {
  isConnectedShortChannelItem,
  mediaTypeLabel,
  type GuideNetworkGroup,
  type GuideNetworkRow,
  type NetworkChannelMode,
} from "@/lib/watch/channels";
import { buildContinuousGuideSchedule } from "@/lib/watch/continuous-schedule";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { PosterCard } from "@/components/watch/PosterCard";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { twitchLiveChatLogin } from "@/lib/watch/player-companion";

const HYDRATION_TIME_PREFERENCES = {
  locale: "en-US",
  timeZone: "UTC",
} as const;
const LABEL_W = 188;
const ROW_BASE_H = 106;
const SLOT_H = 96;
const MAX_LANE_SLOTS = 2;
const ARCHIVE_PAGE_DAYS = 4;
const TIMELINE_ZOOM_LEVELS = [0.6, 0.8, 1, 1.3, 1.65, 2.1] as const;
const DEFAULT_TIMELINE_ZOOM_INDEX = 4;

type ProgramStatus = "live" | "upcoming" | "replay" | "published";
type StatusFilter = "all" | ProgramStatus;
type TimelineScope = "today" | "week" | "upcoming";
type ContentType = "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";

type GuideProgram = {
  id: string;
  slug: string;
  login: string | null;
  title: string;
  game: string | null;
  startsAt: string;
  endsAt: string | null;
  status: ProgramStatus;
  platform: WatchPlatform;
  thumbnailUrl: string | null;
  vodId: string | null;
  youtubeId: string | null;
  sourceUrl: string;
  contentType?: ContentType;
  orientation?: WatchItem["orientation"];
  durationSeconds?: number | null;
  watchItem?: WatchItem;
  guideRowId?: string;
  channelMode?: NetworkChannelMode;
  continuous?: boolean;
  continuousPhase?: "past" | "now" | "future";
};

type GuidePayload = {
  serverNow: string;
  horizonEnd: string;
  programs: GuideProgram[];
  networks?: GuideNetworkGroup[];
  sources?: {
    twitchSchedule?: "ok" | "empty" | "unconfigured" | "error";
    youtubeUpcoming?: "ok" | "empty" | "unconfigured" | "error";
    socialTimeline?: "ok" | "empty" | "unconfigured" | "error";
  };
};

type GuideChannel = {
  slug: string;
  label: string;
  sublabel: string;
  login: string | null;
  portrait: string;
  logo: string;
  accent: string;
};

type PositionedProgram = {
  program: GuideProgram;
  left: number;
  width: number;
  slot: number;
};

type TimelineLane = {
  key: string;
  channel: GuideChannel;
  group: GuideNetworkGroup;
  row: GuideNetworkRow;
  rowIndex: number;
  rowCount: number;
  events: PositionedProgram[];
  slots: number;
};

type TimelineRestore =
  | { kind: "preserve"; anchorMs: number; viewportX: number }
  | { kind: "now" };

type TimePreferences = {
  locale: string;
  timeZone: string;
  ready: boolean;
};

const CHANNELS: GuideChannel[] = [
  {
    slug: "house",
    label: `${GROUP.name} Network`,
    sublabel: "House channel",
    login: null,
    portrait: "/group/thecoreboys.jpg",
    logo: "/brand/logo-core-white.png",
    accent: "#db0368",
  },
  ...MEMBERS.map((member) => ({
    slug: member.slug,
    label: member.comm.name,
    sublabel: member.stageName,
    login: member.twitchLogin,
    portrait: member.portrait,
    logo: member.comm.logo,
    accent: member.accent,
  })),
];

function GuideFilterLogo({ src, label, accent }: { src: string; label: string; accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border p-0.5"
      style={{
        borderColor: `${accent}66`,
        background: `linear-gradient(135deg, ${accent}2b, rgba(255,255,255,0.04))`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" title={label} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

const fetcher = async (url: string): Promise<GuidePayload> => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Guide unavailable");
  return (await res.json()) as GuidePayload;
};

function safeTime(iso: string, fallback: number): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : fallback;
}

function floorHalfHour(ms: number): number {
  return Math.floor(ms / 1_800_000) * 1_800_000;
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function startOfZonedDay(referenceMs: number, offsetDays: number, timeZone: string): number {
  const parts = zonedParts(new Date(referenceMs), timeZone);
  const desiredDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  const targetLocalMs = Date.UTC(
    desiredDate.getUTCFullYear(),
    desiredDate.getUTCMonth(),
    desiredDate.getUTCDate(),
  );

  // Resolve the browser's local midnight iteratively. This keeps Today aligned
  // to the viewer's calendar even across daylight-saving transitions.
  let candidate = targetLocalMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = zonedParts(new Date(candidate), timeZone);
    const shownLocalMs = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
    );
    const correction = targetLocalMs - shownLocalMs;
    candidate += correction;
    if (correction === 0) break;
  }
  return candidate;
}

function formatClock(value: string | number, preferences: TimePreferences): string {
  if (!preferences.ready) return "—";
  return new Date(value).toLocaleTimeString(preferences.locale, {
    timeZone: preferences.timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLiveClock(value: number, preferences: TimePreferences): string {
  if (!preferences.ready) return "—";
  return new Date(value).toLocaleTimeString(preferences.locale, {
    timeZone: preferences.timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timelineOffsetPx(valueMs: number, rangeStartMs: number, pxPerMinute: number): number {
  return ((valueMs - rangeStartMs) / 60_000) * pxPerMinute;
}

function formatTimeZoneLabel(value: number, preferences: TimePreferences): string {
  if (!preferences.ready) return "your local time";
  return new Intl.DateTimeFormat(preferences.locale, {
    timeZone: preferences.timeZone,
    timeZoneName: "short",
  }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value ?? preferences.timeZone;
}

function formatTick(value: number, scope: TimelineScope, preferences: TimePreferences): string {
  if (!preferences.ready) return "—";
  if (scope === "today") return formatClock(value, preferences);
  const day = new Date(value).toLocaleDateString(preferences.locale, {
    timeZone: preferences.timeZone,
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
  return `${day} · ${formatClock(value, preferences)}`;
}

function formatGuideDay(value: number, preferences: TimePreferences): string {
  if (!preferences.ready) return "—";
  return new Date(value).toLocaleDateString(preferences.locale, {
    timeZone: preferences.timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function programAiringLabel(program: GuideProgram, preferences: TimePreferences): string {
  const start = formatClock(program.startsAt, preferences);
  const end = program.endsAt && Number.isFinite(Date.parse(program.endsAt))
    ? formatClock(program.endsAt, preferences)
    : null;
  if (program.continuous) return end ? `airing ${start} to ${end}` : `airing at ${start}`;
  if (program.status === "live") return `live now, started ${start}`;
  if (program.status === "upcoming") return `starting ${start}`;
  if (program.status === "replay") return end ? `aired ${start} to ${end}` : `aired at ${start}`;
  return `posted at ${start}`;
}

function liveThumb(program: GuideProgram, channel: GuideChannel, nowMs: number): string {
  if (program.thumbnailUrl) {
    const joiner = program.thumbnailUrl.includes("?") ? "&" : "?";
    return `${program.thumbnailUrl}${joiner}t=${Math.floor(nowMs / 60_000)}`;
  }
  if (program.login) {
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${program.login.toLowerCase()}-640x360.jpg`;
  }
  return channel.portrait;
}

function liveProgramCardItem(program: GuideProgram, channel: GuideChannel, nowMs: number): WatchItem {
  const poster = liveThumb(program, channel, nowMs);
  if (program.watchItem) {
    return {
      ...program.watchItem,
      title: program.title,
      subtitle: program.game ?? program.watchItem.subtitle,
      poster,
      backdrop: poster,
      kind: "live",
      format: "live",
      live: {
        ...program.watchItem.live,
        login: program.login ?? program.watchItem.live?.login ?? channel.login ?? channel.slug,
        game: program.game ?? program.watchItem.live?.game,
        startedAt: program.startsAt || program.watchItem.live?.startedAt,
      },
    };
  }
  return {
    id: program.id,
    kind: "live",
    platform: program.platform,
    title: program.title,
    subtitle: program.game ?? undefined,
    poster,
    backdrop: poster,
    memberSlug: program.slug === "house" ? null : program.slug,
    memberLabel: channel.sublabel,
    accent: channel.accent,
    href: program.login ? `/watch/live/${program.login}` : program.sourceUrl,
    sourceUrl: program.sourceUrl,
    format: "live",
    orientation: "landscape",
    live: {
      login: program.login ?? channel.login ?? channel.slug,
      game: program.game ?? undefined,
      startedAt: program.startsAt,
    },
  };
}

function channelFor(slug: string): GuideChannel {
  return CHANNELS.find((channel) => channel.slug === slug) ?? CHANNELS[0]!;
}

function platformLabel(platform: WatchPlatform): string {
  if (platform === "youtube") return "YouTube";
  if (platform === "tiktok") return "TikTok";
  if (platform === "instagram") return "Instagram";
  if (platform === "twitch") return "Twitch";
  if (platform === "house") return "CORE";
  return "X";
}

function contentLabel(program: GuideProgram): string {
  if (program.continuous) return "24/7 rotation";
  if (program.watchItem) return mediaTypeLabel(program.watchItem);
  const type = program.contentType ?? (program.status === "replay" ? "broadcast" : program.status);
  if (type === "short") {
    if (program.platform === "tiktok") return "TikTok";
    if (program.platform === "instagram") return "Instagram Reel";
    return "YouTube Short";
  }
  if (type === "photo") return program.platform === "instagram" ? "Instagram Photo" : "Photo";
  if (type === "broadcast") return program.platform === "twitch" ? "Twitch Broadcast" : "Broadcast";
  if (type === "video") return program.platform === "youtube" ? "YouTube Video" : "Video";
  if (type === "clip") return "Clip";
  if (type === "post") return "Post";
  if (type === "live") return program.platform === "twitch" ? "Twitch Live" : "Live";
  return type;
}

function programTimeLabel(program: GuideProgram, preferences: TimePreferences): string {
  if (program.continuous) {
    if (program.continuousPhase === "now") return "On now";
    if (program.continuousPhase === "future") return `Next ${formatClock(program.startsAt, preferences)}`;
    return `Played ${formatClock(program.startsAt, preferences)}`;
  }
  if (program.status === "live") return "Live now";
  if (program.status === "upcoming") return `Starts ${formatClock(program.startsAt, preferences)}`;
  if (program.status === "replay") return `Aired ${formatClock(program.startsAt, preferences)}`;
  return formatClock(program.startsAt, preferences);
}

function emptyLaneLabel(row: GuideNetworkRow): string {
  if (row.kind === "live") return "No live broadcasts in this window";
  if (row.kind === "videos") return "No videos in this window";
  if (row.kind === "shorts") return "No Shorts, Reels, or social posts in this window";
  return "Connect playable accounts to start this 24/7 channel";
}

function isExternalOnly(program: GuideProgram): boolean {
  const item = program.watchItem;
  if (!item) return false;
  return item.format === "photo" || (item.embeddable === false && !item.mediaUrl && !item.embedUrl);
}

function programIsPlayable(program: GuideProgram): boolean {
  if (program.watchItem) return Boolean(itemToPlayable(program.watchItem)) && !isExternalOnly(program);
  return Boolean(
    (program.status === "live" && program.login) ||
      program.youtubeId ||
      (program.status === "replay" && program.vodId),
  );
}

function timelineWindow(scope: TimelineScope, nowMs: number, timeZone: string, horizonIso?: string) {
  if (scope === "today") {
    return {
      start: startOfZonedDay(nowMs, 0, timeZone),
      end: startOfZonedDay(nowMs, 1, timeZone),
      pxPerMinute: 1,
    };
  }
  if (scope === "upcoming") {
    const horizon = safeTime(horizonIso ?? "", nowMs + 7 * 86_400_000);
    return {
      start: floorHalfHour(nowMs),
      end: Math.max(horizon, nowMs + 24 * 3_600_000),
      pxPerMinute: 0.24,
    };
  }
  return {
    start: startOfZonedDay(nowMs, -3, timeZone),
    end: startOfZonedDay(nowMs, 5, timeZone),
    pxPerMinute: 0.2,
  };
}

function itemContentType(item: WatchItem): ContentType {
  if (item.kind === "live" || item.format === "live") return "live";
  if (item.kind === "vod") return "broadcast";
  if (item.format === "short") return "short";
  if (item.format === "photo") return "photo";
  if (item.kind === "post") return "post";
  if (item.kind === "clip") return "clip";
  return "video";
}

function programBelongsToRow(program: GuideProgram, row: GuideNetworkRow): boolean {
  const contentType = program.contentType ?? (program.watchItem ? itemContentType(program.watchItem) : "video");
  const shortSocial = contentType === "short" || contentType === "clip" || contentType === "photo" || contentType === "post";
  const broadcast = contentType === "live" || contentType === "broadcast" ||
    program.status === "live" || program.status === "upcoming" || program.status === "replay";
  const coreMemberShort =
    row.networkSlug === "core" &&
    row.kind === "shorts" &&
    program.slug !== "house" &&
    Boolean(program.watchItem && isConnectedShortChannelItem(program.watchItem));
  if (program.slug !== row.timelineSlug && !coreMemberShort) return false;

  if (row.kind === "continuous") return false;
  if (row.kind === "live") return broadcast;
  if (row.kind === "shorts") return shortSocial;
  // CORE intentionally has no separate Live row. Its official YouTube lives
  // and replays therefore remain discoverable in the Videos channel.
  if (row.networkSlug === "core" && broadcast) return program.platform === "youtube";
  return !broadcast && !shortSocial && contentType === "video";
}

function continuousPrograms(
  group: GuideNetworkGroup,
  row: GuideNetworkRow,
  rangeStart: number,
  rangeEnd: number,
  nowMs: number,
): GuideProgram[] {
  return buildContinuousGuideSchedule({ group, row, rangeStart, rangeEnd, nowMs }).map((block) => {
    const item = block.item;
    return {
      id: `continuous:${row.id}:${block.id}`,
      slug: row.timelineSlug,
      login: item.live?.login ?? null,
      title: item.title,
      game: `${group.network.name} nonstop rotation`,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      status: block.source === "live" ? "live" : "published",
      platform: item.platform,
      thumbnailUrl: item.backdrop || item.poster || group.network.artwork,
      vodId: item.kind === "vod" ? item.id.replace(/^vod-/, "") : null,
      youtubeId: null,
      sourceUrl: item.sourceUrl ?? item.href,
      contentType: itemContentType(item),
      orientation: item.orientation,
      durationSeconds: Math.max(1, (block.endMs - block.startMs) / 1000),
      watchItem: item,
      guideRowId: row.id,
      channelMode: "continuous",
      continuous: true,
      continuousPhase: block.current ? "now" : block.endMs <= nowMs ? "past" : "future",
    } satisfies GuideProgram;
  });
}

function eventEnd(program: GuideProgram, nowMs: number): number {
  const start = Date.parse(program.startsAt);
  const explicit = program.endsAt ? Date.parse(program.endsAt) : NaN;
  if (Number.isFinite(explicit) && explicit > start) return explicit;
  if (program.status === "live") return Math.max(nowMs + 60 * 60_000, start + 30 * 60_000);
  if (program.durationSeconds && program.durationSeconds > 0) return start + program.durationSeconds * 1000;
  return start + 15 * 60_000;
}

function cardBaseWidth(program: GuideProgram, durationWidth: number): number {
  // The 24/7 lane is a real linear schedule. Keep its geometry tied to the
  // provider duration; a one-minute Short should look like one minute, not an
  // invented multi-hour program. The single pixel floor keeps it discoverable.
  if (program.continuous) return Math.max(1, durationWidth - 1);
  if (program.status === "live" || program.status === "upcoming" || program.status === "replay") {
    return Math.max(158, Math.min(360, durationWidth));
  }
  if (program.orientation === "portrait") return 142;
  if (program.orientation === "square") return 154;
  return 184;
}

function positionLane(
  items: GuideProgram[],
  rangeStart: number,
  rangeEnd: number,
  pxPerMinute: number,
  trackWidth: number,
  nowMs: number,
): { events: PositionedProgram[]; slots: number } {
  const slotEnds: number[] = [];
  const events = [...items]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .flatMap((program): PositionedProgram[] => {
      const rawStart = Date.parse(program.startsAt);
      if (!Number.isFinite(rawStart)) return [];
      const rawEnd = eventEnd(program, nowMs);
      const start = Math.max(rangeStart, rawStart);
      const end = Math.min(rangeEnd, rawEnd);
      const pointEvent = program.status === "published" && !program.continuous;
      if ((!pointEvent && end <= start) || rawStart >= rangeEnd || (!pointEvent && rawEnd <= rangeStart)) return [];
      if (pointEvent && rawStart < rangeStart) return [];
      const naturalLeft = Math.max(0, ((start - rangeStart) / 60_000) * pxPerMinute);
      const durationWidth = Math.max(0, ((end - start) / 60_000) * pxPerMinute);
      const desiredWidth = cardBaseWidth(program, durationWidth);
      if (program.continuous) {
        return [{ program, left: naturalLeft, width: desiredWidth, slot: 0 }];
      }
      let slot = slotEnds.findIndex((right) => naturalLeft >= right + 8);
      let left = naturalLeft;
      if (slot < 0 && slotEnds.length < MAX_LANE_SLOTS) {
        slot = slotEnds.length;
      } else if (slot < 0) {
        // Dense social uploads often share near-identical publish times. Pack
        // them forward inside two visual tiers instead of making one community
        // row hundreds of pixels tall. The exact time remains on every card.
        slot = slotEnds[0]! <= slotEnds[1]! ? 0 : 1;
        left = Math.max(naturalLeft, slotEnds[slot]! + 8);
      }
      left = Math.min(left, Math.max(0, trackWidth - 76));
      const width = Math.max(76, Math.min(desiredWidth, trackWidth - left));
      slotEnds[slot] = left + width;
      return [{ program, left, width, slot }];
    });
  return { events, slots: Math.max(1, slotEnds.length) };
}

export function GuideGrid({
  serverNow,
  initialLive,
  networks,
}: {
  serverNow: string;
  initialLive: WatchItem[];
  networks: GuideNetworkGroup[];
}) {
  const initialNowMs = safeTime(serverNow, Date.now());
  const timePreferences = useBrowserTimeZone();
  const [clockMs, setClockMs] = useState(initialNowMs);
  const [liveNowMs, setLiveNowMs] = useState(initialNowMs);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState<"all" | WatchPlatform>("all");
  const [member, setMember] = useState("all");
  const [scope, setScope] = useState<TimelineScope>("today");
  const [timelineAnchorMs, setTimelineAnchorMs] = useState(() =>
    startOfZonedDay(initialNowMs, 0, HYDRATION_TIME_PREFERENCES.timeZone));
  const [timelineZoomIndex, setTimelineZoomIndex] = useState(DEFAULT_TIMELINE_ZOOM_INDEX);
  const [query, setQuery] = useState("");
  const timelineScroller = useDragScroll<HTMLDivElement>({ wheel: "native" });
  const liveScroller = useDragScroll<HTMLDivElement>({ wheel: "x" });
  const timelineRestoreRef = useRef<TimelineRestore | null>({ kind: "now" });
  const timelineScrollTimerRef = useRef<number | null>(null);
  const timelinePagingUnlockTimerRef = useRef<number | null>(null);
  const timelinePagingSuspendedRef = useRef(false);
  const initialTimelineCenteredRef = useRef(false);
  const appliedBrowserTimeZoneRef = useRef<string | null>(null);
  const observedDayStartRef = useRef<number | null>(null);
  const followingNowRef = useRef(true);
  const player = usePlayer();
  const { data: liveData } = useLiveStatus();
  const { data, error, isLoading } = useSWR<GuidePayload>("/api/watch/guide", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 20_000,
  });
  const networkGroups = data?.networks?.length ? data.networks : networks;

  useEffect(() => {
    const syncScheduleClock = () => setClockMs(Date.now());
    syncScheduleClock();
    const interval = window.setInterval(syncScheduleClock, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncLiveClock = () => setLiveNowMs(Date.now());
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncLiveClock();
    };
    syncLiveClock();
    const interval = window.setInterval(syncLiveClock, 1_000);
    window.addEventListener("focus", syncLiveClock);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncLiveClock);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!timePreferences.ready || appliedBrowserTimeZoneRef.current === timePreferences.timeZone) return;
    appliedBrowserTimeZoneRef.current = timePreferences.timeZone;
    const todayStart = startOfZonedDay(clockMs, 0, timePreferences.timeZone);
    observedDayStartRef.current = todayStart;
    followingNowRef.current = true;
    timelineRestoreRef.current = { kind: "now" };
    initialTimelineCenteredRef.current = false;
    setTimelineAnchorMs(todayStart);
  }, [clockMs, timePreferences.ready, timePreferences.timeZone]);

  useEffect(() => {
    if (!timePreferences.ready) return;
    const todayStart = startOfZonedDay(clockMs, 0, timePreferences.timeZone);
    const previousStart = observedDayStartRef.current;
    observedDayStartRef.current = todayStart;
    if (previousStart === null || previousStart === todayStart || !followingNowRef.current) return;
    if (scope !== "upcoming") {
      timelineRestoreRef.current = { kind: "now" };
      initialTimelineCenteredRef.current = false;
      setTimelineAnchorMs(todayStart);
    }
  }, [clockMs, scope, timePreferences.ready, timePreferences.timeZone]);

  const livePrograms = useMemo<GuideProgram[]>(() => {
    const catalogLive = initialLive.map((item): GuideProgram => ({
      id: `catalog-${item.id}`,
      slug: item.memberSlug ?? "house",
      login: item.live?.login ?? null,
      title: item.title,
      game: item.live?.game ?? item.subtitle ?? null,
      startsAt: item.live?.startedAt ?? item.publishedAt ?? serverNow,
      endsAt: null,
      status: "live",
      platform: item.platform,
      thumbnailUrl: item.poster || item.backdrop,
      vodId: null,
      youtubeId: item.platform === "youtube" ? /[?&]id=([^&]+)/.exec(item.href)?.[1] ?? null : null,
      sourceUrl: item.sourceUrl ?? item.href,
      contentType: "live",
      orientation: item.orientation,
      watchItem: item,
    }));

    if (!liveData) return catalogLive;
    const twitchLive = liveData.live.flatMap((entry): GuideProgram[] => {
      if (!entry.isLive) return [];
      const channel = CHANNELS.find(
        (candidate) => candidate.login?.toLowerCase() === entry.login.toLowerCase(),
      );
      if (!channel) return [];
      const catalogItem = initialLive.find((item) =>
        item.platform === "twitch"
        && (
          item.memberSlug === channel.slug
          || item.live?.login?.toLowerCase() === entry.login.toLowerCase()
        ),
      );
      const runtimeWatchItem = catalogItem ? {
        ...catalogItem,
        title: entry.title?.trim() || catalogItem.title,
        subtitle: entry.game?.trim() || catalogItem.subtitle,
        poster: entry.thumbnailUrl || catalogItem.poster,
        backdrop: entry.thumbnailUrl || catalogItem.backdrop,
        live: {
          ...catalogItem.live,
          login: entry.login,
          game: entry.game?.trim() || catalogItem.live?.game,
          startedAt: entry.startedAt || catalogItem.live?.startedAt || serverNow,
        },
      } satisfies WatchItem : undefined;
      return [{
        id: `runtime-live-${channel.slug}`,
        slug: channel.slug,
        login: entry.login,
        title: entry.title?.trim() || `${channel.sublabel} is live`,
        game: entry.game?.trim() || null,
        startsAt: entry.startedAt || serverNow,
        endsAt: null,
        status: "live",
        platform: "twitch",
        thumbnailUrl: entry.thumbnailUrl || channel.portrait,
        vodId: null,
        youtubeId: null,
        sourceUrl: `https://www.twitch.tv/${entry.login}`,
        contentType: "live",
        orientation: "landscape",
        watchItem: runtimeWatchItem,
      }];
    });
    // A successful poll is authoritative for every Twitch channel, including
    // the offline entries. Otherwise an initial catalog live card can linger
    // after the stream ends and continue hiding its newly completed replay.
    const polledTwitchSlugs = new Set(
      liveData.live.flatMap((entry) => {
        const channel = CHANNELS.find(
          (candidate) => candidate.login?.toLowerCase() === entry.login.toLowerCase(),
        );
        return channel ? [channel.slug] : [];
      }),
    );
    return [
      ...twitchLive,
      ...catalogLive.filter(
        (program) => program.platform !== "twitch" || !polledTwitchSlugs.has(program.slug),
      ),
    ];
  }, [initialLive, liveData, serverNow]);

  const programs = useMemo(() => {
    const seen = new Set<string>();
    const liveKeys = new Set<string>();
    const polledTwitchStatus = new Map<string, boolean>();
    for (const entry of liveData?.live ?? []) {
      const channel = CHANNELS.find(
        (candidate) => candidate.login?.toLowerCase() === entry.login.toLowerCase(),
      );
      if (channel) polledTwitchStatus.set(channel.slug, entry.isLive);
    }
    const youtubeScheduled = new Set(
      (data?.programs ?? []).filter((program) => program.status === "upcoming" && program.youtubeId).map((program) => program.youtubeId),
    );
    const vodSources = new Set(
      (data?.programs ?? []).filter((program) => program.status === "replay").map((program) => program.sourceUrl),
    );
    const mergedPrograms = [...livePrograms, ...(data?.programs ?? [])].filter((program) => {
      if (program.status === "published" && program.youtubeId && youtubeScheduled.has(program.youtubeId)) return false;
      if (program.status === "published" && program.watchItem?.kind === "vod" && vodSources.has(program.sourceUrl)) return false;
      if (program.status === "live") {
        // The runtime poll also owns the transition to offline. Discard a
        // cached Guide/catalog live entry as soon as that poll says it ended.
        if (program.platform === "twitch" && polledTwitchStatus.get(program.slug) === false) return false;
        // Twitch's polling response replaces its catalog copy. Other
        // platforms may have two genuinely simultaneous live channels for
        // one member, so preserve their stable ids instead of collapsing by
        // member + platform.
        const key = program.platform === "twitch"
          ? `${program.slug}:twitch`
          : `${program.platform}:${program.id}`;
        if (liveKeys.has(key)) return false;
        liveKeys.add(key);
      }
      if (seen.has(program.id)) return false;
      seen.add(program.id);
      return true;
    });
    return removeActiveTwitchArchiveDuplicates(mergedPrograms, livePrograms);
  }, [data?.programs, liveData?.live, livePrograms]);

  const earliestAvailableMs = useMemo(() => {
    const candidates: number[] = [];
    for (const program of programs) {
      const startsAt = Date.parse(program.startsAt);
      if (Number.isFinite(startsAt) && program.status !== "upcoming" && program.status !== "live") {
        candidates.push(startsAt);
      }
    }
    for (const group of networkGroups) {
      for (const row of group.rows) {
        for (const item of row.items) {
          const availableAt = Date.parse(item.live?.startedAt ?? item.publishedAt ?? "");
          if (Number.isFinite(availableAt) && item.kind !== "live" && item.format !== "live") {
            candidates.push(availableAt);
          }
        }
      }
    }
    return candidates.length > 0
      ? Math.min(...candidates)
      : startOfZonedDay(clockMs, 0, timePreferences.timeZone);
  }, [clockMs, networkGroups, programs, timePreferences.timeZone]);

  const rangeAnchorMs = scope === "upcoming" ? floorHalfHour(clockMs) : timelineAnchorMs;
  const timelineZoom = TIMELINE_ZOOM_LEVELS[timelineZoomIndex] ?? 1;
  const range = useMemo(
    () => {
      const window = timelineWindow(scope, rangeAnchorMs, timePreferences.timeZone, data?.horizonEnd);
      return {
        ...window,
        pxPerMinute: window.pxPerMinute * timelineZoom,
      };
    },
    [data?.horizonEnd, rangeAnchorMs, scope, timePreferences.timeZone, timelineZoom],
  );
  const totalMinutes = Math.max(60, (range.end - range.start) / 60_000);
  const trackWidth = Math.max(1280, totalMinutes * range.pxPerMinute);

  const ticks = useMemo(() => {
    const interval = scope === "today" ? 3 * 3_600_000 : 12 * 3_600_000;
    const output: number[] = [];
    let cursor = scope === "today" ? range.start : Math.ceil(range.start / interval) * interval;
    while (cursor <= range.end) {
      output.push(cursor);
      cursor += interval;
    }
    return output;
  }, [range.end, range.start, scope]);

  const needle = query.trim().toLowerCase();
  const matchesControls = (
    program: GuideProgram,
    group?: GuideNetworkGroup,
    row?: GuideNetworkRow,
  ) => {
    const channel = channelFor(program.slug);
    const statusMatches = program.continuous
      ? status === "all" || status === "live"
      : status === "all" || program.status === status;
    return (
      (member === "all" || program.slug === member) &&
      (platform === "all" || program.platform === platform) &&
      statusMatches &&
      (!needle ||
        program.title.toLowerCase().includes(needle) ||
        (program.game ?? "").toLowerCase().includes(needle) ||
        channel.label.toLowerCase().includes(needle) ||
        channel.sublabel.toLowerCase().includes(needle) ||
        (group?.network.name ?? "").toLowerCase().includes(needle) ||
        (group?.network.host ?? "").toLowerCase().includes(needle) ||
        (row?.label ?? "").toLowerCase().includes(needle) ||
        (row?.description ?? "").toLowerCase().includes(needle) ||
        platformLabel(program.platform).toLowerCase().includes(needle) ||
        contentLabel(program).toLowerCase().includes(needle))
    );
  };

  const filteredLive = programs.filter((program) => program.status === "live" && matchesControls(program));
  const lanes = useMemo<TimelineLane[]>(() => {
    const hideEmptyRows = platform !== "all" || status !== "all" || Boolean(needle);
    return networkGroups
      .filter((group) => member === "all" || group.rows.some((row) => row.timelineSlug === member))
      .flatMap((group) => group.rows.map((row, rowIndex): TimelineLane => {
        const sourcePrograms = row.kind === "continuous"
          ? continuousPrograms(group, row, range.start, range.end, clockMs)
          : programs
            .filter((program) => programBelongsToRow(program, row))
            .map((program) => ({
              ...program,
              guideRowId: row.id,
              channelMode: row.kind,
            }));
        const visiblePrograms = sourcePrograms.filter((program) => {
          if (!matchesControls(program, group, row)) return false;
          const start = Date.parse(program.startsAt);
          const end = eventEnd(program, clockMs);
          if (program.continuous) return start < range.end && end > range.start;
          if (program.status === "live") return clockMs >= range.start && clockMs <= range.end;
          if (program.status === "published") return start >= range.start && start < range.end;
          return start < range.end && end > range.start;
        });
        const positioned = positionLane(
          visiblePrograms,
          range.start,
          range.end,
          range.pxPerMinute,
          trackWidth,
          clockMs,
        );
        return {
          key: row.id,
          channel: channelFor(row.timelineSlug),
          group,
          row,
          rowIndex,
          rowCount: group.rows.length,
          events: positioned.events,
          slots: positioned.slots,
        };
      }))
      .filter((lane) => !hideEmptyRows || lane.events.length > 0);
    // matchesControls is intentionally represented by its primitive inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockMs, member, needle, networkGroups, platform, programs, range, status, trackWidth]);

  function channelRowForProgram(program: GuideProgram): GuideNetworkRow | null {
    if (program.guideRowId) {
      return networkGroups.flatMap((entry) => entry.rows).find((row) => row.id === program.guideRowId) ?? null;
    }
    const group = networkGroups.find((entry) =>
      entry.rows.some((row) => row.timelineSlug === program.slug),
    );
    if (!group) return null;

    const short = program.contentType === "short" || program.watchItem?.format === "short";
    const houseCreatorMix = program.slug === "house" && Boolean(program.watchItem?.memberSlug);
    const broadcast = program.contentType === "live" || program.contentType === "broadcast" ||
      program.status === "live" || program.status === "upcoming" || program.status === "replay" ||
      program.watchItem?.kind === "live" || program.watchItem?.kind === "vod" ||
      program.watchItem?.format === "live";
    const hasLiveRow = group.rows.some((row) => row.kind === "live");
    const preferredKind: GuideNetworkRow["kind"] = houseCreatorMix
      ? "continuous"
      : broadcast
        ? hasLiveRow
          ? "live"
          : program.platform === "youtube"
            ? "videos"
            : "continuous"
        : short
          ? "shorts"
        : program.platform === "youtube"
          ? "videos"
          : "continuous";
    return group.rows.find((row) => row.kind === preferredKind)
      ?? group.rows.find((row) => row.kind === "continuous")
      ?? group.rows[0]
      ?? null;
  }

  function playOnGuideChannel(program: GuideProgram, item: WatchItem) {
    const openLiveChat = () => {
      const playable = itemToPlayable(item);
      if (twitchLiveChatLogin(playable)) {
        player.setCompanionView("chat");
        player.setQueueOpen(true);
      }
    };
    const row = channelRowForProgram(program);
    if (!row) {
      player.play(item);
      openLiveChat();
      return;
    }
    const network = networkGroups.find((entry) => entry.rows.some((candidate) => candidate.id === row.id));
    const playableKey = itemToPlayable(item)?.key;
    const channel = playableKey ? {
      ...row.channel,
      airing: {
        itemKey: playableKey,
        network: network?.network.name ?? row.channel.title,
        channel: row.label,
        startsAt: program.startsAt,
        endsAt: program.endsAt ?? undefined,
        status: program.status,
        continuous: program.continuous === true,
      },
    } : row.channel;
    const lineupItem = row.items.find((candidate) =>
      candidate.id === item.id && candidate.platform === item.platform,
    );
    if (lineupItem) {
      player.playChannel(channel, row.items, lineupItem);
      openLiveChat();
      return;
    }
    player.play(item, row.items, { channel });
    openLiveChat();
  }

  function playProgram(program: GuideProgram) {
    if (program.watchItem) {
      const playable = itemToPlayable(program.watchItem);
      if (!playable || isExternalOnly(program)) {
        window.open(program.sourceUrl, "_blank", "noopener,noreferrer");
        return;
      }
      playOnGuideChannel(program, program.watchItem);
      return;
    }
    const channel = channelFor(program.slug);
    if (program.status === "live" && program.login) {
      playOnGuideChannel(program, {
        id: program.id,
        kind: "live",
        platform: "twitch",
        title: program.title,
        subtitle: program.game ?? undefined,
        poster: program.thumbnailUrl || channel.portrait,
        backdrop: program.thumbnailUrl || channel.portrait,
        memberSlug: program.slug === "house" ? null : program.slug,
        memberLabel: channel.sublabel,
        accent: channel.accent,
        href: `/watch/live/${program.login}`,
        live: { login: program.login, game: program.game ?? undefined, startedAt: program.startsAt },
        format: "live",
      });
      return;
    }
    if (program.youtubeId) {
      playOnGuideChannel(program, {
        id: program.id,
        kind: "youtube",
        platform: "youtube",
        title: program.title,
        poster: program.thumbnailUrl || channel.portrait,
        backdrop: program.thumbnailUrl || channel.portrait,
        memberSlug: program.slug === "house" ? null : program.slug,
        memberLabel: channel.sublabel,
        accent: channel.accent,
        href: `/theater?kind=youtube&id=${encodeURIComponent(program.youtubeId)}&slug=${encodeURIComponent(program.slug)}`,
        format: program.contentType === "short" ? "short" : "long",
        orientation: program.orientation,
      });
      return;
    }
    if (program.vodId) {
      playOnGuideChannel(program, {
        id: program.id,
        kind: "vod",
        platform: "twitch",
        title: program.title,
        poster: program.thumbnailUrl || channel.portrait,
        backdrop: program.thumbnailUrl || channel.portrait,
        memberSlug: program.slug,
        memberLabel: channel.sublabel,
        accent: channel.accent,
        href: `/theater?kind=vod&id=${encodeURIComponent(program.vodId)}&login=${encodeURIComponent(program.login ?? "")}&slug=${encodeURIComponent(program.slug)}`,
        format: "long",
      });
      return;
    }
    window.open(program.sourceUrl, "_blank", "noopener,noreferrer");
  }

  function suspendTimelineEdgePaging(delay = 260) {
    timelinePagingSuspendedRef.current = true;
    if (timelineScrollTimerRef.current !== null) {
      window.clearTimeout(timelineScrollTimerRef.current);
      timelineScrollTimerRef.current = null;
    }
    if (timelinePagingUnlockTimerRef.current !== null) {
      window.clearTimeout(timelinePagingUnlockTimerRef.current);
    }
    timelinePagingUnlockTimerRef.current = window.setTimeout(() => {
      timelinePagingSuspendedRef.current = false;
      timelinePagingUnlockTimerRef.current = null;
    }, delay);
  }

  function timelineLabelWidth(element: HTMLDivElement) {
    return element.querySelector<HTMLElement>(".guide-timeline-label")?.getBoundingClientRect().width || LABEL_W;
  }

  function captureTimelineAnchor(element: HTMLDivElement) {
    const labelWidth = timelineLabelWidth(element);
    const viewportX = labelWidth + Math.max(0, element.clientWidth - labelWidth) / 2;
    const trackPosition = Math.max(0, element.scrollLeft + viewportX - labelWidth);
    return {
      anchorMs: range.start + (trackPosition / range.pxPerMinute) * 60_000,
      viewportX,
    };
  }

  function pageTimeline(direction: -1 | 1, element = timelineScroller.current): boolean {
    if (!element || scope === "upcoming") return false;
    const todayAnchor = startOfZonedDay(liveNowMs, 0, timePreferences.timeZone);
    if (direction < 0 && range.start <= earliestAvailableMs) return false;
    if (direction > 0 && timelineAnchorMs >= todayAnchor) return false;

    const pageDays = scope === "today" ? 1 : ARCHIVE_PAGE_DAYS;
    const requested = startOfZonedDay(timelineAnchorMs, direction * pageDays, timePreferences.timeZone);
    const nextAnchor = direction > 0 ? Math.min(requested, todayAnchor) : requested;
    if (nextAnchor === timelineAnchorMs) return false;
    followingNowRef.current = nextAnchor === todayAnchor;
    timelineRestoreRef.current = {
      kind: "preserve",
      ...captureTimelineAnchor(element),
    };
    suspendTimelineEdgePaging();
    setTimelineAnchorMs(nextAnchor);
    return true;
  }

  function scrollTimeline(direction: -1 | 1) {
    const element = timelineScroller.current;
    if (!element) return;
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const atEdge = direction < 0 ? element.scrollLeft <= 3 : element.scrollLeft >= maxLeft - 3;
    if (atEdge && pageTimeline(direction, element)) return;
    element.scrollBy({ left: direction * Math.max(280, element.clientWidth * 0.78), behavior: "smooth" });
  }

  function scrollToNow(behavior: ScrollBehavior = "smooth") {
    const element = timelineScroller.current;
    if (!element || liveNowMs < range.start || liveNowMs > range.end) return;
    const nowLeft = timelineLabelWidth(element) + timelineOffsetPx(liveNowMs, range.start, range.pxPerMinute);
    element.scrollTo({ left: Math.max(0, nowLeft - element.clientWidth * 0.55), behavior });
  }

  function returnToNow() {
    const todayAnchor = startOfZonedDay(liveNowMs, 0, timePreferences.timeZone);
    followingNowRef.current = true;
    // Keep the smooth recenter from being mistaken for intentional browsing.
    suspendTimelineEdgePaging(800);
    if (scope !== "upcoming" && timelineAnchorMs !== todayAnchor) {
      timelineRestoreRef.current = { kind: "now" };
      setTimelineAnchorMs(todayAnchor);
      return;
    }
    scrollToNow();
  }

  function selectTimelineScope(nextScope: TimelineScope) {
    followingNowRef.current = true;
    timelineRestoreRef.current = { kind: "now" };
    suspendTimelineEdgePaging(800);
    setTimelineAnchorMs(startOfZonedDay(liveNowMs, 0, timePreferences.timeZone));
    setScope(nextScope);
    if (nextScope === scope) {
      window.requestAnimationFrame(() => {
        scrollToNow();
        timelineRestoreRef.current = null;
      });
    }
  }

  function zoomTimeline(direction: -1 | 1) {
    const nextIndex = Math.max(
      0,
      Math.min(TIMELINE_ZOOM_LEVELS.length - 1, timelineZoomIndex + direction),
    );
    if (nextIndex === timelineZoomIndex) return;
    const element = timelineScroller.current;
    if (element) {
      timelineRestoreRef.current = {
        kind: "preserve",
        ...captureTimelineAnchor(element),
      };
    }
    suspendTimelineEdgePaging();
    setTimelineZoomIndex(nextIndex);
  }

  function handleTimelineScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    if (timelinePagingSuspendedRef.current) return;
    followingNowRef.current = false;
    if (timelineScrollTimerRef.current !== null) window.clearTimeout(timelineScrollTimerRef.current);
    timelineScrollTimerRef.current = window.setTimeout(() => {
      timelineScrollTimerRef.current = null;
      if (timelinePagingSuspendedRef.current || element.dataset.dragScrollActive === "true") return;
      const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      if (element.scrollLeft <= 3) pageTimeline(-1, element);
      else if (element.scrollLeft >= maxLeft - 3) pageTimeline(1, element);
    }, 140);
  }

  function handleTimelineKey(event: KeyboardEvent<HTMLDivElement>) {
    const element = timelineScroller.current;
    if (!element) return;
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      scrollTimeline(-1);
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      scrollTimeline(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (!pageTimeline(-1, element)) element.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      if (!pageTimeline(1, element)) element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      returnToNow();
    }
  }

  useLayoutEffect(() => {
    if (lanes.length === 0) return;
    const element = timelineScroller.current;
    if (!element) return;
    const restore = timelineRestoreRef.current;
    if (restore?.kind === "preserve") {
      const restoredLeft = timelineLabelWidth(element) +
        ((restore.anchorMs - range.start) / 60_000) * range.pxPerMinute -
        restore.viewportX;
      const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      suspendTimelineEdgePaging();
      element.scrollLeft = Math.max(0, Math.min(maxLeft, restoredLeft));
      timelineRestoreRef.current = null;
      initialTimelineCenteredRef.current = true;
      return;
    }
    if (restore?.kind === "now" || !initialTimelineCenteredRef.current) {
      suspendTimelineEdgePaging();
      scrollToNow("auto");
      timelineRestoreRef.current = null;
      initialTimelineCenteredRef.current = true;
    }
    // Preserve the visible dates when archive pages change. Center Now only
    // on initial load, a scope reset, or an explicit Today / Now action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes.length, range.end, range.pxPerMinute, range.start, scope]);

  useEffect(() => () => {
    if (timelineScrollTimerRef.current !== null) window.clearTimeout(timelineScrollTimerRef.current);
    if (timelinePagingUnlockTimerRef.current !== null) window.clearTimeout(timelinePagingUnlockTimerRef.current);
  }, []);

  const sourceUnavailable =
    data?.sources?.twitchSchedule === "unconfigured" &&
    data?.sources?.youtubeUpcoming === "unconfigured" &&
    data?.sources?.socialTimeline !== "ok";
  const archiveStartReached = range.start <= earliestAvailableMs;
  const rangeStartLabel = formatGuideDay(range.start, timePreferences);
  const rangeEndLabel = formatGuideDay(range.end - 1, timePreferences);
  const visibleRangeLabel = rangeStartLabel === rangeEndLabel
    ? rangeStartLabel
    : `${rangeStartLabel} – ${rangeEndLabel}`;
  const archiveStartLabel = formatGuideDay(earliestAvailableMs, timePreferences);
  const rangeInstruction = scope === "upcoming"
    ? "Schedules refresh automatically"
    : archiveStartReached
      ? `History begins ${archiveStartLabel}`
      : "Drag for earlier programs";
  const boardStyle = {
    "--guide-track-w": `${trackWidth}px`,
    "--guide-label-w": `${LABEL_W}px`,
  } as CSSProperties;
  const gridStep = (scope === "today" ? 180 : 720) * range.pxPerMinute;
  const timelineZoomPercent = Math.round(timelineZoom * 100);

  return (
    <div className="guide-v2">
      <header className="guide-v2-header">
        <div>
          <p className="watch-kicker">Every network · every channel</p>
          <h1 className="watch-title mt-2 text-4xl md:text-6xl">Guide</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-dim)] md:text-base">
            Live streams, scheduled broadcasts, replays, videos, Shorts, TikToks, Instagram posts, and photos—ordered by when they happened.
          </p>
        </div>
        <div className="guide-v2-status" aria-live="polite">
          <span className={livePrograms.length ? "is-live" : ""} aria-hidden />
          <strong>{livePrograms.length ? `${livePrograms.length} live` : "House is quiet"}</strong>
        </div>
      </header>

      <div className="guide-secondary">
        <div className="guide-secondary-body">

      {livePrograms.length > 0 && (status === "all" || status === "live") ? (
        <section className="guide-live-first" aria-labelledby="guide-live-title">
          <div className="guide-section-heading">
            <div>
              <p className="watch-kicker">Right now</p>
              <h2 id="guide-live-title">Live now</h2>
            </div>
            {filteredLive.length > 0 ? <span>{filteredLive.length} on air</span> : null}
          </div>

          {filteredLive.length > 0 ? (
            <div ref={liveScroller} className="guide-live-rail guide-drag watch-shelf" data-lenis-prevent>
              {filteredLive.map((program) => {
                const channel = channelFor(program.slug);
                const item = liveProgramCardItem(program, channel, clockMs);
                return (
                  <PosterCard
                    key={program.id}
                    item={item}
                    context={[item]}
                    onPlay={() => playProgram(program)}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="guide-controls" aria-label="Guide filters">
        <div className="guide-filter-row" role="group" aria-label="Event type">
          {([
            ["all", "Everything"],
            ["live", "Live"],
            ["upcoming", "Upcoming"],
            ["published", "Posts"],
            ["replay", "Broadcasts"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={status === value ? "is-active" : ""} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="guide-filter-row" role="group" aria-label="Platform">
          {([
            ["all", "All platforms"],
            ["youtube", "YouTube"],
            ["twitch", "Twitch"],
            ["tiktok", "TikTok"],
            ["instagram", "Instagram"],
            ["x", "X"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={platform === value ? "is-active" : ""} aria-pressed={platform === value} onClick={() => setPlatform(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="guide-select-wrap guide-untitled-select">
          <WatchSelect
            ariaLabel="Filter by member"
            value={member}
            onChange={setMember}
            popoverClassName="guide-member-popover min-w-[13.5rem]"
            options={[
              {
                id: "all",
                label: "All members",
                icon: <GuideFilterLogo src="/brand/app-icon-1024.png" label="CORE" accent="#db0368" />,
              },
              ...CHANNELS.map((channel) => ({
                id: channel.slug,
                label: channel.sublabel,
                icon: <GuideFilterLogo src={channel.logo} label={channel.label} accent={channel.accent} />,
              })),
            ]}
          />
        </div>

        <label className="guide-search-wrap">
          <span className="sr-only">Search titles, members, platforms, and formats</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the timeline" />
        </label>
      </section>

      <section className="guide-schedule guide-timeline-section" aria-labelledby="guide-timeline-title">
        <div className="guide-section-heading guide-schedule-heading">
          <div>
            <p className="watch-kicker">Timeline</p>
            <h2 id="guide-timeline-title">Channel guide</h2>
          </div>
          <div className="guide-scope" role="group" aria-label="Timeline range">
            {([ ["today", "Today"], ["week", "8 days"], ["upcoming", "Upcoming"] ] as const).map(([value, label]) => (
              <button key={value} type="button" className={scope === value ? "is-active" : ""} aria-pressed={scope === value} onClick={() => selectTimelineScope(value)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="guide-timeline-toolbar">
          <p>
            <strong>{visibleRangeLabel}</strong>
            <span>{rangeInstruction} · Times shown in {formatTimeZoneLabel(liveNowMs, timePreferences)}</span>
          </p>
          <div>
            <button type="button" onClick={() => scrollTimeline(-1)} aria-label="Move timeline earlier">← <span>Earlier</span></button>
            <button type="button" onClick={returnToNow}>Today / Now</button>
            <button type="button" onClick={() => scrollTimeline(1)} aria-label="Move timeline later"><span>Later</span> →</button>
            <span className="guide-timeline-zoom" role="group" aria-label="Timeline zoom">
              <span>Time scale</span>
              <Tooltip
                title="Zoom out"
                description="Show more time at once on the timeline."
                placement="top"
                isDisabled={timelineZoomIndex === 0}
              >
                <button
                  type="button"
                  onClick={() => zoomTimeline(-1)}
                  disabled={timelineZoomIndex === 0}
                  aria-label="Show more time in the timeline"
                >−</button>
              </Tooltip>
              <output aria-live="polite">{timelineZoomPercent}%</output>
              <Tooltip
                title="Zoom in"
                description="Show a shorter time range with larger program cards."
                placement="top"
                isDisabled={timelineZoomIndex === TIMELINE_ZOOM_LEVELS.length - 1}
              >
                <button
                  type="button"
                  onClick={() => zoomTimeline(1)}
                  disabled={timelineZoomIndex === TIMELINE_ZOOM_LEVELS.length - 1}
                  aria-label="Show less time with more timeline detail"
                >+</button>
              </Tooltip>
            </span>
          </div>
        </div>

        {isLoading && !data ? <GuideLoading /> : null}
        {error ? <p className="guide-inline-note">The timeline could not refresh. Live status will keep updating.</p> : null}

        {!isLoading && lanes.length === 0 ? (
          <div className="guide-schedule-empty">
            <strong>No dated events match this view.</strong>
            <span>{sourceUnavailable ? "Connected platform accounts will populate their posts, videos, and schedules here." : "Try the 8-day view, another member, or clear a filter."}</span>
          </div>
        ) : null}

        {lanes.length > 0 ? (
          <div ref={timelineScroller} className="guide-timeline-scroll guide-drag" tabIndex={0} role="region" aria-label={`Chronological community channel timeline, ${visibleRangeLabel}. ${scope === "upcoming" ? "Move left and right through connected schedules" : "Drag left to load older available history"}, or use the arrow keys. The mouse wheel scrolls the page.`} onKeyDown={handleTimelineKey} onScroll={handleTimelineScroll}>
            <div className="guide-timeline-board" style={boardStyle}>
              <div className="guide-timeline-row guide-timeline-head">
                <div className="guide-timeline-label guide-timeline-sticky">Network / channel</div>
                <div className="guide-timeline-track" style={{ width: trackWidth }}>
                  {ticks.map((tick) => (
                    <span key={tick} className="guide-timeline-tick" style={{ left: timelineOffsetPx(tick, range.start, range.pxPerMinute) }}>
                      {formatTick(tick, scope, timePreferences)}
                    </span>
                  ))}
                  {liveNowMs >= range.start && liveNowMs <= range.end ? (
                    <span className="guide-timeline-now guide-timeline-now-head" style={{ left: timelineOffsetPx(liveNowMs, range.start, range.pxPerMinute) }}><span>Now · {formatLiveClock(liveNowMs, timePreferences)}</span></span>
                  ) : null}
                </div>
              </div>

              {lanes.map((lane) => {
                const rowHeight = Math.max(ROW_BASE_H, lane.slots * SLOT_H + 14);
                const rowClasses = [
                  "guide-timeline-row",
                  "guide-timeline-channel-row",
                  `is-${lane.row.kind}`,
                  lane.rowIndex === 0 ? "is-network-first" : "",
                  lane.rowIndex === lane.rowCount - 1 ? "is-network-last" : "",
                ].filter(Boolean).join(" ");
                return (
                  <div
                    key={lane.key}
                    className={rowClasses}
                    style={{ height: rowHeight, "--guide-network-accent": lane.group.network.accent } as CSSProperties}
                    aria-label={`${lane.group.network.name} ${lane.row.label} channel`}
                  >
                    <div className="guide-timeline-label guide-timeline-sticky" title={lane.row.description}>
                      <ChannelMark channel={lane.channel} />
                      <span className="guide-timeline-label-copy">
                        <strong>{lane.group.network.name}</strong>
                        <span className={`guide-timeline-subchannel is-${lane.row.kind}`}>
                          <i aria-hidden />
                          {lane.row.label}
                        </span>
                      </span>
                    </div>
                    <div className="guide-timeline-track guide-timeline-grid" style={{ width: trackWidth, backgroundSize: `${gridStep}px 100%` }}>
                      {lane.events.map((event) => (
                        <TimelineCard
                          key={event.program.id}
                          event={event}
                          network={lane.group.network.name}
                          channel={lane.row.label}
                          timePreferences={timePreferences}
                          nowMs={liveNowMs}
                          onPlay={playProgram}
                        />
                      ))}
                      {lane.events.length === 0 ? <span className="guide-timeline-lane-empty">{emptyLaneLabel(lane.row)}</span> : null}
                      {liveNowMs >= range.start && liveNowMs <= range.end ? (
                        <span className="guide-timeline-now" style={{ left: timelineOffsetPx(liveNowMs, range.start, range.pxPerMinute) }} aria-hidden />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

        </div>
      </div>
    </div>
  );
}

function ChannelMark({ channel }: { channel: GuideChannel }) {
  return (
    <span className="guide-v2-mark" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={channel.logo} alt="" />
    </span>
  );
}

function TimelineCard({
  event,
  network,
  channel: channelLabel,
  timePreferences,
  nowMs,
  onPlay,
}: {
  event: PositionedProgram;
  network: string;
  channel: string;
  timePreferences: TimePreferences;
  nowMs: number;
  onPlay: (program: GuideProgram) => void;
}) {
  const { program, left, width, slot } = event;
  const channel = channelFor(program.slug);
  const playable = programIsPlayable(program);
  const orientation = program.orientation ?? "landscape";
  const contentClass = program.contentType ?? "event";
  const programEnd = eventEnd(program, nowMs);
  const activeNow = program.continuousPhase === "now" || (Date.parse(program.startsAt) <= nowMs && programEnd > nowMs);
  const isPast = !activeNow && (program.continuousPhase === "past" || programEnd <= nowMs);
  const elapsed = activeNow
    ? Math.max(0, Math.min(1, (nowMs - Date.parse(program.startsAt)) / Math.max(1, programEnd - Date.parse(program.startsAt))))
    : 0;
  const className = `guide-timeline-card is-${program.status} is-${orientation} is-${contentClass}${program.continuous ? " is-continuous" : ""}${activeNow ? " is-airing-now" : ""}${isPast ? " is-past" : ""}`;
  const style = { left, width, top: 7 + slot * SLOT_H, "--guide-elapsed": elapsed } as CSSProperties;
  const content = (
    <>
      {activeNow ? <span className="guide-timeline-elapsed" aria-hidden /> : null}
      <span className="guide-timeline-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={program.thumbnailUrl || channel.portrait} alt="" loading="lazy" />
      </span>
      <span className="guide-timeline-card-copy">
        <span className="guide-timeline-card-meta">
          <span className="guide-timeline-card-time">{programTimeLabel(program, timePreferences)}</span>
        </span>
        <strong>{program.title}</strong>
      </span>
    </>
  );

  if (playable) {
    return <button type="button" data-no-drag className={className} style={style} onClick={() => onPlay(program)} aria-label={`Tune to ${program.title} on ${network} ${channelLabel}, ${programAiringLabel(program, timePreferences)}`}>{content}</button>;
  }
  return <a data-no-drag className={className} style={style} href={program.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${program.title} from ${network} ${channelLabel}, ${programAiringLabel(program, timePreferences)}`}>{content}</a>;
}

function GuideLoading() {
  return (
    <div className="guide-loading" role="status">
      <span /><span /><span /><span className="sr-only">Loading timeline</span>
    </div>
  );
}

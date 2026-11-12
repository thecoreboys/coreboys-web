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
import { useWatchGuide } from "@/hooks/useWatchGuide";
import { navigateToUrl } from "@/lib/external-navigation";
import type { GuideProgram, GuideStatus as ProgramStatus, GuideContentType as ContentType } from "@/lib/watch/guide-response";
import type { GuidePayload } from "@/lib/watch/guide-response";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { itemToPlayable, type Playable } from "@/lib/watch/playable";
import { removeActiveTwitchArchiveDuplicates } from "@/lib/watch/guide-programs";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import {
  isConnectedShortChannelItem,
  mediaTypeLabel,
  type GuideNetworkGroup,
  type GuideNetworkRow,
} from "@/lib/watch/channels";
import { buildContinuousGuideSchedule } from "@/lib/watch/continuous-schedule";
import { liveTimelineEndMs } from "@/lib/watch/live-schedule";
import { placeGuideCard } from "@/lib/watch/guide-card-placement";
import { WatchThumb } from "./WatchThumb";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { PosterCard } from "@/components/watch/PosterCard";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { twitchLiveChatLogin } from "@/lib/watch/player-companion";
import { unpackWatchItemLists, type WatchItemPayload } from "@/lib/watch/item-payload";
import { readableTitle } from "@/lib/watch/presentation";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Play, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

const HYDRATION_TIME_PREFERENCES = {
  locale: "en-US",
  timeZone: "UTC",
} as const;
const LABEL_W = 188;
const ROW_BASE_H = 152;
const SLOT_H = 144;
const ARCHIVE_PAGE_DAYS = 4;
const TIMELINE_ZOOM_LEVELS = [0.6, 0.8, 1, 1.3, 1.65, 2.1] as const;
const DEFAULT_TIMELINE_ZOOM_INDEX = 4;

type StatusFilter = "all" | ProgramStatus;
type TimelineScope = "today" | "week" | "upcoming";

export type PlayerGuideSession = {
  filters?: {
    status: StatusFilter;
    platform: "all" | WatchPlatform;
    member: string;
    query: string;
    scope: TimelineScope;
    anchorMs: number;
    zoomIndex: number;
    view: "now" | "timeline" | null;
    expanded: boolean;
    timeZone: string | null;
    window: GuidePayload["window"];
  };
  pageScrollTop?: number;
  timelineScroll?: { left: number; top: number };
  visiblePrograms?: Map<string, number>;
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
  // Live status is authoritative over a stale provider duration or scheduled
  // end. A currently live card must continue through Now on every Guide view.
  if (program.status === "live") return liveTimelineEndMs(start, explicit, nowMs);
  if (Number.isFinite(explicit) && explicit > start) return explicit;
  if (program.durationSeconds && program.durationSeconds > 0) return start + program.durationSeconds * 1000;
  return start + 15 * 60_000;
}

function cardBaseWidth(program: GuideProgram, durationWidth: number): number {
  // The 24/7 lane is a real linear schedule. Keep its geometry tied to the
  // provider duration; a one-minute Short should look like one minute, not an
  // invented multi-hour program. The single pixel floor keeps it discoverable.
  if (program.continuous) return Math.max(1, durationWidth - 1);
  if (program.status === "live" || program.status === "upcoming" || program.status === "replay") {
    return Math.max(240, Math.min(400, durationWidth));
  }
  return 240;
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
      const { left, width, slot } = placeGuideCard(naturalLeft, desiredWidth, slotEnds, trackWidth);
      return [{ program, left, width, slot }];
    });
  return { events, slots: Math.max(1, slotEnds.length) };
}

export function GuideGrid({
  serverNow,
  initialLive,
  networks,
  initialGuide,
  partial: _partial,
  onTune,
  session,
}: {
  serverNow: string;
  initialLive: WatchItem[];
  networks: GuideNetworkGroup[];
  initialGuide?: GuidePayload;
  partial?: boolean;
  onTune?: (item: Playable) => void;
  session?: PlayerGuideSession;
}) {
  const initialNowMs = safeTime(serverNow, Date.now());
  const timePreferences = useBrowserTimeZone();
  const [clockMs, setClockMs] = useState(initialNowMs);
  const [liveNowMs, setLiveNowMs] = useState(initialNowMs);
  const saved = session?.filters;
  const [status, setStatus] = useState<StatusFilter>(saved?.status ?? "all");
  const [platform, setPlatform] = useState<"all" | WatchPlatform>(saved?.platform ?? "all");
  const [member, setMember] = useState(saved?.member ?? "all");
  const [scope, setScope] = useState<TimelineScope>(saved?.scope ?? "today");
  const [timelineAnchorMs, setTimelineAnchorMs] = useState(() =>
    saved?.anchorMs ?? startOfZonedDay(initialNowMs, 0, HYDRATION_TIME_PREFERENCES.timeZone));
  const [timelineZoomIndex, setTimelineZoomIndex] = useState(saved?.zoomIndex ?? DEFAULT_TIMELINE_ZOOM_INDEX);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [compactScreen, setCompactScreen] = useState(() => !session || typeof window === "undefined" || window.matchMedia("(max-width: 767px)").matches);
  const [chosenView, setChosenView] = useState<"now" | "timeline" | null>(saved?.view ?? null);
  const [filtersExpanded, setFiltersExpanded] = useState(saved?.expanded ?? false);
  const [queueLoadError, setQueueLoadError] = useState<GuideNetworkRow | null>(null);
  const [timelineViewport, setTimelineViewport] = useState({ left: session?.timelineScroll?.left ?? 0, width: 1200 });
  const guideRootRef = useRef<HTMLDivElement>(null);
  const pageScrollToRestore = useRef(session?.pageScrollTop);
  const timelineScrollToRestore = useRef(session?.timelineScroll);
  const guideView = chosenView ?? "now";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompactScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const timelineScroller = useDragScroll<HTMLDivElement>({ wheel: "native" });
  useEffect(() => {
    if (guideView !== "timeline" || !timelineScroller.current) return;
    const element = timelineScroller.current;
    const update = () => setTimelineViewport({ left: Math.floor(element.scrollLeft / 256) * 256, width: element.clientWidth });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [guideView, timelineScroller]);
  const liveScroller = useDragScroll<HTMLDivElement>({ wheel: "x" });
  const timelineRestoreRef = useRef<TimelineRestore | null>({ kind: "now" });
  const timelineScrollTimerRef = useRef<number | null>(null);
  const timelinePagingUnlockTimerRef = useRef<number | null>(null);
  const timelinePagingSuspendedRef = useRef(false);
  const initialTimelineCenteredRef = useRef(false);
  const appliedBrowserTimeZoneRef = useRef<string | null>(saved?.timeZone ?? null);
  const observedDayStartRef = useRef<number | null>(null);
  const followingNowRef = useRef(!session?.timelineScroll);
  const player = usePlayer();
  const { data: liveData } = useLiveStatus();
  const [requestedWindow, setRequestedWindow] = useState(saved?.window ?? initialGuide?.window);
  const { data, error, isLoading, isValidating, mutate } = useWatchGuide({ window: requestedWindow, initialData: initialGuide });
  const networkGroups = data?.networks?.length ? data.networks : networks;
  const scheduleLoading = Boolean(data?.partial && data.sources?.catalog !== "error" && !error);
  const scheduleNeedsRetry = Boolean(error);
  const sourcesIncomplete = Object.values(data?.sources ?? {}).includes("error");
  const sourcesLoading = Object.values(data?.sources ?? {}).includes("loading");
  const activeFilterCount = Number(status !== "all") + Number(platform !== "all") + Number(member !== "all") + Number(Boolean(query.trim()));
  function clearFilters() {
    setStatus("all"); setPlatform("all"); setMember("all"); setQuery("");
  }

  useLayoutEffect(() => {
    if (!session) return;
    session.filters = {
      status, platform, member, query, scope, anchorMs: timelineAnchorMs,
      zoomIndex: timelineZoomIndex, view: chosenView, expanded: filtersExpanded,
      timeZone: appliedBrowserTimeZoneRef.current, window: requestedWindow,
    };
  }, [session, status, platform, member, query, scope, timelineAnchorMs, timelineZoomIndex, chosenView, filtersExpanded, requestedWindow, timePreferences.timeZone]);

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
    const mergedPrograms = [...livePrograms, ...(data?.programs ?? []).filter((program) => !program.continuous && program.status !== "live")].filter((program) => {
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
    if (data?.window) return data.window.earliest;
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
  }, [clockMs, data?.window, networkGroups, programs, timePreferences.timeZone]);

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
  useEffect(() => {
    if (!initialGuide?.window) return;
    // Keep the current payload through zoom/clock changes. Only a genuinely
    // different date range needs another server-computed schedule.
    // Now & next always follows the current clock, including after browsing
    // history. An old timeline window cannot supply the current airings.
    const start = guideView === "now" ? floorHalfHour(clockMs) : range.start;
    const end = guideView === "now" ? Math.ceil((clockMs + 6 * 3_600_000) / 3_600_000) * 3_600_000 : range.end;
    setRequestedWindow((previous) => previous && start >= previous.start && end <= previous.end
      ? previous : { start, end, earliest: previous?.earliest ?? start });
  }, [clockMs, guideView, initialGuide?.window, range.start, range.end]);
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
  const rowContinuousPrograms = (group: GuideNetworkGroup, row: GuideNetworkRow, start: number, end: number) => data?.window
    ? data.programs.filter((program) => program.continuous && program.guideRowId === row.id).map((program): GuideProgram => ({
      ...program, continuousPhase: Date.parse(program.startsAt) <= clockMs && Date.parse(program.endsAt ?? "") > clockMs
        ? "now" : Date.parse(program.endsAt ?? "") <= clockMs ? "past" : "future",
    }))
    : continuousPrograms(group, row, start, end, clockMs);
  const nowNextRows = useMemo(() => guideView !== "now" ? [] : networkGroups.flatMap((group) => group.rows.flatMap((row) => {
    if (row.kind !== "live" && row.kind !== "continuous") return [];
    const lineup = (row.kind === "continuous"
      ? rowContinuousPrograms(group, row, clockMs, clockMs + 6 * 3_600_000)
      : programs.filter((program) => programBelongsToRow(program, row)))
      .filter((program) => matchesControls(program, group, row))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const current = lineup.find((program) => program.continuous ? program.continuousPhase === "now" : program.status === "live");
    const next = lineup.find((program) => program.continuous ? program.continuousPhase === "future" : program.status === "upcoming" && Date.parse(program.startsAt) > clockMs);
    return current || next ? [{ group, row, current, next }] : [];
  })), [clockMs, guideView, member, needle, networkGroups, platform, programs, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const lanes = useMemo<TimelineLane[]>(() => {
    if (guideView !== "timeline") return [];
    const hideEmptyRows = platform !== "all" || status !== "all" || Boolean(needle);
    return networkGroups
      .filter((group) => member === "all" || group.rows.some((row) => row.timelineSlug === member))
      .flatMap((group) => group.rows.map((row, rowIndex): TimelineLane => {
        const sourcePrograms = row.kind === "continuous"
          ? rowContinuousPrograms(group, row, range.start, range.end)
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
  }, [clockMs, guideView, member, needle, networkGroups, platform, programs, range, status, trackWidth]);

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

  async function hydratePlaybackQueue(row: GuideNetworkRow) {
    setQueueLoadError(null);
    try {
      const response = await fetch(`/api/watch/channels/${encodeURIComponent(row.networkSlug)}/lineup?mode=${row.kind}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Queue unavailable");
      const items = unpackWatchItemLists(await response.json() as WatchItemPayload).items ?? [];
      const playables = items.map(itemToPlayable).filter((item): item is NonNullable<typeof item> => Boolean(item));
      player.refill(playables, { channelId: row.channel.id });
    } catch { setQueueLoadError(row); }
  }

  function playOnGuideChannel(program: GuideProgram, item: WatchItem) {
    const playable = itemToPlayable(item);
    if (!playable) return;
    const openLiveChat = () => {
      if (twitchLiveChatLogin(playable)) {
        player.setCompanionView("chat");
        player.setQueueOpen(true);
      }
    };
    const row = channelRowForProgram(program);
    if (!row) {
      player.play(playable);
      openLiveChat();
      onTune?.(playable);
      return;
    }
    const network = networkGroups.find((entry) => entry.rows.some((candidate) => candidate.id === row.id));
    const channel = {
      ...row.channel,
      airing: {
        itemKey: playable.key,
        network: network?.network.name ?? row.channel.title,
        channel: row.label,
        startsAt: program.startsAt,
        endsAt: program.endsAt ?? undefined,
        status: program.status,
        continuous: program.continuous === true,
      },
    };
    const lineupItem = row.items.find((candidate) =>
      candidate.id === item.id && candidate.platform === item.platform,
    );
    if (data?.window) void hydratePlaybackQueue(row);
    if (lineupItem) {
      player.playChannel(channel, row.items, lineupItem);
    } else {
      player.play(playable, row.items, { channel });
    }
    openLiveChat();
    onTune?.(playable);
  }

  function playProgram(program: GuideProgram) {
    if (program.watchItem) {
      const playable = itemToPlayable(program.watchItem);
      if (!playable || isExternalOnly(program)) {
        navigateToUrl(program.sourceUrl);
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
    navigateToUrl(program.sourceUrl);
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
    if (compactScreen) {
      if (scope === "upcoming") return;
      const next = startOfZonedDay(timelineAnchorMs, direction * (scope === "today" ? 1 : ARCHIVE_PAGE_DAYS), timePreferences.timeZone);
      if (direction < 0 && range.start <= earliestAvailableMs) return;
      followingNowRef.current = false;
      setTimelineAnchorMs(next);
      return;
    }
    const element = timelineScroller.current;
    if (!element || element.clientWidth === 0) return;
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
    const left = Math.floor(element.scrollLeft / 256) * 256;
    setTimelineViewport((previous) => previous.left === left && previous.width === element.clientWidth
      ? previous : { left, width: element.clientWidth });
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
    if (!element || element.clientWidth === 0) return;
    const savedPosition = timelineScrollToRestore.current;
    if (savedPosition) {
      if (!timePreferences.ready) return;
      suspendTimelineEdgePaging();
      element.scrollTo({ ...savedPosition, behavior: "instant" });
      timelineScrollToRestore.current = undefined;
      timelineRestoreRef.current = null;
      initialTimelineCenteredRef.current = true;
      return;
    }
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
  }, [compactScreen, guideView, lanes.length, range.end, range.pxPerMinute, range.start, scope, timePreferences.ready]);

  useLayoutEffect(() => {
    const top = pageScrollToRestore.current;
    if (top === undefined || !timePreferences.ready) return;
    const scroller = guideRootRef.current?.closest<HTMLElement>(".player-guide-page-scroll");
    if (!scroller) return;
    scroller.scrollTo({ top, behavior: "instant" });
    if (scroller.scrollTop >= top - 1 || !isValidating) pageScrollToRestore.current = undefined;
  }, [compactScreen, data, guideView, isValidating, lanes.length, nowNextRows.length, timePreferences.ready]);

  useEffect(() => () => {
    if (timelineScrollTimerRef.current !== null) window.clearTimeout(timelineScrollTimerRef.current);
    if (timelinePagingUnlockTimerRef.current !== null) window.clearTimeout(timelinePagingUnlockTimerRef.current);
  }, []);

  const sourceUnavailable =
    data?.sources?.twitchSchedule === "unconfigured" &&
    data?.sources?.youtubeUpcoming === "unconfigured" &&
    data?.sources?.socialTimeline !== "ok";
  const rangeStartLabel = formatGuideDay(range.start, timePreferences);
  const rangeEndLabel = formatGuideDay(range.end - 1, timePreferences);
  const visibleRangeLabel = rangeStartLabel === rangeEndLabel
    ? rangeStartLabel
    : `${rangeStartLabel} – ${rangeEndLabel}`;
  const boardStyle = {
    "--guide-track-w": `${trackWidth}px`,
    "--guide-label-w": `${LABEL_W}px`,
  } as CSSProperties;
  const gridStep = (scope === "today" ? 180 : 720) * range.pxPerMinute;
  const timelineZoomPercent = Math.round(timelineZoom * 100);

  return (
    <div ref={guideRootRef} className="guide-v2" data-guide-view={guideView}>
      <header className="guide-v2-header guide-page-header">
        <div>
          <span className="guide-page-eyebrow">CORE TV <span aria-hidden="true">/</span> Program guide</span>
          <h1 className="watch-title">Guide</h1>
          <p>Find what’s on. Stay for what’s next.</p>
        </div>
        <div className="guide-header-actions">
          <div className="guide-view-switch" role="group" aria-label="Guide layout">
            <button type="button" aria-pressed={guideView === "now"} onClick={() => setChosenView("now")}><LayoutGrid size={16} aria-hidden="true" />Now &amp; next</button>
            <button type="button" aria-pressed={guideView === "timeline"} onClick={() => { timelineRestoreRef.current = { kind: "now" }; setChosenView("timeline"); }}><CalendarDays size={16} aria-hidden="true" />Full schedule</button>
          </div>
          <button type="button" className="guide-refresh-button" aria-label="Refresh guide" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={17} className={isValidating ? "is-spinning" : ""} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="guide-overview">
        <p><span className={`guide-status-dot${livePrograms.length ? " is-live" : ""}`} aria-hidden="true" /><strong>{livePrograms.length ? `${livePrograms.length} live now` : "Always something on"}</strong><span className="guide-overview-divider" aria-hidden="true" />{networkGroups.length} networks<span className="guide-overview-zone">Times in {formatTimeZoneLabel(liveNowMs, timePreferences)}</span></p>
        <span className="guide-overview-update" role="status">{scheduleNeedsRetry ? "Refresh paused" : scheduleLoading || sourcesLoading ? "Updating programming…" : isValidating ? "Refreshing…" : "Updates automatically"}</span>
      </div>

      <div className="guide-secondary">
        <div className="guide-secondary-body">

      <div className="guide-discovery-bar">
        <label className="guide-search-wrap">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search titles, members, platforms, and formats</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={compactScreen ? "Search the guide" : "Search programs, creators, and channels"} />
        </label>
        <button type="button" className="guide-filters-toggle" aria-expanded={filtersExpanded} aria-controls="guide-filter-controls" onClick={() => setFiltersExpanded((value) => !value)}><SlidersHorizontal size={16} aria-hidden="true" />Filters{activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}</button>
      </div>
      {filtersExpanded || !compactScreen ? <section id="guide-filter-controls" className="guide-controls" aria-label="Guide filters">
        <div className="guide-select-wrap"><WatchSelect popoverClassName="guide-filter-popover" ariaLabel="Filter by type" value={status} onChange={(value) => { const next = value as StatusFilter; setStatus(next); if (next === "published" || next === "replay") setChosenView("timeline"); }} options={[
          { id: "all", label: "All types" }, { id: "live", label: "Live" }, { id: "upcoming", label: "Upcoming" }, { id: "published", label: "Posts" }, { id: "replay", label: "Broadcasts" },
        ]} /></div>
        <div className="guide-select-wrap"><WatchSelect popoverClassName="guide-filter-popover" ariaLabel="Filter by platform" value={platform} onChange={(value) => setPlatform(value as typeof platform)} options={[
          { id: "all", label: "All platforms" }, { id: "youtube", label: "YouTube" }, { id: "twitch", label: "Twitch" }, { id: "tiktok", label: "TikTok" }, { id: "instagram", label: "Instagram" }, { id: "x", label: "X" },
        ]} /></div>

        <div className="guide-select-wrap guide-untitled-select">
          <WatchSelect
            ariaLabel="Filter by member"
            value={member}
            onChange={setMember}
            popoverClassName="guide-filter-popover guide-member-popover min-w-[13.5rem]"
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

        {activeFilterCount > 0 ? <button type="button" className="guide-clear-filters" onClick={clearFilters}><X size={14} aria-hidden="true" />Clear filters</button> : null}
      </section> : null}

      {scheduleNeedsRetry || sourcesIncomplete ? <div className="guide-refresh-notice" role="status"><div><strong>{scheduleNeedsRetry ? "The guide couldn’t finish refreshing." : "A schedule connection is temporarily unavailable."}</strong><p>{data?.programs.length ? "Your available programs are ready to watch. We’ll keep trying in the background." : "We’ll try connecting again automatically."}</p></div><button type="button" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={15} aria-hidden="true" />{isValidating ? "Retrying…" : "Retry"}</button></div> : null}

      {guideView === "timeline" && filteredLive.length > 0 && (status === "all" || status === "live") ? <section className="guide-live-first" aria-labelledby="guide-live-title">
        <div className="guide-section-heading"><h2 id="guide-live-title">Live now</h2><span>{filteredLive.length} on air</span></div>
        <div ref={liveScroller} className="guide-live-rail guide-drag watch-shelf" data-lenis-prevent>
          {filteredLive.map((program) => {
            const item = liveProgramCardItem(program, channelFor(program.slug), clockMs);
            return <PosterCard key={program.id} item={item} context={[item]} onPlay={() => playProgram(program)} />;
          })}
        </div>
      </section> : null}

      {queueLoadError ? <p role="status" className="guide-inline-note">Playback is ready, but the rest of the queue could not load. <button type="button" onClick={() => void hydratePlaybackQueue(queueLoadError)} className="underline">Try again</button></p> : null}
      {guideView === "now" ? <section className="guide-now-next" aria-labelledby="guide-now-next-title">
        <div className="guide-section-heading"><div><h2 id="guide-now-next-title">On now. Up next.</h2><p className="guide-section-description">Live creators and replay channels, all in one place.</p></div><span>{nowNextRows.length} channels</span></div>
        {!nowNextRows.length && (scheduleLoading || isLoading) ? <GuideLoading /> : null}
        <div className="guide-now-next-grid">
          {nowNextRows.map(({ group, row, current, next }) => <NowNextCard key={row.id} group={group} row={row} current={current} next={next} nowMs={liveNowMs} timePreferences={timePreferences} onPlay={playProgram} />)}
        </div>
        {!nowNextRows.length && !scheduleLoading && !isLoading ? <div className="guide-schedule-empty"><LayoutGrid size={24} aria-hidden="true" /><strong>No current channels match these filters.</strong><span>Try another creator or explore past broadcasts in the full schedule.</span>{activeFilterCount > 0 ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div> : null}
      </section> : null}

      {guideView === "timeline" ? <section className="guide-schedule guide-timeline-section" aria-labelledby="guide-timeline-title">
        <div className="guide-section-heading guide-schedule-heading">
          <div>
            <h2 id="guide-timeline-title">The lineup</h2>
            <p className="guide-section-description">{compactScreen ? "Browse programs by channel and date." : "Explore every channel. Choose a program to tune in."}</p>
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
            <span>{formatTimeZoneLabel(liveNowMs, timePreferences)}</span>
          </p>
          <div>
            <button type="button" disabled={compactScreen && (scope === "upcoming" || range.start <= earliestAvailableMs)} onClick={() => scrollTimeline(-1)} aria-label="Move timeline earlier"><ChevronLeft size={16} aria-hidden="true" /><span>Earlier</span></button>
            <button type="button" onClick={returnToNow}>Back to now</button>
            <button type="button" disabled={compactScreen && (scope === "upcoming" || range.end >= Date.parse(data?.horizonEnd ?? serverNow))} onClick={() => scrollTimeline(1)} aria-label="Move timeline later"><span>Later</span><ChevronRight size={16} aria-hidden="true" /></button>
            <span className="guide-timeline-zoom" role="group" aria-label="Timeline zoom">
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
        {isValidating && data?.window && (range.start < data.window.start || range.end > data.window.end) ? <p role="status" className="guide-inline-note">Getting programs for these dates…</p> : null}

        {compactScreen ? <div className="guide-mobile-schedule">{lanes.filter(lane => lane.events.length).map(lane => {
          const laneKey = `${lane.key}:${range.start}:${range.end}`;
          return <MobileGuideLane key={laneKey} lane={lane} timePreferences={timePreferences} onPlay={playProgram} session={session} laneKey={laneKey} nowMs={liveNowMs} />;
        })}{!lanes.some(lane => lane.events.length) && !scheduleLoading ? <p className="guide-inline-note">No programs match this view.</p> : null}</div> : !isLoading && lanes.length === 0 ? (
          <div className="guide-schedule-empty">
            <strong>No dated events match this view.</strong>
            <span>{sourceUnavailable ? "Connected platform accounts will populate their posts, videos, and schedules here." : "Try the 8-day view, another member, or clear a filter."}</span>
          </div>
        ) : null}

        {!compactScreen && lanes.length > 0 ? (
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
                      {lane.events.filter((event) => event.left + event.width >= timelineViewport.left - 512
                        && event.left <= timelineViewport.left + timelineViewport.width + 512).map((event) => (
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
                      {lane.events.length === 0 ? (data?.partial && !scheduleNeedsRetry ? <span className="guide-timeline-skeleton" aria-hidden="true"><i /><i /><i /></span> : <span className="guide-timeline-lane-empty">{data?.partial ? "Schedule unavailable" : emptyLaneLabel(lane.row)}</span>) : null}
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
      </section> : null}

        </div>
      </div>
    </div>
  );
}

function NowNextCard({ group, row, current, next, nowMs, timePreferences, onPlay }: {
  group: GuideNetworkGroup;
  row: GuideNetworkRow;
  current?: GuideProgram;
  next?: GuideProgram;
  nowMs: number;
  timePreferences: TimePreferences;
  onPlay: (program: GuideProgram) => void;
}) {
  const channel = channelFor(row.timelineSlug);
  const featured = current ?? next;
  const live = current?.status === "live";
  const start = current ? Date.parse(current.startsAt) : 0;
  const end = current?.endsAt ? Date.parse(current.endsAt) : 0;
  const progress = end > start ? Math.max(0, Math.min(100, (nowMs - start) / (end - start) * 100)) : 0;
  return <article className={`guide-now-next-card${live ? " is-live" : ""}`} style={{ "--guide-channel-accent": group.network.accent } as CSSProperties}>
    <div className="guide-now-next-network"><ChannelMark channel={channel} /><div><strong>{group.network.name}</strong><span>{row.kind === "continuous" ? "24/7 replay channel" : "Live channel"}</span></div><span className="guide-channel-number">{row.kind === "continuous" ? "24/7" : "LIVE"}</span></div>
    <div className="guide-now-next-art">
      <WatchThumb src={featured?.thumbnailUrl || channel.portrait} youtubeId={featured?.youtubeId ?? undefined} alt="" fallback={<span className="guide-now-next-art-fallback">{group.network.name}</span>} />
      <span className={`guide-program-badge${live ? " is-live" : ""}`}><i aria-hidden="true" />{live ? "Live now" : current ? "On now · Replay" : "Coming up"}</span>
      {current && end > start ? <span className="guide-program-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span> : null}
    </div>
    <div className="guide-now-next-program">
      <p className="guide-program-time">{featured ? `${platformLabel(featured.platform)} · ${current ? programTimeLabel(current, timePreferences) : formatClock(featured.startsAt, timePreferences)}` : "Waiting for the next stream"}</p>
      <h3>{readableTitle(featured?.title ?? "The next broadcast is on its way")}</h3>
      {current ? <button type="button" className="guide-now-next-play" disabled={!programIsPlayable(current)} onClick={() => onPlay(current)}><Play size={16} fill="currentColor" aria-hidden="true" />{live ? "Watch live" : "Watch channel"}<span className="sr-only">: {readableTitle(current.title)}</span></button> : <p className="guide-channel-offline">This channel will be live at its next scheduled start.</p>}
    </div>
    <div className="guide-now-next-upcoming"><span>{next ? `Up next · ${formatClock(next.startsAt, timePreferences)}` : "Up next"}</span><p>{next ? readableTitle(next.title) : row.kind === "live" ? "Next stream hasn’t been announced." : "More from this channel follows."}</p><ArrowRight size={16} aria-hidden="true" /></div>
  </article>;
}

function MobileGuideLane({ lane, timePreferences, onPlay, session, laneKey, nowMs }: { lane: TimelineLane; timePreferences: TimePreferences; onPlay: (program: GuideProgram) => void; session?: PlayerGuideSession; laneKey: string; nowMs: number }) {
  const [visible, setVisible] = useState(() => session?.visiblePrograms?.get(laneKey) ?? 6);
  const [showEarlier, setShowEarlier] = useState(false);
  const currentIndex = lane.row.kind === "continuous" ? lane.events.findIndex(({ program }) => Date.parse(program.startsAt) <= nowMs && eventEnd(program, nowMs) > nowMs) : -1;
  const firstIndex = showEarlier ? 0 : Math.max(0, currentIndex);
  const events = lane.events.slice(firstIndex);
  function showMore() {
    const next = visible + 6;
    if (session) (session.visiblePrograms ??= new Map()).set(laneKey, next);
    setVisible(next);
  }
  return <section className="guide-agenda-lane" aria-label={`${lane.group.network.name} ${lane.row.label} schedule`}>
    <h3><ChannelMark channel={lane.channel} /><span>{lane.group.network.name}<small>{lane.row.label}</small></span></h3>
    {firstIndex > 0 ? <button type="button" className="guide-agenda-earlier" onClick={() => setShowEarlier(true)}>Show {firstIndex} earlier programs</button> : null}
    <div className="guide-agenda-cards">{events.slice(0, visible).map(({ program }) => {
      const airing = program.continuousPhase === "now" || program.status === "live";
      const content = <><span className="guide-agenda-art"><WatchThumb src={program.thumbnailUrl || lane.channel.portrait} youtubeId={program.youtubeId ?? undefined} alt="" fallback={<span className="guide-agenda-art-fallback">{lane.group.network.name}</span>} /></span><span>{airing ? <span className="guide-agenda-on-now">{program.status === "live" ? "Live now" : "On now"}</span> : null}<small>{formatGuideDay(Date.parse(program.startsAt), timePreferences)} · {programTimeLabel(program, timePreferences)}</small><strong>{readableTitle(program.title)}</strong><em>{programIsPlayable(program) ? 'Watch program' : 'View original'}<ArrowRight size={14} aria-hidden="true" /></em></span></>;
      const cardClass = `guide-agenda-card${airing ? " is-airing-now" : ""}`;
      return programIsPlayable(program) ? <button type="button" className={cardClass} key={program.id} onClick={() => onPlay(program)}>{content}</button> : <a className={cardClass} key={program.id} href={program.sourceUrl} target="_blank" rel="noopener noreferrer">{content}</a>;
    })}</div>
    {visible < events.length ? <button type="button" className="guide-agenda-more" onClick={showMore}>Show more programs <span>({events.length - visible})</span></button> : null}
  </section>;
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
  const className = `guide-timeline-card is-${program.status} is-${orientation} is-${contentClass}${width < 130 ? " is-compact" : ""}${program.continuous ? " is-continuous" : ""}${activeNow ? " is-airing-now" : ""}${isPast ? " is-past" : ""}`;
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
        <strong>{readableTitle(program.title)}</strong>
      </span>
    </>
  );

  if (playable) {
    return <button type="button" data-no-drag className={className} style={style} title={readableTitle(program.title)} onClick={() => onPlay(program)} aria-label={`Tune to ${program.title} on ${network} ${channelLabel}, ${programAiringLabel(program, timePreferences)}`}>{content}</button>;
  }
  return <a data-no-drag className={className} style={style} title={readableTitle(program.title)} href={program.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${program.title} from ${network} ${channelLabel}, ${programAiringLabel(program, timePreferences)}`}>{content}</a>;
}

function GuideLoading() {
  return (
    <div className="guide-loading" role="status">
      <span /><span /><span /><span className="sr-only">Loading timeline</span>
    </div>
  );
}

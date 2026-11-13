"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useWatchGuide } from "@/hooks/useWatchGuide";
import { navigateToUrl } from "@/lib/external-navigation";
import type { GuideProgram, GuideStatus as ProgramStatus, GuideContentType as ContentType } from "@/lib/watch/guide-response";
import type { GuidePayload } from "@/lib/watch/guide-response";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { itemToPlayable, type Playable } from "@/lib/watch/playable";
import { removeActiveTwitchArchiveDuplicates } from "@/lib/watch/guide-programs";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import {
  isConnectedShortChannelItem,
  mediaTypeLabel,
  type GuideNetworkGroup,
  type GuideNetworkRow,
} from "@/lib/watch/channels";
import { buildContinuousGuideSchedule } from "@/lib/watch/continuous-schedule";
import { liveTimelineEndMs } from "@/lib/watch/live-schedule";
import { buildEpgCells } from "@/lib/watch/guide-epg";
import { WatchThumb } from "./WatchThumb";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { GuideEpg, type EpgDay, type EpgLane } from "@/components/watch/GuideEpg";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { twitchLiveChatLogin } from "@/lib/watch/player-companion";
import { unpackWatchItemLists, type WatchItemPayload } from "@/lib/watch/item-payload";
import { readableTitle } from "@/lib/watch/presentation";
import { ArrowRight, Layers, LayoutGrid, Play, RefreshCw, Rows3, Search, SlidersHorizontal, X } from "lucide-react";

const HYDRATION_TIME_PREFERENCES = {
  locale: "en-US",
  timeZone: "UTC",
} as const;
/** Programmes shorter than this are grouped into one readable grid cell. */
const EPG_MIN_CELL_MS = 20 * 60_000;
/** Days the grid offers either side of today. */
const EPG_DAYS_BACK = 6;
const EPG_DAYS_AHEAD = 6;
/** A failed background refresh only matters once the shown guide is this old. */
const GUIDE_STALE_AFTER_MS = 3 * 60_000;

type StatusFilter = "all" | ProgramStatus;

export type PlayerGuideSession = {
  filters?: {
    status: StatusFilter;
    platform: "all" | WatchPlatform;
    member: string;
    query: string;
    anchorMs: number;
    showUploads: boolean;
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

function formatTimeZoneLabel(value: number, preferences: TimePreferences): string {
  if (!preferences.ready) return "your local time";
  return new Intl.DateTimeFormat(preferences.locale, {
    timeZone: preferences.timeZone,
    timeZoneName: "short",
  }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value ?? preferences.timeZone;
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
  const [timelineAnchorMs, setTimelineAnchorMs] = useState(() =>
    saved?.anchorMs ?? startOfZonedDay(initialNowMs, 0, HYDRATION_TIME_PREFERENCES.timeZone));
  const [showUploads, setShowUploads] = useState(saved?.showUploads ?? false);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [compactScreen, setCompactScreen] = useState(() => !session || typeof window === "undefined" || window.matchMedia("(max-width: 767px)").matches);
  const [chosenView, setChosenView] = useState<"now" | "timeline" | null>(saved?.view ?? null);
  const [filtersExpanded, setFiltersExpanded] = useState(saved?.expanded ?? false);
  const [queueLoadError, setQueueLoadError] = useState<GuideNetworkRow | null>(null);
  const guideRootRef = useRef<HTMLDivElement>(null);
  const pageScrollToRestore = useRef(session?.pageScrollTop);
  // The TV-guide grid is the Guide. Now & next is the at-a-glance alternative.
  const guideView = chosenView ?? "timeline";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompactScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const appliedBrowserTimeZoneRef = useRef<string | null>(saved?.timeZone ?? null);
  const observedDayStartRef = useRef<number | null>(null);
  const followingNowRef = useRef(!session?.timelineScroll);
  const player = usePlayer();
  const { data: liveData } = useLiveStatus();
  const [requestedWindow, setRequestedWindow] = useState(saved?.window ?? initialGuide?.window);
  const { data, error, isLoading, isValidating, mutate } = useWatchGuide({ window: requestedWindow, initialData: initialGuide });
  const networkGroups = data?.networks?.length ? data.networks : networks;
  const scheduleLoading = Boolean(data?.partial && data.sources?.catalog !== "error" && !error);
  // SWR keeps the last good guide on screen through a failed poll and retries
  // it. Tell viewers only when what they see is genuinely out of date: there
  // is no guide yet, the one shown is a partial first paint, or it has not
  // refreshed for several polling intervals.
  const guideAgeMs = data ? clockMs - safeTime(data.serverNow, clockMs) : Infinity;
  const scheduleNeedsRetry = Boolean(error) && (!data || Boolean(data.partial) || guideAgeMs > GUIDE_STALE_AFTER_MS);
  const sourcesIncomplete = Object.values(data?.sources ?? {}).includes("error");
  const sourcesLoading = Object.values(data?.sources ?? {}).includes("loading");
  const activeFilterCount = Number(status !== "all") + Number(platform !== "all") + Number(member !== "all") + Number(Boolean(query.trim()));
  function clearFilters() {
    setStatus("all"); setPlatform("all"); setMember("all"); setQuery("");
  }

  useLayoutEffect(() => {
    if (!session) return;
    session.filters = {
      status, platform, member, query, anchorMs: timelineAnchorMs,
      showUploads, view: chosenView, expanded: filtersExpanded,
      timeZone: appliedBrowserTimeZoneRef.current, window: requestedWindow,
    };
  }, [session, status, platform, member, query, timelineAnchorMs, showUploads, chosenView, filtersExpanded, requestedWindow, timePreferences.timeZone]);

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
    // The grid's Now line and progress bars move smoothly at this cadence.
    const interval = window.setInterval(syncLiveClock, 5_000);
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
    setTimelineAnchorMs(todayStart);
  }, [clockMs, timePreferences.ready, timePreferences.timeZone]);

  useEffect(() => {
    if (!timePreferences.ready) return;
    const todayStart = startOfZonedDay(clockMs, 0, timePreferences.timeZone);
    const previousStart = observedDayStartRef.current;
    observedDayStartRef.current = todayStart;
    // Past midnight, a viewer who was watching "today" follows the new day.
    if (previousStart === null || previousStart === todayStart || !followingNowRef.current) return;
    setTimelineAnchorMs(todayStart);
  }, [clockMs, timePreferences.ready, timePreferences.timeZone]);

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

  // The grid shows one local calendar day; the day chips move between them.
  const range = useMemo(() => ({
    start: startOfZonedDay(timelineAnchorMs, 0, timePreferences.timeZone),
    end: startOfZonedDay(timelineAnchorMs, 1, timePreferences.timeZone),
  }), [timelineAnchorMs, timePreferences.timeZone]);
  useEffect(() => {
    if (!initialGuide?.window) return;
    // Keep the current payload through clock changes. Only a genuinely
    // different date range needs another server-computed schedule.
    // Now & next always follows the current clock, including after browsing
    // history. An old timeline window cannot supply the current airings.
    const start = guideView === "now" ? floorHalfHour(clockMs) : range.start;
    const end = guideView === "now" ? Math.ceil((clockMs + 6 * 3_600_000) / 3_600_000) * 3_600_000 : range.end;
    setRequestedWindow((previous) => previous && start >= previous.start && end <= previous.end
      ? previous : { start, end, earliest: previous?.earliest ?? start });
  }, [clockMs, guideView, initialGuide?.window, range.start, range.end]);

  const days = useMemo<EpgDay[]>(() => {
    const today = startOfZonedDay(clockMs, 0, timePreferences.timeZone);
    const firstArchiveDay = startOfZonedDay(Math.max(earliestAvailableMs, today - EPG_DAYS_BACK * 86_400_000), 0, timePreferences.timeZone);
    const output: EpgDay[] = [];
    for (let offset = -EPG_DAYS_BACK; offset <= EPG_DAYS_AHEAD; offset += 1) {
      const start = startOfZonedDay(today, offset, timePreferences.timeZone);
      if (start < firstArchiveDay && start !== timelineAnchorMs) continue;
      const date = timePreferences.ready ? new Date(start + 12 * 3_600_000) : null;
      const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset === -1 ? "Yesterday"
        : date ? date.toLocaleDateString(timePreferences.locale, { timeZone: timePreferences.timeZone, weekday: "short" }) : "—";
      const sublabel = date ? date.toLocaleDateString(timePreferences.locale, { timeZone: timePreferences.timeZone, month: "short", day: "numeric" }) : "";
      output.push({ start, label, sublabel });
    }
    return output;
  }, [clockMs, earliestAvailableMs, timelineAnchorMs, timePreferences]);

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
  const epgLanes = useMemo<EpgLane[]>(() => {
    if (guideView !== "timeline") return [];
    const filtering = platform !== "all" || status !== "all" || Boolean(needle);
    // A TV guide lists channels: each network's live channel and its 24/7
    // channel. Upload archives (videos, Shorts) join on request or when the
    // viewer is looking for posts.
    const includeUploads = showUploads || status === "published";
    return networkGroups
      .filter((group) => member === "all" || group.rows.some((row) => row.timelineSlug === member))
      .flatMap((group) => group.rows.flatMap((row): EpgLane[] => {
        if (!includeUploads && (row.kind === "videos" || row.kind === "shorts")) return [];
        const sourcePrograms = row.kind === "continuous"
          ? rowContinuousPrograms(group, row, range.start, range.end)
          : programs
            .filter((program) => programBelongsToRow(program, row))
            .map((program) => ({ ...program, guideRowId: row.id, channelMode: row.kind }));
        const cells = buildEpgCells(sourcePrograms.filter((program) => matchesControls(program, group, row)), {
          rangeStart: range.start,
          rangeEnd: range.end,
          minCellMs: EPG_MIN_CELL_MS,
          endOf: (program) => eventEnd(program, clockMs),
        });
        if (filtering && !cells.length) return [];
        const channel = channelFor(row.timelineSlug);
        return [{
          key: row.id,
          network: group.network.name,
          label: row.label,
          kind: row.kind,
          logo: channel.logo,
          accent: group.network.accent,
          portrait: channel.portrait,
          cells,
          emptyLabel: row.kind === "live" ? "Off air" : emptyLaneLabel(row),
        }];
      }));
    // matchesControls is intentionally represented by its primitive inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockMs, guideView, member, needle, networkGroups, platform, programs, range, showUploads, status]);

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

  function selectDay(dayStart: number) {
    followingNowRef.current = dayStart === startOfZonedDay(liveNowMs, 0, timePreferences.timeZone);
    setTimelineAnchorMs(dayStart);
  }

  useLayoutEffect(() => {
    const top = pageScrollToRestore.current;
    if (top === undefined || !timePreferences.ready) return;
    const scroller = guideRootRef.current?.closest<HTMLElement>(".player-guide-page-scroll");
    if (!scroller) return;
    scroller.scrollTo({ top, behavior: "instant" });
    if (scroller.scrollTop >= top - 1 || !isValidating) pageScrollToRestore.current = undefined;
  }, [compactScreen, data, guideView, isValidating, epgLanes.length, nowNextRows.length, timePreferences.ready]);

  const sourceUnavailable =
    data?.sources?.twitchSchedule === "unconfigured" &&
    data?.sources?.youtubeUpcoming === "unconfigured" &&
    data?.sources?.socialTimeline !== "ok";
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
            <button type="button" aria-pressed={guideView === "timeline"} onClick={() => setChosenView("timeline")}><Rows3 size={16} aria-hidden="true" />TV guide</button>
            <button type="button" aria-pressed={guideView === "now"} onClick={() => setChosenView("now")}><LayoutGrid size={16} aria-hidden="true" />Now &amp; next</button>
          </div>
          <button type="button" className="guide-refresh-button" aria-label="Refresh guide" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={17} className={isValidating ? "is-spinning" : ""} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="guide-overview">
        <p><span className={`guide-status-dot${livePrograms.length ? " is-live" : ""}`} aria-hidden="true" /><strong>{livePrograms.length ? `${livePrograms.length} live now` : "Always something on"}</strong><span className="guide-overview-divider" aria-hidden="true" />{networkGroups.length} networks<span className="guide-overview-zone">Times in {formatTimeZoneLabel(liveNowMs, timePreferences)}</span></p>
        <span className="guide-overview-update" role="status">{scheduleNeedsRetry ? "Refresh paused" : scheduleLoading || sourcesLoading ? "Updating programming…" : isValidating ? "Refreshing…" : sourcesIncomplete ? "Some schedules unavailable" : "Updates automatically"}</span>
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

      {scheduleNeedsRetry ? <div className="guide-refresh-notice" role="status"><div><strong>The guide couldn’t finish refreshing.</strong><p>{data?.programs.length ? "Your available programs are ready to watch. We’ll keep trying in the background." : "We’ll try connecting again automatically."}</p></div><button type="button" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={15} aria-hidden="true" />{isValidating ? "Retrying…" : "Retry"}</button></div> : null}

      {queueLoadError ? <p role="status" className="guide-inline-note">Playback is ready, but the rest of the queue could not load. <button type="button" onClick={() => void hydratePlaybackQueue(queueLoadError)} className="underline">Try again</button></p> : null}
      {guideView === "now" ? <section className="guide-now-next" aria-labelledby="guide-now-next-title">
        <div className="guide-section-heading"><div><h2 id="guide-now-next-title">On now. Up next.</h2><p className="guide-section-description">Live creators and replay channels, all in one place.</p></div><span>{nowNextRows.length} channels</span></div>
        {!nowNextRows.length && (scheduleLoading || isLoading) ? <GuideLoading /> : null}
        <div className="guide-now-next-grid">
          {nowNextRows.map(({ group, row, current, next }) => <NowNextCard key={row.id} group={group} row={row} current={current} next={next} nowMs={liveNowMs} timePreferences={timePreferences} onPlay={playProgram} />)}
        </div>
        {!nowNextRows.length && !scheduleLoading && !isLoading ? <div className="guide-schedule-empty"><LayoutGrid size={24} aria-hidden="true" /><strong>No current channels match these filters.</strong><span>Try another creator or explore past broadcasts in the full schedule.</span>{activeFilterCount > 0 ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div> : null}
      </section> : null}

      {guideView === "timeline" ? (
        <>
          {isLoading && !data ? <GuideLoading /> : null}
          {isValidating && data?.window && (range.start < data.window.start || range.end > data.window.end) ? <p role="status" className="guide-inline-note">Getting programs for this day…</p> : null}
          <GuideEpg
            lanes={epgLanes}
            rangeStart={range.start}
            rangeEnd={range.end}
            nowMs={liveNowMs}
            days={days}
            selectedDay={timelineAnchorMs}
            onSelectDay={selectDay}
            formatTime={(ms) => formatClock(ms, timePreferences)}
            zoneLabel={formatTimeZoneLabel(liveNowMs, timePreferences)}
            isPlayable={programIsPlayable}
            onPlay={playProgram}
            describe={(program) => ({ kind: contentLabel(program), platform: platformLabel(program.platform) })}
            loading={scheduleLoading || (isLoading && !data)}
            initialScroll={session?.timelineScroll}
            toolbarExtra={<button type="button" className="guide-epg-uploads" aria-pressed={showUploads || status === "published"} disabled={status === "published"} onClick={() => setShowUploads((value) => !value)}><Layers size={15} aria-hidden="true" />Uploads</button>}
          />
          {!epgLanes.length && !scheduleLoading && !isLoading ? (
            <div className="guide-schedule-empty">
              <strong>No channels match these filters.</strong>
              <span>{sourceUnavailable ? "Connected platform accounts will populate their posts, videos, and schedules here." : "Try another day, another member, or clear a filter."}</span>
              {activeFilterCount > 0 ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}
            </div>
          ) : null}
        </>
      ) : null}
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

function ChannelMark({ channel }: { channel: GuideChannel }) {
  return (
    <span className="guide-v2-mark" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={channel.logo} alt="" />
    </span>
  );
}

function GuideLoading() {
  return (
    <div className="guide-loading" role="status">
      <span /><span /><span /><span className="sr-only">Loading timeline</span>
    </div>
  );
}

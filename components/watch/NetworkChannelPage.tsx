"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, Clapperboard, Clock3, ExternalLink, Mail, Play, Radio, RotateCcw, Volume2, VolumeX, Zap } from "lucide-react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import {
  hasNetworkTuningAudio,
  markNetworkRouteReady,
  skipNetworkTuningAudio,
  waitForNetworkTuningAudio,
} from "@/components/watch/CinematicRouteTransition";
import { GuideHistory } from "@/components/watch/GuideHistory";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { acknowledgeContentAdvisory, hasAcknowledgedContentAdvisory } from "@/lib/watch/content-advisory";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { XTweetsRail } from "./XTweetsRail";
import { GROUP } from "@/lib/group";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { ageFromIso } from "@/lib/utils";
import { WatchThumb } from "./WatchThumb";
import { FanMailPostcard } from "@/components/sections/FanMailPostcard";
import { DragScrollRail } from "./DragScrollRail";
import { CreatorPlatformRails } from "./CreatorPlatformRails";
import { AutoScrollGallery } from "@/components/ui/AutoScrollGallery";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import type { WatchHomeXPost } from "@/lib/watch/x-posts";
import type { TwitchTrackerChannelSnapshot } from "@/lib/twitchtracker-snapshots";
import type { AirtimeDailyRecord, AirtimeHistorySession } from "@/lib/watch/airtime-history";
import { embedFor, itemToPlayable } from "@/lib/watch/playable";
import type {
  CuratedChannelSourceDescriptor,
  CuratedChannelSourceDiagnostic,
} from "@/lib/watch/creator-platform-rails";
import { normalizeCreatorSocialHandle } from "@/lib/watch/social-account-ref";
import { configuredInstagramEmbedUrls } from "@/lib/watch/public-social-embeds";
import {
  channelProgramElapsedSeconds,
  networkChannelSchedule,
  type ChannelScheduleEntry,
} from "@/lib/watch/channel-schedule";
import {
  buildContinuousGuideSchedule,
  CONTINUOUS_GUIDE_FUTURE_HORIZON_MS,
  type CompletedLiveInterruption,
} from "@/lib/watch/continuous-schedule";
import {
  createNetworkLiveTakeoverDetail,
  dispatchNetworkLiveTakeover,
  isLiveMedia,
  shouldAnnounceNetworkLiveTakeover,
} from "@/lib/watch/live-takeover";
import { syncLiveMemory } from "@/lib/watch/live-memory";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import {
  NETWORK_CHANNELS,
  mediaTypeLabel,
  type NetworkChannel,
  type NetworkChannelHub,
  type NetworkChannelMode,
  type GuideNetworkGroup,
  type GuideNetworkRow,
} from "@/lib/watch/channels";
import styles from "./NetworkChannelPage.module.css";

export type ChannelCrewMember = {
  slug: string;
  name: string;
  roleLabel: string;
  portrait: string | null;
};

// The page needs one full prior cycle available to locate the real program
// containing "now". The Guide itself remains the schedule authority; this
// only bounds the client-side projection used by the hero and compact rail.
const CHANNEL_CONTINUOUS_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const CHANNEL_SCHEDULE_REFRESH_MS = 30 * 1_000;
// The Guide builds an 18-hour deterministic projection, while the compact
// channel-page rail exposes a useful, bounded part of it.  This keeps a
// shorts-heavy network from rendering hundreds of tiny cards yet still gives
// viewers a real future queue instead of only "Now" and one next title.
const CHANNEL_CONTINUOUS_QUEUE_HORIZON_MS = 8 * 60 * 60 * 1_000;
const CHANNEL_CONTINUOUS_QUEUE_MIN_BLOCKS = 18;
const CHANNEL_CONTINUOUS_QUEUE_MAX_BLOCKS = 60;

const CHANNEL_TV_PACKAGES: Record<string, { signal: string; transmission: string; treatment: string }> = {
  core: { signal: "CORE NETWORK", transmission: "All-house transmission", treatment: "node signal" },
  adapt: { signal: "FLOCK FREQUENCY", transmission: "Flock field transmission", treatment: "warm signal" },
  ron: { signal: "STABLE SIGNAL", transmission: "Stable live desk", treatment: "crt signal" },
  lacy: { signal: "THUGS NETWORK", transmission: "Thugs programming", treatment: "stencil signal" },
  marlon: { signal: "M3 LIVE DESK", transmission: "M3 live desk", treatment: "flash signal" },
  jason: { signal: "NMS CHANNEL", transmission: "NMS neon signal", treatment: "neon signal" },
  silky: { signal: "SLG PRIME", transmission: "SLG prime time", treatment: "gold signal" },
};

/**
 * The channel landing warning is also DJ Cora's first visual beat.  Keep the
 * copy explicit and the framing stable per network. The station ID uses the
 * community artwork, while the age gate uses the dedicated neutral CoreTV
 * advisory signal so it remains consistent with Theater.
 */
const NETWORK_ADVISORY_VISUALS: Record<NetworkChannel["slug"], {
  station: string;
  tuningLine: string;
  artworkAlt: string;
  focalPoint: string;
}> = {
  core: {
    station: "CORE Network",
    tuningLine: "DJ Cora is opening the all-house signal.",
    artworkAlt: "CORE Network house artwork",
    focalPoint: "50% 50%",
  },
  adapt: {
    station: "Flock",
    tuningLine: "DJ Cora is tuning the Flock frequency.",
    artworkAlt: "Flock community artwork for Adapt's network",
    focalPoint: "50% 50%",
  },
  ron: {
    station: "Stable",
    tuningLine: "DJ Cora is bringing the Stable signal online.",
    artworkAlt: "Stable community artwork for StableRonaldo's network",
    focalPoint: "50% 50%",
  },
  lacy: {
    station: "Thugs",
    tuningLine: "DJ Cora is patching in the Thugs transmission.",
    artworkAlt: "Thugs community artwork for Lacy's network",
    focalPoint: "50% 50%",
  },
  marlon: {
    station: "M3",
    tuningLine: "DJ Cora is opening the M3 live desk.",
    artworkAlt: "M3 community artwork for Marlon's network",
    focalPoint: "50% 50%",
  },
  jason: {
    station: "NMS",
    tuningLine: "DJ Cora is lighting the NMS channel.",
    artworkAlt: "NMS community artwork for JasonTheWeen's network",
    focalPoint: "50% 50%",
  },
  silky: {
    station: "SLG",
    tuningLine: "DJ Cora is catching the SLG city line.",
    artworkAlt: "SLG community artwork for Silky's network",
    focalPoint: "50% 50%",
  },
};

function channelTvPackage(slug: string) {
  return CHANNEL_TV_PACKAGES[slug] ?? CHANNEL_TV_PACKAGES.core ?? {
    signal: "CORE NETWORK",
    transmission: "All-house transmission",
    treatment: "node signal",
  };
}

/**
 * Birthday treatment follows the viewer's local calendar instead of the
 * catalog/server clock, so it appears for the whole local birthday without
 * creating a server-time-zone edge case around midnight.
 */
function isBirthdayToday(birthDate: string | undefined, nowMs: number): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? "");
  if (!match) return false;

  const today = new Date(nowMs);
  return today.getMonth() + 1 === Number(match[2]) && today.getDate() === Number(match[3]);
}

/**
 * Keep the guide readable for broadcasts that can run for several hours.
 * It is a compressed TV guide scale, not a literal pixel-per-minute ruler:
 * short posts stay selectable, regular shows grow naturally, and very long
 * VODs cap before one item turns the whole rail into a marathon scroll.
 */
function guideScaleUnits(durationMinutes: number) {
  return Math.min(36, Math.max(16, 12 + Math.log2(Math.max(1, durationMinutes)) * 4.5));
}

const PLATFORM_LABEL: Partial<Record<WatchPlatform, string>> = {
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  house: "CORE",
};

type ChannelSocialPlatform =
  | Exclude<WatchPlatform, "house">
  | "snapchat"
  | "wikipedia";

const CHANNEL_SOCIAL_LABEL: Record<ChannelSocialPlatform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  snapchat: "Snapchat",
  wikipedia: "Wikipedia",
};

const CHANNEL_SOCIAL_PLATFORMS = new Set<ChannelSocialPlatform>([
  "youtube",
  "twitch",
  "tiktok",
  "instagram",
  "x",
  "snapchat",
  "wikipedia",
]);

type ChannelSocialLink = {
  platform: ChannelSocialPlatform;
  url: string;
  handle?: string;
  label?: string;
  /**
   * The public avatar returned by this exact platform.  This deliberately
   * stays undefined when a provider cannot be resolved: showing the member
   * portrait in every unresolved tile makes it look as though each account
   * has the same profile picture.
   */
  avatarUrl?: string;
};

function channelSocialLinks(
  channel: NetworkChannel,
  socialAvatarByUrl: Readonly<Record<string, string>>,
): ChannelSocialLink[] {
  const member = channel.memberSlug ? MEMBERS_BY_SLUG[channel.memberSlug] : null;
  if (member) {
    return member.socials
      .filter((social) => CHANNEL_SOCIAL_PLATFORMS.has(social.platform as ChannelSocialPlatform))
      .map((social) => ({
        platform: social.platform as ChannelSocialPlatform,
        url: social.url,
        handle: social.handle,
        label: social.label,
        avatarUrl: socialAvatarByUrl[social.url],
      }));
  }
  return Object.entries(GROUP.socials)
    .filter(([platform]) => CHANNEL_SOCIAL_PLATFORMS.has(platform as ChannelSocialPlatform))
    .map(([platform, social]) => ({
      platform: platform as ChannelSocialPlatform,
      url: social.url,
      handle: social.handle,
      avatarUrl: socialAvatarByUrl[social.url],
    }));
}

/**
 * An account card must never substitute the creator's editorial portrait for
 * a missing provider image.  It either shows the avatar fetched for that
 * exact account or a recognizable, platform-coloured official-profile mark.
 * The error boundary is local to the image so an expired CDN URL also falls
 * back cleanly without leaving a broken image glyph in the tile.
 */
function ChannelSocialAvatar({ social }: { social: ChannelSocialLink }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [social.avatarUrl]);
  const imageSrc = imageFailed ? undefined : social.avatarUrl;

  return (
    <span
      className={styles.connectedAccountAvatar}
      data-platform={social.platform}
      data-has-image={imageSrc ? "true" : "false"}
      aria-hidden="true"
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={styles.connectedAccountFallback}>
          <SocialIcon platform={social.platform} size={18} />
        </span>
      )}
      <span className={styles.connectedAccountPlatformMark}>
        <SocialIcon platform={social.platform} size={11} />
      </span>
    </span>
  );
}

function curatedSourceLabel(channel: NetworkChannel, social: ChannelSocialLink): string {
  const owner = channel.memberSlug ? channel.host : GROUP.name;
  if (social.platform === "twitch") return `@${owner.replace(/\s+/g, "")}`;
  if (social.platform === "youtube") {
    return social.label?.trim() ? `${owner} · ${social.label.trim()}` : owner;
  }
  return social.handle?.trim() ? `${owner} · ${social.handle.trim()}` : owner;
}

function formatMemberBirthday(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function curatedSources(
  channel: NetworkChannel,
  socialLinks: readonly ChannelSocialLink[],
  diagnostics: readonly CuratedChannelSourceDiagnostic[],
  scopedItems: readonly WatchItem[],
): CuratedChannelSourceDescriptor[] {
  const configuredInstagramUrls = configuredInstagramEmbedUrls(scopedItems);
  return socialLinks.map((social) => {
    const ingestProvider = social.platform === "tiktok" || social.platform === "instagram"
      ? social.platform
      : null;
    const normalizedHandle = ingestProvider
      ? normalizeCreatorSocialHandle(ingestProvider, social.handle ?? social.url)
      : "";
    const diagnostic = ingestProvider
      ? diagnostics.find((entry) =>
          entry.platform === ingestProvider && entry.handle === normalizedHandle)
      : null;
    return {
      platform: social.platform,
      label: curatedSourceLabel(channel, social),
      handle: social.handle,
      href: social.url,
      publicEmbedUrls: social.platform === "instagram" ? configuredInstagramUrls : undefined,
      ingestState: diagnostic?.state,
    };
  });
}

type ChannelTwitchInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  destroy?: () => void;
  isPaused?: () => boolean;
  play?: () => void;
  setMuted?: (muted: boolean) => void;
};

type ChannelTwitchApi = {
  Player: {
    new (id: string, options: Record<string, unknown>): ChannelTwitchInstance;
    PAUSE: string;
    READY: string;
    PLAYING: string;
    OFFLINE: string;
    PLAYBACK_BLOCKED: string;
    ENDED?: string;
  };
};

let channelTwitchScript: Promise<ChannelTwitchApi> | null = null;

function loadChannelTwitch(): Promise<ChannelTwitchApi> {
  if (channelTwitchScript) return channelTwitchScript;
  const pending = new Promise<ChannelTwitchApi>((resolve, reject) => {
    const fromWindow = () => (window as typeof window & { Twitch?: ChannelTwitchApi }).Twitch;
    const known = fromWindow();
    if (known?.Player) {
      resolve(known);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://player.twitch.tv/js/embed/v1.js"]');
    const script = existing ?? document.createElement("script");
    let settled = false;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;
    const cleanup = () => {
      script.removeEventListener("load", done);
      script.removeEventListener("error", fail);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
    };
    const done = () => {
      if (settled) return;
      const api = fromWindow();
      if (!api?.Player) return;
      settled = true;
      cleanup();
      resolve(api);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("twitch_player_unavailable"));
    };
    script.addEventListener("load", done);
    script.addEventListener("error", fail);
    pollTimer = window.setInterval(done, 50);
    timeoutTimer = window.setTimeout(fail, 10_000);
    if (!existing) {
      script.src = "https://player.twitch.tv/js/embed/v1.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  channelTwitchScript = pending;
  void pending.catch(() => {
    if (channelTwitchScript === pending) channelTwitchScript = null;
  });
  return pending;
}

function timeLabel(value: number, locale: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function dateLabel(value: string | undefined, locale: string, timeZone: string): string {
  if (!value) return "Archive";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Archive";
  const year = new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(parsed);
  const currentYear = new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(Date.now());
  return new Date(parsed).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: year === currentYear ? undefined : "numeric",
    timeZone,
  });
}

function zoneLabel(locale: string, timeZone: string, value: number): string {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
    .formatToParts(value)
    .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

function supportedModes(channel: NetworkChannel): NetworkChannelMode[] {
  return channel.memberSlug === null
    ? ["videos", "shorts", "continuous"]
    : ["live", "videos", "shorts", "continuous"];
}

function channelHref(channel: NetworkChannel, mode: NetworkChannelMode = "continuous") {
  const supported = mode !== "live" || channel.memberSlug !== null ? mode : "continuous";
  return supported === "continuous"
    ? `/channels/${channel.slug}`
    : `/channels/${channel.slug}?mode=${supported}`;
}

function modeLabel(mode: NetworkChannelMode) {
  if (mode === "continuous") return "24/7";
  return `${mode.slice(0, 1).toUpperCase()}${mode.slice(1)}`;
}

function modeTitle(channel: NetworkChannel, mode: NetworkChannelMode) {
  return `${channel.name} ${modeLabel(mode)}`;
}

function modeDescription(channel: NetworkChannel, mode: NetworkChannelMode) {
  if (mode === "live") return `${channel.host}'s live rooms and past Twitch broadcasts in their original order.`;
  if (mode === "videos") {
    return channel.memberSlug === null
      ? "Shows from the official CORE YouTube channel."
      : `Videos from ${channel.host}'s connected YouTube channels.`;
  }
  if (mode === "shorts") {
    return channel.memberSlug === null
      ? "A shuffled mix of YouTube Shorts, Instagram Reels, and TikToks from CORE and every member."
      : `Shorts, TikToks, and Instagram Reels from ${channel.host}.`;
  }
  return channel.memberSlug === null
    ? "A shuffled, always-on mix of CORE shows and videos from every creator."
    : `A shuffled, always-on mix of ${channel.host}'s videos, Twitch broadcasts, and short-form posts.`;
}

function ModeIcon({ mode }: { mode: NetworkChannelMode }) {
  if (mode === "live") return <Radio size={14} aria-hidden />;
  if (mode === "videos") return <Clapperboard size={14} aria-hidden />;
  if (mode === "shorts") return <Zap size={14} aria-hidden />;
  return <RotateCcw size={14} aria-hidden />;
}

function PlatformMark({ platform }: { platform: WatchPlatform }) {
  if (platform === "house") return <span className={styles.coreMark}>CORE</span>;
  return (
    <span className={styles.platformIcon} title={PLATFORM_LABEL[platform]}>
      <SocialIcon platform={platform} size={13} />
    </span>
  );
}

function NetworkAdvisoryArtwork({
  channel,
  showNetworkArt,
}: {
  channel: NetworkChannel;
  /** Network art is reserved for the Cora station ID; the age gate has its own neutral advisory visual. */
  showNetworkArt: boolean;
}) {
  const visual = NETWORK_ADVISORY_VISUALS[channel.slug];
  const artworkSrc = showNetworkArt ? channel.backdrop : "/watch/advisory/coretv-mature-audience-station-v2.png";
  const artworkAlt = showNetworkArt ? visual.artworkAlt : "CoreTV mature audience advisory artwork";

  return (
    <div className={styles.heroPreviewAdvisoryArtwork} data-network={showNetworkArt ? channel.slug : "advisory"} aria-label={artworkAlt} role="img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artworkSrc} alt={artworkAlt} style={showNetworkArt ? { objectPosition: visual.focalPoint } : undefined} />
      {showNetworkArt ? <span className={styles.heroPreviewAdvisoryArtworkVeil} aria-hidden="true" /> : null}
      {showNetworkArt ? (
        <div className={styles.heroPreviewAdvisoryStation} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={channel.artwork} alt="" />
          <span>{visual.station}</span>
          <small>DJ Cora is tuning in</small>
        </div>
      ) : null}
    </div>
  );
}

function ChannelOnNowPreview({
  channel,
  entry,
  initialStartSeconds,
  progress,
  autoStart,
  onActivate,
  onProgramBoundary,
}: {
  channel: NetworkChannel;
  entry: ChannelScheduleEntry;
  initialStartSeconds: number;
  progress: number;
  autoStart: boolean;
  onActivate: () => void;
  /** Lets the linear channel advance on an actual media end without a timer gap. */
  onProgramBoundary?: () => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const twitchMountRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const twitchPlayerRef = useRef<ChannelTwitchInstance | null>(null);
  const advisoryAudioRef = useRef<HTMLAudioElement | null>(null);
  const reactId = useId();
  const twitchMountId = `channel-hero-twitch-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const nativeAutoplayAttemptedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const retryBlockedTimerRef = useRef<number | null>(null);
  // Muted playback is the only cross-browser autoplay-safe starting state.
  // Viewers can restore sound with the owned control after the stream starts.
  const mutedRef = useRef(true);
  const explicitMuteChoiceRef = useRef(false);
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  const playable = useMemo(() => itemToPlayable(entry.item), [entry.item]);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [mostlyVisible, setMostlyVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [providerFits, setProviderFits] = useState(false);
  const [mediaMounted, setMediaMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [frameReadyToken, setFrameReadyToken] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [advisoryReady, setAdvisoryReady] = useState(!autoStart);
  const [waitingForTuningAudio, setWaitingForTuningAudio] = useState(false);
  // This component is keyed to the program window, so the embed starts at the
  // live clock once and then plays naturally instead of reloading every tick.
  const [previewStartSeconds] = useState(initialStartSeconds);

  const setHeroMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
  }, []);

  const postFrameMuted = useCallback((next: boolean, requestPlay = false) => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    if (playable?.youtubeId) {
      target.postMessage(JSON.stringify({ event: "listening", id: `core-channel-${entry.key}` }), "*");
      target.postMessage(JSON.stringify({ event: "command", func: next ? "mute" : "unMute", args: [] }), "*");
      if (requestPlay) target.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      return;
    }
    if (entry.item.platform === "tiktok") {
      target.postMessage({ "x-tiktok-player": true, type: next ? "mute" : "unmute" }, "*");
      if (requestPlay) target.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
    }
  }, [entry.item.platform, entry.key, playable?.youtubeId]);

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const updateFit = () => {
      const { width, height } = slot.getBoundingClientRect();
      const needsTwitchMinimum = entry.item.platform === "twitch";
      setProviderFits(needsTwitchMinimum ? width >= 400 && height >= 300 : width >= 240 && height >= 135);
    };
    updateFit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFit);
      return () => window.removeEventListener("resize", updateFit);
    }
    const observer = new ResizeObserver(updateFit);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [entry.item.platform]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof IntersectionObserver === "undefined") {
      setMostlyVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([result]) => setMostlyVisible(Boolean(result?.isIntersecting && result.intersectionRatio >= 0.45)),
      { threshold: [0, 0.45, 1] },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const startAdvisory = useCallback(() => {
    const audio = advisoryAudioRef.current;
    if (!audio) return;
    void audio.play().catch(() => {
      // Audible autoplay is routinely rejected even though muted video is
      // allowed. The advisory must never strand a 24/7 channel on a poster;
      // keep the visual notice briefly, then continue into muted playback.
      window.setTimeout(() => setAdvisoryReady(true), 1_400);
    });
  }, []);

  // The 24/7 channel hero is a real player surface, not merely a poster.
  // Keep its provider unmounted until the spoken advisory has finished so a
  // stream can never begin underneath the warning.
  useEffect(() => {
    if (!autoStart) {
      setAdvisoryReady(true);
      setWaitingForTuningAudio(false);
      return;
    }
    // Tuning is an entry transition, not part of the once-per-session
    // advisory. Even when the advisory has already been acknowledged, keep
    // the hero provider unmounted until DJ Cora's station ID is finished.
    const needsAdvisory = !hasAcknowledgedContentAdvisory();
    if (needsAdvisory) acknowledgeContentAdvisory();
    setAdvisoryReady(false);
    setWaitingForTuningAudio(hasNetworkTuningAudio());
    let disposed = false;
    let audio: HTMLAudioElement | null = null;
    const beginAfterTuning = async () => {
      await waitForNetworkTuningAudio();
      if (disposed) return;
      setWaitingForTuningAudio(false);
      if (!needsAdvisory) {
        setAdvisoryReady(true);
        return;
      }
      audio = new Audio("/brand/content-advisory.mp3");
      audio.preload = "auto";
      advisoryAudioRef.current = audio;
      const complete = () => {
        setAdvisoryReady(true);
      };
      audio.addEventListener("ended", complete, { once: true });
      audio.addEventListener("error", complete, { once: true });
      startAdvisory();
    };
    void beginAfterTuning();
    return () => {
      disposed = true;
      setWaitingForTuningAudio(false);
      audio?.pause();
      if (audio && advisoryAudioRef.current === audio) advisoryAudioRef.current = null;
    };
  }, [autoStart, entry.key, startAdvisory]);

  const canStartAutoplay = Boolean(
    playable &&
      advisoryReady &&
      player.ready &&
      !player.dataSaver &&
      !reducedMotion &&
      providerFits &&
      mostlyVisible &&
      pageVisible &&
      // Entering the 24/7 route is an explicit channel-tuning intent. It is
      // independent of the ordinary hover-preview preference/current-player
      // gates, while non-24/7 modes continue honoring those global settings.
      (autoStart || (player.previewAutoplay && !player.current)),
  );

  // Once this program has been allowed to start, keep the same media element
  // mounted for its entire schedule window. Intersection/visibility changes
  // must not continually tear down and recreate a provider iframe.
  useEffect(() => {
    if (canStartAutoplay) setMediaMounted(true);
  }, [canStartAutoplay]);

  const directVideoUrl = mediaMounted && playable?.mediaUrl && /\.(?:mp4|webm)(?:$|[?#])/i.test(playable.mediaUrl)
    ? playable.mediaUrl
    : null;
  const usesTwitchSdk = Boolean(
    mediaMounted &&
      playable &&
      entry.item.platform === "twitch" &&
      ((playable.kind === "live" && playable.twitchLogin) || playable.vodId),
  );
  const frameSrc = useMemo(() => {
    if (!mediaMounted || !host || !playable || directVideoUrl || usesTwitchSdk) return null;
    return embedFor(playable, {
      parent: host.parent,
      origin: host.origin,
      muted: true,
      autoplay: true,
      loop: false,
      controls: false,
      startSeconds: previewStartSeconds,
    });
  }, [directVideoUrl, host, mediaMounted, playable, previewStartSeconds, usesTwitchSdk]);

  useEffect(() => {
    setLoaded(false);
    setFrameReadyToken(0);
    setPlaying(false);
    setHeroMuted(true);
    setAutoplayBlocked(false);
    playbackStartedRef.current = false;
    nativeAutoplayAttemptedRef.current = false;
    explicitMuteChoiceRef.current = false;
  }, [directVideoUrl, frameSrc, setHeroMuted]);

  const markPlaying = useCallback(() => {
    playbackStartedRef.current = true;
    if (retryBlockedTimerRef.current !== null) {
      window.clearTimeout(retryBlockedTimerRef.current);
      retryBlockedTimerRef.current = null;
    }
    setLoaded(true);
    setPlaying(true);
    setAutoplayBlocked(false);
  }, []);

  const markAutoplayBlocked = useCallback(() => {
    if (playbackStartedRef.current) return;
    setAutoplayBlocked(true);
    // Keep the exact scheduled item mounted. A blocked autoplay gets an
    // owned retry/sound action instead of silently substituting another
    // program from later in the 24/7 rotation.
  }, []);

  const setProviderMuted = useCallback((next: boolean, requestPlay = false) => {
    setHeroMuted(next);
    try {
      const video = nativeVideoRef.current;
      if (video) {
        video.muted = next;
        if (requestPlay) void video.play().then(markPlaying).catch(markAutoplayBlocked);
      }
      twitchPlayerRef.current?.setMuted?.(next);
      if (requestPlay) twitchPlayerRef.current?.play?.();
    } catch {
      // The provider can be replacing its own iframe. The next retry or a
      // deliberate viewer click will reapply the desired mute state.
    }
    postFrameMuted(next, requestPlay);
  }, [markAutoplayBlocked, markPlaying, postFrameMuted, setHeroMuted]);

  const toggleHeroMute = useCallback(() => {
    explicitMuteChoiceRef.current = true;
    setProviderMuted(!mutedRef.current, true);
  }, [setProviderMuted]);

  const retryHeroPlayback = useCallback(() => {
    // This is a real viewer gesture, so retry the original program with
    // sound. It must not alter the 24/7 schedule or substitute another item.
    explicitMuteChoiceRef.current = true;
    setAutoplayBlocked(false);
    setProviderMuted(false, true);
    if (retryBlockedTimerRef.current !== null) window.clearTimeout(retryBlockedTimerRef.current);
    retryBlockedTimerRef.current = window.setTimeout(() => {
      if (!playbackStartedRef.current) setAutoplayBlocked(true);
    }, 3_000);
  }, [setProviderMuted]);

  useEffect(() => () => {
    if (retryBlockedTimerRef.current !== null) window.clearTimeout(retryBlockedTimerRef.current);
  }, []);

  const requestNativeAutoplay = useCallback((media: HTMLVideoElement) => {
    setLoaded(true);
    media.muted = mutedRef.current;
    if (!media.paused) {
      markPlaying();
      return;
    }
    if (nativeAutoplayAttemptedRef.current) return;
    nativeAutoplayAttemptedRef.current = true;
    void media.play().then(markPlaying).catch(markAutoplayBlocked);
  }, [markAutoplayBlocked, markPlaying]);

  useEffect(() => {
    const mount = twitchMountRef.current;
    if (!usesTwitchSdk || !host || !playable || !mount) return;
    const channel = playable.kind === "live" ? playable.twitchLogin : null;
    const video = playable.vodId;
    if (!channel && !video) return;

    let disposed = false;
    let instance: ChannelTwitchInstance | null = null;
    let playbackAttempts = 0;
    let playbackHealthTimer: number | null = null;
    let recoveryBlockedTimer: number | null = null;
    const maxPlaybackAttempts = 16;
    const retryTimers = new Set<number>();
    const clearRetries = () => {
      for (const timer of retryTimers) window.clearTimeout(timer);
      retryTimers.clear();
    };
    const prepareIframe = () => {
      const iframe = mount.querySelector("iframe");
      if (!iframe || disposed) return false;
      iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
      setLoaded(true);
      return true;
    };
    const requestPlayback = (forceMuted = mutedRef.current) => {
      if (disposed || !instance || playbackStartedRef.current || playbackAttempts >= maxPlaybackAttempts) return;
      playbackAttempts += 1;
      prepareIframe();
      instance.setMuted?.(forceMuted || mutedRef.current);
      instance.play?.();
    };
    const scheduleRetries = (delays: readonly number[], forceMuted = mutedRef.current) => {
      const available = Math.max(0, maxPlaybackAttempts - playbackAttempts - retryTimers.size);
      for (const delay of delays.slice(0, available)) {
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer);
          requestPlayback(forceMuted);
        }, delay);
        retryTimers.add(timer);
      }
    };
    const playerIsPaused = () => {
      try {
        const paused = instance?.isPaused?.();
        return typeof paused === "boolean" ? paused : null;
      } catch {
        return null;
      }
    };
    const slotIsVisible = () => {
      const rect = slotRef.current?.getBoundingClientRect();
      return Boolean(
        rect &&
          rect.width >= 400 &&
          rect.height >= 300 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight,
      );
    };
    const recoverPausedPlayback = () => {
      if (disposed) return;
      playbackStartedRef.current = false;
      setPlaying(false);
      if (!autoStart || document.visibilityState !== "visible" || !slotIsVisible()) return;
      clearRetries();
      playbackAttempts = 0;
      // A provider-owned resume is not a new viewer gesture. Keep it
      // browser-safe unless the viewer explicitly chose audible playback.
      if (!explicitMuteChoiceRef.current) {
        setHeroMuted(true);
      }
      scheduleRetries([120, 700, 1_800, 3_200, 5_200, 7_500], true);
      if (recoveryBlockedTimer !== null) window.clearTimeout(recoveryBlockedTimer);
      recoveryBlockedTimer = window.setTimeout(() => {
        if (!disposed && playerIsPaused() === true) markAutoplayBlocked();
      }, 10_000);
    };
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible" && playerIsPaused() === true) recoverPausedPlayback();
    };

    mount.replaceChildren();
    const observer = new MutationObserver(prepareIframe);
    observer.observe(mount, { childList: true, subtree: true });
    const blockedTimer = window.setTimeout(() => {
      if (disposed || playbackStartedRef.current) return;
      const paused = playerIsPaused();
      if (paused === false) {
        markPlaying();
        return;
      }
      if (paused === true) markAutoplayBlocked();
    }, 15_000);

    void loadChannelTwitch()
      .then((api) => {
        if (disposed) return;
        const options: Record<string, unknown> = {
          width: "100%",
          height: "100%",
          parent: [host.parent],
          autoplay: true,
          muted: true,
        };
        if (channel) options.channel = channel;
        else if (video) options.video = video.startsWith("v") ? video : `v${video}`;
        if (!channel && previewStartSeconds > 0) {
          const hours = Math.floor(previewStartSeconds / 3_600);
          const minutes = Math.floor((previewStartSeconds % 3_600) / 60);
          const seconds = previewStartSeconds % 60;
          options.time = `${hours}h${minutes}m${seconds}s`;
        }
        instance = new api.Player(twitchMountId, options);
        twitchPlayerRef.current = instance;
        prepareIframe();
        scheduleRetries([250, 750, 1_500, 2_800, 4_400, 6_500, 9_000], true);
        instance.addEventListener(api.Player.READY, () => {
          if (!disposed) scheduleRetries([0, 600, 1_500, 2_800, 4_800], true);
        });
        instance.addEventListener(api.Player.PLAYING, () => {
          if (disposed) return;
          clearRetries();
          window.clearTimeout(blockedTimer);
          if (recoveryBlockedTimer !== null) window.clearTimeout(recoveryBlockedTimer);
          instance?.setMuted?.(mutedRef.current);
          markPlaying();
          if (playbackHealthTimer !== null) window.clearTimeout(playbackHealthTimer);
          playbackHealthTimer = window.setTimeout(() => {
            if (!disposed && playerIsPaused() === true) recoverPausedPlayback();
          }, 900);
        });
        instance.addEventListener(api.Player.PAUSE, () => {
          if (!disposed) recoverPausedPlayback();
        });
        instance.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (disposed) return;
          clearRetries();
          prepareIframe();
          // Twitch can emit this while its iframe or an ad is still settling.
          // Keep the exact scheduled program mounted and retry in the
          // browser-safe muted state instead of replacing it with a prompt.
          if (!explicitMuteChoiceRef.current) setHeroMuted(true);
          playbackAttempts = 0;
          scheduleRetries([250, 800, 1_800, 3_200, 5_200, 7_500], true);
        });
        instance.addEventListener(api.Player.OFFLINE, () => {
          if (disposed) return;
          clearRetries();
          markAutoplayBlocked();
        });
        if (video && api.Player.ENDED) {
          instance.addEventListener(api.Player.ENDED, () => {
            if (!disposed) onProgramBoundary?.();
          });
        }
      })
      .catch(() => {
        if (!disposed) markAutoplayBlocked();
      });

    document.addEventListener("visibilitychange", resumeWhenVisible);
    window.addEventListener("focus", resumeWhenVisible);

    return () => {
      disposed = true;
      clearRetries();
      window.clearTimeout(blockedTimer);
      if (playbackHealthTimer !== null) window.clearTimeout(playbackHealthTimer);
      if (recoveryBlockedTimer !== null) window.clearTimeout(recoveryBlockedTimer);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      window.removeEventListener("focus", resumeWhenVisible);
      observer.disconnect();
      instance?.destroy?.();
      if (twitchPlayerRef.current === instance) twitchPlayerRef.current = null;
      mount.replaceChildren();
    };
  }, [autoStart, host, markAutoplayBlocked, markPlaying, onProgramBoundary, playable, previewStartSeconds, setHeroMuted, twitchMountId, usesTwitchSdk]);

  useEffect(() => {
    if (!frameSrc || frameReadyToken === 0) return;
    const requestProviderAutoplay = (forceMuted = mutedRef.current) => {
      if (playbackStartedRef.current) return;
      const target = frameRef.current?.contentWindow;
      if (!target) return;
      if (playable?.youtubeId) {
        target.postMessage(JSON.stringify({ event: "listening", id: `core-channel-${entry.key}` }), "*");
        target.postMessage(JSON.stringify({ event: "command", func: forceMuted || mutedRef.current ? "mute" : "unMute", args: [] }), "*");
        target.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      } else if (entry.item.platform === "tiktok") {
        target.postMessage({ "x-tiktok-player": true, type: forceMuted || mutedRef.current ? "mute" : "unmute" }, "*");
        target.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
      }
    };

    // The old attempt was scheduled before React had mounted the iframe, so
    // it frequently found no contentWindow and never retried. Start after the
    // actual load event, then cover provider API boot without remounting the
    // current scheduled program.
    requestProviderAutoplay(true);
    const attempts = [180, 650, 1_400, 2_800].map((delay) => window.setTimeout(
      () => requestProviderAutoplay(true),
      delay,
    ));
    const blockedTimer = window.setTimeout(() => {
      markAutoplayBlocked();
    }, 12_000);
    return () => {
      for (const timer of attempts) window.clearTimeout(timer);
      window.clearTimeout(blockedTimer);
    };
  }, [entry.item.platform, entry.key, frameReadyToken, frameSrc, markAutoplayBlocked, playable?.youtubeId]);

  useEffect(() => {
    if (!frameSrc) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const message = payload as Record<string, unknown>;
      const info = message.info;
      const youtubePlaying =
        (message.event === "onStateChange" && info === 1) ||
        (message.event === "infoDelivery" && info && typeof info === "object" && (info as Record<string, unknown>).playerState === 1);
      const tiktokPlaying =
        message["x-tiktok-player"] === true &&
        message.type === "onStateChange" &&
        message.value === 1;
      const youtubeEnded = message.event === "onStateChange" && info === 0;
      const tiktokEnded =
        message["x-tiktok-player"] === true
        && (message.type === "ended" || (message.type === "onStateChange" && message.value === 0));
      if (youtubePlaying || tiktokPlaying) markPlaying();
      if (youtubeEnded || tiktokEnded) onProgramBoundary?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameSrc, markPlaying, onProgramBoundary]);

  const live = entry.item.kind === "live" || entry.item.format === "live";
  const actionLabel = `Watch ${entry.item.title}, now on ${channel.name} 24/7, in the media player`;

  return (
    <section
      ref={slotRef}
      className={`${styles.heroPreview} ${loaded ? styles.heroPreviewLoaded : ""} ${autoStart && usesTwitchSdk && playing ? styles.heroPreviewProviderAutoplay : ""}`.trim()}
      aria-label={`${channel.name} 24/7 on now`}
      data-autoplay={autoStart ? (playing ? "playing" : autoplayBlocked ? "blocked" : "pending") : "preference"}
    >
      <div className={styles.heroPreviewMedia} aria-hidden={autoStart && usesTwitchSdk ? undefined : "true"}>
        <WatchThumb
          src={entry.item.backdrop || entry.item.poster}
          youtubeId={entry.item.platform === "youtube" ? entry.item.id.replace(/^yt-/, "") : null}
          loading="eager"
          focalPoint={entry.item.focalPoint}
        />
        {directVideoUrl ? (
          <video
            ref={nativeVideoRef}
            src={directVideoUrl}
            autoPlay
            muted={muted}
            playsInline
            preload="metadata"
            onCanPlay={(event) => requestNativeAutoplay(event.currentTarget)}
            onPlaying={markPlaying}
            onVolumeChange={(event) => {
              const nextMuted = event.currentTarget.muted || event.currentTarget.volume === 0;
              if (nextMuted !== mutedRef.current) setHeroMuted(nextMuted);
            }}
            onEnded={onProgramBoundary}
            onError={markAutoplayBlocked}
          />
        ) : usesTwitchSdk ? (
          <div ref={twitchMountRef} id={twitchMountId} className={styles.heroPreviewTwitchMount} />
        ) : frameSrc ? (
          <iframe
            ref={frameRef}
            title={`${entry.item.title} 24/7 preview`}
            src={frameSrc}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            loading="eager"
            tabIndex={-1}
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              setLoaded(true);
              setFrameReadyToken((token) => token + 1);
            }}
          />
        ) : null}
        <span className={styles.heroPreviewVeil} />
      </div>

      <div className={styles.heroPreviewTop} aria-hidden="true">
        <span className={styles.heroPreviewLiveDot} />
        <strong>{live ? "Live now" : "On now"}</strong>
        <span>{channel.name} 24/7</span>
      </div>
      {advisoryReady && playable ? (
        <button
          type="button"
          className={styles.heroPreviewSound}
          aria-pressed={!muted}
          aria-label={`${muted ? "Turn sound on for" : "Mute"} ${entry.item.title}`}
          title={muted ? "Turn sound on" : "Mute"}
          onClick={toggleHeroMute}
        >
          {muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
          <span>{muted ? "Sound off" : "Sound on"}</span>
        </button>
      ) : null}
      {!playing ? (
        autoplayBlocked ? (
          <button type="button" className={styles.heroPreviewRetry} onClick={retryHeroPlayback}>
            <Play size={16} fill="currentColor" aria-hidden="true" />
            Try playback
          </button>
        ) : (
          <div className={styles.heroPreviewCenter} aria-hidden="true">
            <span><Play size={23} fill="currentColor" /></span>
          </div>
        )
      ) : null}
      <div className={styles.heroPreviewCopy} aria-hidden="true">
        <span className={styles.heroPreviewKicker}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={channel.artwork} alt="" />
          <b>{live ? "Live" : "On air"}</b>
          <em>{channel.name} 24/7</em>
        </span>
        <strong>{entry.item.title}</strong>
        <span>{autoplayBlocked ? "Signal unavailable · retry playback" : playing ? "Signal live" : "Establishing signal"} · {watchAttributionLabel(entry.item)} · {mediaTypeLabel(entry.item)}</span>
      </div>
      {!live ? (
        <span className={styles.heroPreviewProgress} aria-hidden="true">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      ) : null}
      {advisoryReady && playable && !(autoStart && usesTwitchSdk) && (!usesTwitchSdk || playing || autoplayBlocked) ? (
        <button type="button" className={styles.heroPreviewAction} aria-label={actionLabel} onClick={onActivate} />
      ) : null}
      {!advisoryReady ? (
        <div className={styles.heroPreviewAdvisory} role="status" aria-live="assertive" aria-label={waitingForTuningAudio ? "DJ Cora is tuning the channel." : "Mature audience advisory. The following program is intended for audiences ages 13 and older. Viewer discretion is advised."}>
          <NetworkAdvisoryArtwork channel={channel} showNetworkArt={waitingForTuningAudio} />
          {waitingForTuningAudio ? (
            <div className={styles.heroPreviewAdvisoryContent}>
              <small className={styles.heroPreviewAdvisoryTuningLine}>{NETWORK_ADVISORY_VISUALS[channel.slug].tuningLine}</small>
              <button type="button" onClick={skipNetworkTuningAudio}>Skip DJ Cora</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function NetworkChannelRail({
  className = "",
  personalized = false,
  preferredMemberSlugs = [],
  variant = "detail",
}: {
  className?: string;
  personalized?: boolean;
  preferredMemberSlugs?: readonly string[];
  variant?: "home" | "detail";
}) {
  const isHomeShelf = variant === "home";
  const headingId = isHomeShelf ? "home-network-channel-heading" : "network-channel-heading";
  const channels = useMemo(() => {
    const order = new Map(preferredMemberSlugs.map((slug, index) => [slug, index]));
    return NETWORK_CHANNELS.filter((channel) => !isHomeShelf || channel.slug !== "core").sort((left, right) => {
      if (left.memberSlug === null) return -1;
      if (right.memberSlug === null) return 1;
      const leftRank = order.get(left.memberSlug) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = order.get(right.memberSlug) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }, [isHomeShelf, preferredMemberSlugs]);
  return (
    <section
      id={isHomeShelf ? "core-channels" : undefined}
      className={`watch-shelf-section px-5 md:px-10 ${isHomeShelf ? "watch-home-channel-shelf" : styles.detailChannelShelf} ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="watch-shelf-heading watch-home-shelf-heading mb-3">
        <div className="watch-home-shelf-heading-copy">
          <h2
            id={headingId}
            className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl"
          >
            {isHomeShelf
              ? "Browse Communities"
              : personalized
                ? "Your CORE channels"
                : "CORE channels"}
          </h2>
        </div>
        {isHomeShelf ? (
          <Link href={"/guide" as never} className="watch-home-shelf-action">
            Open guide
            <ChevronRight size={14} aria-hidden />
          </Link>
        ) : (
          <Link href={"/channels/core?mode=shorts" as never} className="watch-home-shelf-action">
            <Zap size={14} aria-hidden />
            Shorts channel
          </Link>
        )}
      </div>
      <DragScrollRail
        className="watch-shelf watch-home-channel-rail"
        role="region"
        tabIndex={0}
        aria-label="CORE community channels"
      >
        {channels.map((channel) => (
          <Link
            key={channel.slug}
            href={channelHref(channel, "continuous") as never}
            aria-label={`Open ${channel.name} community`}
            data-cursor-community={channel.slug}
            className={`watch-home-promo-card ${styles.homeChannelTile}`}
            style={{ "--channel-accent": channel.accent } as React.CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={channel.backdrop} alt="" className={styles.homeChannelBackdrop} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {channel.slug === "core" ? (
              <CoreWordmark className={styles.homeCoreWordmark} />
            ) : (
              <img src={channel.artwork} alt="" className={styles.homeChannelArtwork} />
            )}
            <span className={styles.homeChannelCopy}>
              <strong>{channel.name}</strong>
              <small>{channel.host}</small>
            </span>
          </Link>
        ))}
      </DragScrollRail>
    </section>
  );
}

export function NetworkChannelPage({
  channel,
  mode,
  items,
  continuousItems,
  hub,
  serverNow,
  twitchTracker,
  airtimeFallback,
  archivedDaily,
  sourceDiagnostics,
  xCommunityUrl,
  ownerXPosts,
  galleryPhotos,
  team,
  socialAvatarByUrl,
}: {
  channel: NetworkChannel;
  mode: NetworkChannelMode;
  items: WatchItem[];
  continuousItems: WatchItem[];
  hub: NetworkChannelHub;
  serverNow: string;
  twitchTracker: TwitchTrackerChannelSnapshot[];
  airtimeFallback: AirtimeHistorySession[];
  archivedDaily: AirtimeDailyRecord[];
  /** Token-free server diagnostics for official Instagram and TikTok feeds. */
  sourceDiagnostics: readonly CuratedChannelSourceDiagnostic[];
  /** Exact configured X Community URL. No profile URL is substituted. */
  xCommunityUrl: string | null;
  ownerXPosts: WatchHomeXPost[];
  /** Curated server-side photo selection shared with the creator's /about page. */
  galleryPhotos: readonly string[];
  /** Canonical crew roster scoped to this channel's creator. */
  team: readonly ChannelCrewMember[];
  /** Official per-platform profile images keyed by the social profile URL. */
  socialAvatarByUrl: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const player = usePlayer();
  const viewer = useBrowserTimeZone();
  const member = channel.memberSlug ? MEMBERS_BY_SLUG[channel.memberSlug] : null;
  const memberAge = member ? ageFromIso(member.birthDate) : null;
  const socialLinks = useMemo(
    () => channelSocialLinks(channel, socialAvatarByUrl),
    [channel, socialAvatarByUrl],
  );
  const sourceDescriptors = useMemo(
    () => curatedSources(channel, socialLinks, sourceDiagnostics, hub.all),
    [channel, hub.all, socialLinks, sourceDiagnostics],
  );
  const nonXSourceDescriptors = useMemo(
    () => sourceDescriptors.filter((source) => source.platform !== "x"),
    [sourceDescriptors],
  );
  const nonXHubItems = useMemo(
    () => hub.all.filter((item) => item.platform !== "x"),
    [hub.all],
  );
  const parsedNow = Date.parse(serverNow);
  const [now, setNow] = useState(Number.isFinite(parsedNow) ? parsedNow : 0);
  const [completedLiveInterruptions, setCompletedLiveInterruptions] = useState<CompletedLiveInterruption[]>([]);
  /**
   * This only remembers the previously rendered 24/7 program. It deliberately
   * starts empty on a route change so landing directly on an already-live
   * network never creates a stale "just went live" interruption.
   */
  const previousContinuousProgramRef = useRef<{
    networkSlug: string;
    entry: ChannelScheduleEntry | null;
  } | null>(null);
  const activePlaybackRef = useRef(player.current);
  const isCreatorBirthday = isBirthdayToday(member?.birthDate, now);

  useEffect(() => {
    activePlaybackRef.current = player.current;
  }, [player.current]);

  useEffect(() => {
    // This client component is only mounted after the server route has
    // resolved its catalog, source diagnostics, and channel hub. Signal on
    // the second frame so the transition releases after the new page has
    // genuinely painted, not merely after its pathname changed.
    window.scrollTo(0, 0);
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => markNetworkRouteReady());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channel.slug, mode]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  // Poll the dynamic channel route for live-state changes. The active stream
  // remains the 24/7 program while it is reported live; the remembered window
  // below supplies the exact pause in the rotation after it ends.
  useEffect(() => {
    if (mode !== "continuous") return;
    const interval = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [mode, router]);

  useEffect(() => {
    const scopeLogins = channel.memberSlug
      ? [MEMBERS_BY_SLUG[channel.memberSlug]?.twitchLogin ?? ""]
      : MEMBERS.map((entry) => entry.twitchLogin);
    const scoped = new Set(scopeLogins.map((login) => login.toLowerCase()).filter(Boolean));
    const active = continuousItems.flatMap((item) => {
      if (item.kind !== "live" && item.format !== "live") return [];
      const login = (item.live?.login ?? MEMBERS_BY_SLUG[item.memberSlug ?? ""]?.twitchLogin ?? "").toLowerCase();
      return login && scoped.has(login) ? [{
        login,
        isLive: true,
        startedAt: item.live?.startedAt ?? item.publishedAt,
        title: item.title,
        item,
      }] : [];
    });
    const remembered = syncLiveMemory(active, { scopeLogins });
    const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
    const interruptions = Object.values(remembered).flatMap((entry) => {
      if (!scoped.has(entry.login) || !entry.item || !entry.endedAt) return [];
      const startsAtMs = Date.parse(entry.startedAt);
      const endsAtMs = Date.parse(entry.endedAt);
      if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs || endsAtMs <= cutoff) return [];
      return [{ item: entry.item, startsAtMs, endsAtMs } satisfies CompletedLiveInterruption];
    });
    setCompletedLiveInterruptions(interruptions);
  }, [channel.memberSlug, continuousItems]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/passport/visit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channelSlug: channel.slug }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [channel.slug]);

  const schedule = useMemo(() => networkChannelSchedule(items, now, mode), [items, mode, now]);
  const continuousGuideRow = useMemo<GuideNetworkRow>(() => ({
    id: `${channel.slug}:continuous`,
    networkSlug: channel.slug,
    kind: "continuous",
    label: "24/7",
    description: modeDescription(channel, "continuous"),
    timelineSlug: channel.memberSlug ?? "house",
    channel: {
      id: `${channel.slug}:continuous`,
      title: `${channel.name} 24/7`,
      subtitle: modeDescription(channel, "continuous"),
      href: channelHref(channel, "continuous"),
      artwork: channel.artwork,
    },
    items: continuousItems,
  }), [channel, continuousItems]);
  const continuousGuideGroup = useMemo<GuideNetworkGroup>(() => ({
    network: channel,
    rows: [continuousGuideRow],
  }), [channel, continuousGuideRow]);
  // Rebuild the duration schedule on a coarse cadence, then project its
  // current state against the per-second UI clock. This keeps the exact clock
  // moving without repeatedly rebuilding a long 24/7 rotation.
  const scheduleBuildNow = Math.floor(now / CHANNEL_SCHEDULE_REFRESH_MS) * CHANNEL_SCHEDULE_REFRESH_MS;
  const continuousBlocks = useMemo(() => buildContinuousGuideSchedule({
    group: continuousGuideGroup,
    row: continuousGuideRow,
    rangeStart: scheduleBuildNow - CHANNEL_CONTINUOUS_LOOKBACK_MS,
    rangeEnd: scheduleBuildNow + CONTINUOUS_GUIDE_FUTURE_HORIZON_MS,
    nowMs: scheduleBuildNow,
    completedLiveInterruptions,
  }), [completedLiveInterruptions, continuousGuideGroup, continuousGuideRow, scheduleBuildNow]);
  const continuousSchedule = useMemo<ChannelScheduleEntry[]>(() => {
    const queue = continuousBlocks
      .filter((block) => block.endMs > now)
      .map((block) => ({
        key: block.id,
        item: block.item,
        startsAt: block.startMs,
        endsAt: block.endMs,
        current: block.startMs <= now && now < block.endMs,
      }));
    const withinVisibleHorizon = queue.filter((entry) => (
      entry.startsAt < now + CHANNEL_CONTINUOUS_QUEUE_HORIZON_MS
    ));
    // A long live or VOD may be the only entry in the next eight hours. In
    // that case retain enough later entries to make the handoff visible.
    const visible = withinVisibleHorizon.length >= CHANNEL_CONTINUOUS_QUEUE_MIN_BLOCKS
      ? withinVisibleHorizon
      : queue.slice(0, Math.max(CHANNEL_CONTINUOUS_QUEUE_MIN_BLOCKS, withinVisibleHorizon.length));
    return visible.slice(0, CHANNEL_CONTINUOUS_QUEUE_MAX_BLOCKS);
  }, [continuousBlocks, now]);
  const current = schedule[0]?.item ?? items[0] ?? null;
  const continuousEntry = continuousSchedule[0] ?? null;
  useEffect(() => {
    // A takeover is meaningful only while this exact page is serving as the
    // viewer's 24/7 network. Other modes reset the baseline instead of
    // carrying a stale program into a later route change.
    if (mode !== "continuous") {
      previousContinuousProgramRef.current = null;
      return;
    }

    const previous = previousContinuousProgramRef.current;
    previousContinuousProgramRef.current = { networkSlug: channel.slug, entry: continuousEntry };
    if (!continuousEntry || !previous?.entry || previous.networkSlug !== channel.slug) return;

    // A hidden tab is not an active viewing session. Skipping the event here
    // also prevents an old cue from firing late when the user comes back.
    if (document.visibilityState !== "visible") return;

    if (!shouldAnnounceNetworkLiveTakeover({
      mode,
      previous: previous.entry.item,
      next: continuousEntry.item,
      activePlayback: player.current,
    })) return;

    const detail = createNetworkLiveTakeoverDetail({
      network: {
        slug: channel.slug,
        name: channel.name,
        href: channelHref(channel, "continuous"),
      },
      previous: previous.entry.item,
      next: continuousEntry.item,
      activePlayback: player.current,
    });
    if (!detail) return;
    // First-tune station IDs begin inside the navigation click. Wait for that
    // short, owned audio layer to finish before announcing a live takeover;
    // then check playback again in case the viewer moved into another live
    // stream while it was waiting.
    let cancelled = false;
    const announceAfterStationId = async () => {
      await waitForNetworkTuningAudio();
      if (cancelled || document.visibilityState !== "visible" || isLiveMedia(activePlaybackRef.current)) return;
      dispatchNetworkLiveTakeover(detail);
    };
    void announceAfterStationId();
    return () => { cancelled = true; };
  }, [channel, continuousEntry, mode, player.current]);
  // A 24/7 channel must stay on the scheduled program even if a provider
  // rejects autoplay. The hero owns its retry + sound controls rather than
  // replacing the title with a later queue item behind the viewer's back.
  const previewEntry = continuousEntry;
  const displayedCurrent = mode === "continuous" && previewEntry ? previewEntry.item : current;
  const advanceHeroSchedule = useCallback(() => {
    // Native media tells us its exact end point. Refreshing the shared clock
    // here removes the otherwise-visible one-second handoff gap; the schedule
    // remains the sole authority for which title is next.
    setNow(Date.now());
  }, []);
  const title = modeTitle(channel, mode);
  const description = modeDescription(channel, mode);
  const channelContext = useMemo(() => ({
    id: `${channel.slug}:${mode}`,
    title,
    subtitle: description,
    href: channelHref(channel, mode),
    artwork: channel.artwork,
  }), [channel, description, mode, title]);
  const continuousContext = useMemo(() => ({
    id: `${channel.slug}:continuous`,
    title: `${channel.name} 24/7`,
    subtitle: modeDescription(channel, "continuous"),
    href: channelHref(channel, "continuous"),
    artwork: channel.artwork,
  }), [channel]);
  const tuned = player.channel?.id === channelContext.id;
  const currentEntry = schedule[0];
  // Every network landing state gets the same muted, CORE-controlled hero
  // preview. Previously only the 24/7 channel mounted a real player, leaving
  // Live, Videos, and Shorts as static art until someone pressed Tune in.
  const heroPreviewEntry = mode === "continuous" ? previewEntry : currentEntry;
  const progress = currentEntry
    ? Math.min(1, Math.max(0, (now - currentEntry.startsAt) / (currentEntry.endsAt - currentEntry.startsAt)))
    : 0;
  const continuousProgress = previewEntry
    ? Math.min(1, Math.max(0, (now - previewEntry.startsAt) / (previewEntry.endsAt - previewEntry.startsAt)))
    : 0;
  const onAirEntry = mode === "continuous" ? continuousEntry : currentEntry;
  // A current provider live stream has no authoritative end. The 24/7
  // scheduler keeps an internal forecast only to preserve the interrupted
  // rotation; never expose that forecast as a duration, progress meter, or
  // countdown to viewers.
  const hasOpenEndedLiveOnAir = onAirEntry?.current === true && isLiveMedia(onAirEntry.item);
  const hasContinuousLiveInterruption = mode === "continuous"
    && Boolean(continuousEntry && isLiveMedia(continuousEntry.item));
  const tuneLabel = tuned
    ? "On air · restart"
    : mode === "live" && displayedCurrent !== null && displayedCurrent.kind !== "live"
      ? "Watch broadcast"
      : "Tune in";

  const tune = (start?: WatchItem) => {
    if (!items.length && !start) return;
    player.playChannel(channelContext, items.length ? items : start ? [start] : [], start ?? displayedCurrent ?? 0);
  };
  const tuneContinuous = (requestedEntry?: ChannelScheduleEntry) => {
    const selectedEntry = requestedEntry ?? previewEntry;
    if (!selectedEntry || !continuousItems.length) return;
    const previewPlayable = itemToPlayable(selectedEntry.item);
    const scheduledItems = continuousSchedule.map((entry) => entry.item);
    const selectedLive = isLiveMedia(selectedEntry.item);
    const channelWithAiring = previewPlayable ? {
      ...continuousContext,
      airing: {
        itemKey: previewPlayable.key,
        network: channel.name,
        channel: "24/7",
        startsAt: new Date(selectedEntry.startsAt).toISOString(),
        // The linear guide's projected handoff is implementation detail for
        // a real live broadcast. Omitting it prevents every player surface
        // from presenting an invented ending time.
        ...(selectedLive ? {} : { endsAt: new Date(selectedEntry.endsAt).toISOString() }),
        status: selectedLive ? "live" as const : "published" as const,
        continuous: true,
      },
    } : continuousContext;
    player.playChannel(
      channelWithAiring,
      scheduledItems.length ? scheduledItems : continuousItems,
      selectedEntry.item,
    );
    const elapsed = channelProgramElapsedSeconds(selectedEntry, now);
    if (elapsed > 0) player.requestSeek(elapsed);
  };
  useEffect(() => {
    if (
      mode !== "continuous"
      || !continuousEntry
      || player.channel?.id !== continuousContext.id
      || !player.current
      || (player.current.kind !== "live" && player.current.format !== "live")
      || continuousEntry.item.kind === "live"
      || continuousEntry.item.format === "live"
    ) return;
    // The provider just reported the stream offline. Retune the shared player
    // to the exact resumed block rather than falling back to the beginning of
    // the normal rotation.
    tuneContinuous(continuousEntry);
  }, [continuousContext.id, continuousEntry, mode, player.channel?.id, player.current]);
  const playSourceItem = useCallback((item: WatchItem, sourceQueue: readonly WatchItem[]) => {
    player.play(item, [...sourceQueue]);
  }, [player]);

  const tvPackage = channelTvPackage(channel.slug);
  const mailingAddress = member?.poBox ?? null;

  return (
    <div className={styles.page} data-cursor-community={channel.slug} data-tv-package={channel.slug} style={{ "--channel-accent": channel.accent } as React.CSSProperties}>
      <nav className={styles.networkNav} aria-label="Community channels">
        <span className={styles.dialLabel}>Network dial</span>
        <div className={styles.networkDial}>
          {NETWORK_CHANNELS.map((entry) => (
            <Link
              key={entry.slug}
              href={channelHref(entry, mode) as never}
              data-cursor-community={entry.slug}
              aria-current={entry.slug === channel.slug ? "page" : undefined}
              aria-label={`Tune to ${entry.name}`}
              title={`${entry.name} · ${entry.host}`}
            >
              {entry.slug === "core" ? (
                <CoreWordmark className={styles.dialCoreWordmark} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.artwork} alt="" />
              )}
              <span>{entry.name}</span>
            </Link>
          ))}
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden>
          {/* The channel page begins in its community world. Live and
              on-demand motion stays contained in the player preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={channel.backdrop} alt="" />
          <span />
        </div>
        {/* Large, intentionally translucent station bug: the backdrop remains
            the star while every channel still gets a recognizable broadcast identity. */}
        {channel.slug === "core" ? (
          <CoreWordmark className={`${styles.heroBug} ${styles.heroCoreWordmark}`} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.heroBug} src={channel.artwork} alt="" aria-hidden />
        )}
        {isCreatorBirthday && member ? (
          <div className={styles.birthdayHeroCelebration} role="status" aria-label={`Happy birthday, ${member.stageName}!`}>
            <span className={styles.birthdayHeroBalloon} aria-hidden />
            <span className={styles.birthdayHeroBalloon} aria-hidden />
            <span className={styles.birthdayHeroBalloon} aria-hidden />
            <span className={styles.birthdayHeroLabel}>Happy birthday, {member.stageName}</span>
          </div>
        ) : null}
        <div className={styles.heroCopy}>
          <div className={styles.identity}>
            {channel.slug === "core" ? (
              <CoreWordmark className={styles.identityCoreWordmark} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.identityLogo} src={channel.artwork} alt="" />
            )}
            <span>
              <span className={styles.eyebrow}>{tvPackage.signal}</span>
              <strong>{channel.name}</strong>
            </span>
          </div>
          <h1>{title}</h1>
          <p>{description}</p>

          <div className={styles.modeTabs} aria-label="Channel mode">
            {supportedModes(channel).map((entry) => (
              <Link key={entry} href={channelHref(channel, entry) as never} aria-current={mode === entry ? "page" : undefined}>
                <ModeIcon mode={entry} /> {modeLabel(entry)}
              </Link>
            ))}
          </div>

          {displayedCurrent ? (
            <div className={styles.nowTitle}>
              <span>{displayedCurrent.kind === "live" ? "Live now" : mode === "live" ? "Latest broadcast" : mode === "continuous" ? "Now airing" : "Start here"}</span>
              <strong>{displayedCurrent.title}</strong>
              <small>{watchAttributionLabel(displayedCurrent)} · {mediaTypeLabel(displayedCurrent)}</small>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.tuneButton}
            disabled={!displayedCurrent}
            onClick={mode === "continuous" ? () => tuneContinuous() : () => tune()}
          >
            {tuned ? <RotateCcw size={18} aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
            {tuneLabel}
          </button>
        </div>
        {heroPreviewEntry ? (
          <ChannelOnNowPreview
            key={`${heroPreviewEntry.key}:${heroPreviewEntry.startsAt}`}
            channel={channel}
            entry={heroPreviewEntry}
            initialStartSeconds={channelProgramElapsedSeconds(heroPreviewEntry, now)}
            progress={mode === "continuous" ? continuousProgress : progress}
            autoStart
            onActivate={mode === "continuous" ? tuneContinuous : () => tune(heroPreviewEntry.item)}
            onProgramBoundary={mode === "continuous" ? advanceHeroSchedule : undefined}
          />
        ) : null}
      </header>

      {hasOpenEndedLiveOnAir && onAirEntry ? (
        <div className={styles.onAirBar}>
          <div>
            <strong>LIVE</strong>
            <span>
              {viewer.ready
                ? `Live since ${timeLabel(onAirEntry.startsAt, viewer.locale, viewer.timeZone)} ${zoneLabel(viewer.locale, viewer.timeZone, onAirEntry.startsAt)}`
                : "Live now"}
            </span>
          </div>
        </div>
      ) : null}

      <main className={styles.content}>
        <section className={styles.scheduleSection} aria-labelledby="channel-schedule-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>{mode === "live" ? "Live transmission" : mode === "videos" ? "Feature presentations" : mode === "shorts" ? "Short-form intermissions" : "Previously · on air · up next"}</span>
              <h2 id="channel-schedule-heading">{mode === "live" ? "Broadcast timeline" : mode === "continuous" ? "24/7 guide" : `${modeLabel(mode)} lineup`}</h2>
            </div>
            {mode !== "continuous" ? (
              <span className={styles.loopBadge}>
                {mode === "live" ? <Clock3 size={12} aria-hidden /> : <RotateCcw size={12} aria-hidden />}
                {mode === "live" ? "Original order" : "Autoplay"}
              </span>
            ) : continuousSchedule.length ? (
              <span className={styles.loopBadge}>
                <Clock3 size={12} aria-hidden />
                {hasContinuousLiveInterruption
                  ? "Live interruption active"
                  : viewer.ready
                  ? `Scheduled through ${timeLabel(continuousSchedule[continuousSchedule.length - 1]!.endsAt, viewer.locale, viewer.timeZone)}`
                  : "Upcoming schedule"}
              </span>
            ) : null}
          </div>

          {mode === "continuous" && continuousSchedule.length ? (
            <div className={styles.continuousGuide}>
              <div className={styles.continuousGuideToolbar}>
                <span><Radio size={12} aria-hidden /> Timeline · local time</span>
                <span>
                  {hasContinuousLiveInterruption
                    ? "Live now · rotation paused"
                    : "Drag to browse the scheduled rotation"}
                </span>
              </div>
              <DragScrollRail className={styles.continuousGuideScroll} wheelToX>
                <div className={styles.continuousGuideBoard}>
                  <div className={styles.continuousGuideHead}>
                    <span>{channel.name} 24/7</span>
                    <div>
                      {continuousSchedule.map((entry) => (
                        <time key={`tick:${entry.key}`} style={{ "--guide-program-units": guideScaleUnits((entry.endsAt - entry.startsAt) / 60_000) } as React.CSSProperties}>
                          {viewer.ready ? timeLabel(entry.startsAt, viewer.locale, viewer.timeZone) : "Local time"}
                        </time>
                      ))}
                    </div>
                  </div>
                  <div className={styles.continuousGuideRow}>
                    <span className={styles.continuousGuideLabel}>
                      <i aria-hidden /> On air
                    </span>
                    <div className={styles.continuousGuideTrack}>
                      {continuousSchedule[0] ? (
                        <i
                          className={styles.continuousGuideLiveMarker}
                          style={{ "--guide-now-units": guideScaleUnits((continuousSchedule[0].endsAt - continuousSchedule[0].startsAt) / 60_000) * Math.min(1, Math.max(0, (now - continuousSchedule[0].startsAt) / (continuousSchedule[0].endsAt - continuousSchedule[0].startsAt))) } as React.CSSProperties}
                          aria-hidden
                        />
                      ) : null}
                      {continuousSchedule.map((entry) => {
                        const guideUnits = guideScaleUnits((entry.endsAt - entry.startsAt) / 60_000);
                        const isLive = entry.item.kind === "live" || entry.item.format === "live";
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            className={`${styles.continuousGuideCard}${entry.current ? ` ${styles.continuousGuideCurrent}` : ""}`}
                            style={{ "--guide-program-units": guideUnits } as React.CSSProperties}
                            onClick={() => tuneContinuous(entry)}
                            aria-label={`${entry.current ? "Now playing" : "Play scheduled"} ${entry.item.title}`}
                            title={`${entry.item.title} · ${viewer.ready ? timeLabel(entry.startsAt, viewer.locale, viewer.timeZone) : "Scheduled"}`}
                          >
                            <span className={styles.continuousGuideMedia}>
                              <WatchThumb src={entry.item.poster} youtubeId={entry.item.platform === "youtube" ? entry.item.id.replace(/^yt-/, "") : null} />
                            </span>
                            <span className={styles.continuousGuideCopy}>
                              <small>
                                {entry.current
                                  ? isLive ? "Live now · rotation paused" : "Now airing"
                                  : viewer.ready ? timeLabel(entry.startsAt, viewer.locale, viewer.timeZone) : "Up next"}
                                {!entry.current && isLive ? " · Live" : ""}
                              </small>
                              <strong>{entry.item.title}</strong>
                              <span>{watchAttributionLabel(entry.item)} · {mediaTypeLabel(entry.item)}</span>
                            </span>
                            {entry.current ? <i className={styles.continuousGuideNow} aria-hidden /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </DragScrollRail>
            </div>
          ) : schedule.length ? (
            <ol className={`${styles.schedule} ${mode === "live" ? styles.broadcastSchedule : ""}`.trim()}>
              {schedule.map((entry, index) => (
                <li key={entry.key} className={entry.current ? styles.currentProgram : undefined}>
                  <button type="button" onClick={() => tune(entry.item)}>
                    <time>
                      {mode === "live"
                        ? entry.current
                          ? "Now"
                          : viewer.ready
                            ? `${dateLabel(new Date(entry.startsAt).toISOString(), viewer.locale, viewer.timeZone)} · ${timeLabel(entry.startsAt, viewer.locale, viewer.timeZone)}`
                            : "Local time"
                        : index === 0
                          ? "Start"
                          : index === 1
                            ? "Next"
                            : "Later"}
                    </time>
                    <span className={styles.queueThumb}>
                      <WatchThumb src={entry.item.poster} youtubeId={entry.item.platform === "youtube" ? entry.item.id.replace(/^yt-/, "") : null} />
                      {entry.current && (entry.item.kind === "live" || entry.item.format === "live") ? <i>Live</i> : null}
                    </span>
                    <span className={styles.queueCopy}>
                      <strong>{entry.item.title}</strong>
                      <small>
                        <PlatformMark platform={entry.item.platform} /> {watchAttributionLabel(entry.item)}
                        {" · "}{mediaTypeLabel(entry.item)}
                      </small>
                    </span>
                    <span className={styles.queueAction}>
                      {entry.current && (entry.item.kind === "live" || entry.item.format === "live") ? "Tune in" : index === 0 ? "Play" : "Play here"}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyState}>
              {mode === "live" ? "No live or past Twitch broadcasts are available yet." : `No ${modeLabel(mode).toLowerCase()} titles are available yet.`}
            </div>
          )}
        </section>

        <section className={styles.airtimeSection} aria-label={`${channel.name} airtime history`}>
          <GuideHistory
            serverNow={serverNow}
            twitchTracker={twitchTracker}
            fallbackSessions={airtimeFallback}
            archivedDaily={archivedDaily}
            memberSlug={channel.memberSlug}
            className={styles.airtimeHistory}
          />
        </section>

      </main>

      {member && galleryPhotos.length > 0 ? (
        <section className={styles.creatorGallery} aria-labelledby="channel-gallery-heading">
          <div className={styles.creatorGalleryHeader}>
            <div>
              <span className={styles.eyebrow}>Gallery · {galleryPhotos.length}</span>
              <h2 id="channel-gallery-heading">Stills.</h2>
            </div>
            <Link href="/media" className={styles.creatorGalleryLink}>
              All media <ChevronRight size={15} aria-hidden />
            </Link>
          </div>
          <div className={styles.creatorGalleryRail}>
            <AutoScrollGallery
              photos={galleryPhotos}
              alt={member.stageName}
              people={[
                {
                  id: `member:${member.slug}`,
                  slug: member.slug,
                  name: member.stageName,
                  accent: member.accent,
                  avatarUrl: member.portrait,
                  href: `/channels/${member.slug}`,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {team.length > 0 ? (
        <section className={styles.teamSection} aria-labelledby="channel-team-heading">
          <div className={styles.teamSectionHeading}>
            <div>
              <span className={styles.eyebrow}>Behind the camera</span>
              <h2 id="channel-team-heading">{member ? `${member.stageName}'s crew.` : "The CORE crew."}</h2>
            </div>
            <p>
              The people who help make this channel happen.
            </p>
          </div>
          <ul className={styles.teamGrid}>
            {team.map((crew) => (
              <li key={crew.slug}>
                <Link href={`/crew/${crew.slug}` as never} className={styles.teamCard}>
                  <span className={styles.teamPortrait}>
                    {crew.portrait ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={crew.portrait} alt="" />
                    ) : (
                      <span aria-hidden>{crew.name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("")}</span>
                    )}
                  </span>
                  <span className={styles.teamCardCopy}>
                    <small>{crew.roleLabel}</small>
                    <strong>{crew.name}</strong>
                    <span>View profile <ChevronRight size={13} aria-hidden /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.mailSection} aria-labelledby="channel-mail-heading">
        {member ? (
          <div className={styles.mailPostcard}>
            <h2 id="channel-mail-heading" className="sr-only">{channel.host} community mail</h2>
            <FanMailPostcard
              slug={member.slug}
              stageName={channel.host}
              realName={member.name}
              initial={channel.name.slice(0, 1)}
              accent={channel.accent}
              poBox={mailingAddress}
              commLogo={channel.artwork}
              commName={channel.name}
            />
          </div>
        ) : (
          <>
            <div className={styles.mailCopy}>
              <span className={styles.eyebrow}><Mail size={13} aria-hidden /> Community mail</span>
              <h2 id="channel-mail-heading">Send something to the house.</h2>
              <p>Choose a public mailing address for any community, or create a postcard online for a creator.</p>
            </div>
            <Link href="/fan-mail" className={styles.mailUnavailable}>
              <span><Mail size={17} aria-hidden /> <strong>Open the CORE mailroom</strong><small>See every confirmed community address and postcard option.</small></span>
              <ChevronRight size={17} aria-hidden />
            </Link>
          </>
        )}
      </section>

      <section className={styles.channelHub} aria-labelledby="channel-hub-heading">
        <div className={styles.channelHubIntro}>
          <div className={styles.channelHubIdentity}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={member?.portrait ?? channel.artwork}
              alt=""
              className={styles.channelHubPortrait}
            />
            <div>
              <h2 id="channel-hub-heading">
                {channel.memberSlug === null ? "Everything across CORE" : `Everything from ${channel.host}`}
              </h2>
              {member ? (
                <dl className={styles.creatorProfileMeta} aria-label={`${member.stageName} profile details`}>
                  <div>
                    <dt>Name</dt>
                    <dd>{member.realName}</dd>
                  </div>
                  {memberAge != null ? (
                    <div>
                      <dt>Age</dt>
                      <dd>{memberAge}</dd>
                    </div>
                  ) : null}
                  {member.birthDate ? (
                    <div>
                      <dt>Born</dt>
                      <dd><time dateTime={member.birthDate}>{formatMemberBirthday(member.birthDate)}</time></dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>
          </div>
        </div>

        {member?.managementEmail ? (
          <a
            href={`mailto:${member.managementEmail}`}
            className={styles.businessContact}
            aria-label={`Business contact for ${member.stageName}: ${member.managementEmail}`}
          >
            <span className={styles.businessContactIcon} aria-hidden="true"><Mail size={17} /></span>
            <span>
              <strong>Business contact</strong>
              <small>{member.managementEmail}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        ) : null}

        {socialLinks.length ? (
          <div className={styles.connectedAccounts} aria-label={`${channel.host} official platform profiles`}>
            <p className={styles.officialProfilesLabel}>Official profiles</p>
            {socialLinks.map((social) => (
              <a
                key={`${social.platform}:${social.url}`}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.connectedAccount}
                aria-label={`Open ${CHANNEL_SOCIAL_LABEL[social.platform]} ${social.label ?? social.handle ?? "official profile"}`}
              >
                <ChannelSocialAvatar social={social} />
                <span className={styles.connectedAccountCopy}>
                  <strong>{CHANNEL_SOCIAL_LABEL[social.platform]}</strong>
                  <small>Official profile · {social.label ?? social.handle ?? channel.host}</small>
                </span>
                <ChevronRight size={15} aria-hidden />
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <CreatorPlatformRails
        channelName={channel.memberSlug === null ? GROUP.name : channel.host}
        items={nonXHubItems}
        sources={nonXSourceDescriptors}
        onPlay={playSourceItem}
      />

      {xCommunityUrl ? (
        <section className={styles.xCommunitySection} aria-labelledby="channel-x-community-heading">
          <div className={styles.xCommunityIntro}>
            <span className={styles.eyebrow}>X Community</span>
            <h2 id="channel-x-community-heading">Join {channel.host}&apos;s Community on X</h2>
            <p>Connect with the community directly on X.</p>
          </div>
          <a
            href={xCommunityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.xCommunityLink}
          >
            Join X Community <ExternalLink aria-hidden="true" />
          </a>
        </section>
      ) : null}

      <div className={styles.xOwnerPosts}>
        {ownerXPosts.length ? (
          <XTweetsRail
            items={ownerXPosts}
            title={channel.memberSlug === null ? "Official CORE posts on X" : `${channel.host}'s posts on X`}
            maxItems={8}
          />
        ) : null}
        <div className={styles.xArchiveActions}>
          <Link href={`/channels/${channel.slug}/x` as Route} className={styles.profileLink}>
            Browse X post archive
            <ChevronRight aria-hidden="true" />
          </Link>
        </div>
      </div>

    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Captions,
  ChevronDown,
  ChevronUp,
  Info,
  LayoutGrid,
  ListVideo,
  Maximize,
  MessageSquareText,
  Pause as PauseIcon,
  PanelRightClose,
  PanelRightOpen,
  Play as PlayIcon,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayer, type PlayerAiringContext } from "@/components/providers/PlayerProvider";
import { contentShape, embedFor, type Playable } from "@/lib/watch/playable";
import { acknowledgeContentAdvisory, hasAcknowledgedContentAdvisory } from "@/lib/watch/content-advisory";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useMyList } from "@/hooks/useMyList";
import { useSubscription } from "@/hooks/useSubscription";
import { MEMBERS } from "@/lib/members";
import { AUTOPLAY_MODES } from "@/lib/watch/workspace";
import { formatDisplayLabel, formatHandleDisplay } from "@/lib/watch/display-label";
import { usePlaybackHandoff, type PlaybackHandoff } from "@/hooks/usePlaybackHandoff";
import { PlayerAmbientBloom } from "@/components/watch/PlayerAmbientBloom";
import { PlayerNetworkWatermark } from "@/components/watch/PlayerNetworkWatermark";
import { TwitchSubscribeCta } from "@/components/watch/TwitchSubscribeCta";
import { YouTubeSubscribeCta } from "@/components/watch/YouTubeSubscribeCta";
import { OnScreenIdentityOverlay } from "@/components/watch/OnScreenIdentityOverlay";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { useWatchContextMenu } from "@/components/watch/WatchContextMenu";
import {
  beginCinematicTransition,
  hasNetworkTuningAudio,
  skipNetworkTuningAudio,
  waitForNetworkTuningAudio,
} from "@/components/watch/CinematicRouteTransition";
import { TheaterNetworkGuide } from "@/components/watch/TheaterNetworkGuide";
import { ChatDock } from "@/components/live/chat";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { useBrowserTimeZone, type BrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import {
  youtubeCaptionCommands,
  type YouTubePlayerCommand,
} from "@/lib/watch/youtube-player";
import {
  movePlayerCompanionView,
  normalizePlayerCompanionView,
  playerCompanionViews,
  isCoreControlledTwitchLivePlayback,
  isGuideLiveTwitchPlayback,
  twitchLiveChatLogin,
} from "@/lib/watch/player-companion";
import { previewVolumeRamp } from "@/lib/watch/preview-audio";
import { redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import { useWatchDiscovery } from "@/lib/watch/discovery-state";
import {
  autoplayCountdownSeconds,
  isShortFormNavigationItem,
  shortFormPreloadBudget,
} from "@/lib/watch/short-form-navigation";
import {
  shouldStartFullPlayerMuted,
  shouldUpgradeTwitchLiveAutoplay,
  withTwitchAutoplayPermissions,
} from "@/lib/watch/player-autoplay";
import {
  clampLiveDvrPosition,
  liveDvrBehindSeconds,
  liveDvrProgressPercent,
  shouldEnterLiveDvr,
  twitchLiveDvrWindowSeconds,
} from "@/lib/watch/live-dvr";
import {
  WATCH_PLAYBACK_CONTROL_EVENT,
  WATCH_PLAYBACK_STATE_EVENT,
  type WatchPlaybackControlDetail,
  type WatchPlaybackStateDetail,
} from "@/lib/watch-together/player-events";

type TwitchInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seek?: (seconds: number) => void;
  setMuted?: (muted: boolean) => void;
  getMuted?: () => boolean;
  getVolume?: () => number;
  setVolume?: (volume: number) => void;
  getQualities?: () => Array<
    | string
    | {
        group?: unknown;
        name?: unknown;
        isDefault?: unknown;
      }
  >;
  getQuality?: () => string;
  setQuality?: (quality: string) => void;
  isPaused?: () => boolean;
  play?: () => void;
  pause?: () => void;
  destroy?: () => void;
  enableCaptions?: () => void;
  disableCaptions?: () => void;
};

type RemotePlaybackLike = {
  prompt: () => Promise<void>;
};

type DeviceVideo = HTMLVideoElement & {
  remote?: RemotePlaybackLike;
  webkitShowPlaybackTargetPicker?: () => void;
};

type ShortFormNetworkConnection = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (name: "change", listener: EventListener) => void;
  removeEventListener?: (name: "change", listener: EventListener) => void;
};

type ShortFormNavigator = Navigator & {
  connection?: ShortFormNetworkConnection;
  deviceMemory?: number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type TwitchApi = {
  Player: {
    new (id: string, options: Record<string, unknown>): TwitchInstance;
    READY: string;
    PLAYING: string;
    PAUSE: string;
    ENDED: string;
    OFFLINE: string;
    PLAYBACK_BLOCKED: string;
  };
};

let twitchScript: Promise<TwitchApi> | null = null;

function loadTwitch(): Promise<TwitchApi> {
  if (twitchScript) return twitchScript;
  const pending = new Promise<TwitchApi>((resolve, reject) => {
    const known = (window as typeof window & { Twitch?: TwitchApi }).Twitch;
    if (known?.Player) {
      resolve(known);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://player.twitch.tv/js/embed/v1.js"]');
    const script = existing ?? document.createElement("script");
    const fail = (message: string) => {
      script.remove();
      reject(new Error(message));
    };
    const done = () => {
      const api = (window as typeof window & { Twitch?: TwitchApi }).Twitch;
      if (api?.Player) resolve(api);
      else fail("twitch_player_unavailable");
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => fail("twitch_script_failed"), { once: true });
    if (!existing) {
      script.src = "https://player.twitch.tv/js/embed/v1.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  twitchScript = pending;
  void pending.catch(() => {
    if (twitchScript === pending) twitchScript = null;
  });
  return pending;
}

function TwitchMedia({
  item,
  onEnded,
  onPlaying,
  onPaused,
  onProgress,
  onError,
  onStartRequired,
  onReady,
  resumeAt,
  resumeOwner,
  startMuted = false,
  customControls = false,
}: {
  item: Playable;
  onEnded: () => void;
  onPlaying: () => void;
  onPaused: () => boolean;
  onProgress: (position: number, duration: number) => void;
  onError: () => void;
  onStartRequired: () => void;
  onReady: (instance: TwitchInstance | null) => void;
  resumeAt: number;
  resumeOwner: string;
  startMuted?: boolean;
  customControls?: boolean;
}) {
  const reactId = useId();
  const id = `core-twitch-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const handlersRef = useRef({ onEnded, onPlaying, onPaused, onProgress, onError, onStartRequired, onReady });
  const resumeRef = useRef({ resumeAt, resumeOwner });
  const instanceRef = useRef<TwitchInstance | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const interactionModeRef = useRef({ customControls });
  const resumedOwnerRef = useRef("");
  const readyRef = useRef(false);
  interactionModeRef.current = { customControls };
  handlersRef.current = { onEnded, onPlaying, onPaused, onProgress, onError, onStartRequired, onReady };
  resumeRef.current = { resumeAt, resumeOwner };

  const syncProviderInteraction = useCallback(() => {
    const iframe = mountRef.current?.querySelector("iframe");
    if (!iframe) return;
    iframe.setAttribute("allow", withTwitchAutoplayPermissions(iframe.getAttribute("allow")));
    iframe.setAttribute("allowfullscreen", "");
    const { customControls: ownsControls } = interactionModeRef.current;
    // CORE owns the interactive surface for full-screen Twitch playback. A
    // provider-level Play card can otherwise sit above our controls, swallow
    // its click, and leave viewers unable to start the stream themselves.
    const inert = ownsControls;
    if (inert) {
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.pointerEvents = "none";
      return;
    }
    iframe.tabIndex = 0;
    iframe.removeAttribute("aria-hidden");
    iframe.style.pointerEvents = "auto";
  }, []);

  useEffect(() => {
    syncProviderInteraction();
  }, [customControls, syncProviderInteraction]);

  useEffect(() => {
    let disposed = false;
    let instance: TwitchInstance | null = null;
    let interval = 0;
    let playbackStarted = false;
    let observer: MutationObserver | null = null;
    let startRequiredTimer = 0;
    let readyFallbackTimer = 0;
    let pauseHealthTimer = 0;
    let manualPause = false;
    let lastObservedPosition = -1;
    const autoplayTimers: number[] = [];
    void loadTwitch()
      .then((api) => {
        if (disposed) return;
        const options: Record<string, unknown> = {
          width: "100%",
          height: "100%",
          parent: [window.location.hostname],
          autoplay: true,
          muted: startMuted,
        };
        if (item.kind === "live" && item.twitchLogin) options.channel = item.twitchLogin;
        else if (item.vodId) options.video = item.vodId.startsWith("v") ? item.vodId : `v${item.vodId}`;
        else throw new Error("missing_twitch_source");
        instance = new api.Player(id, options);
        instanceRef.current = instance;
        // If the provider never reaches READY, leave a route back to its own
        // visible controls. This is intentionally not a fatal error: iframe
        // boot can be delayed by Twitch-side interstitials.
        readyFallbackTimer = window.setTimeout(() => {
          if (!disposed && !playbackStarted && !readyRef.current) {
            // Muted playback is allowed to keep waiting for a delayed Twitch
            // boot. Do not turn a slow provider mount into a second Play
            // prompt; CORE is responsible for the only intentional pause.
            if (!startMuted) handlersRef.current.onStartRequired();
          }
        }, 18_000);
        if (mountRef.current) {
          observer = new MutationObserver(syncProviderInteraction);
          observer.observe(mountRef.current, { childList: true, subtree: true });
          syncProviderInteraction();
        }
        const requestAutoplay = () => {
          if (!startMuted || disposed || playbackStarted || manualPause) return;
          try {
            instance?.setMuted?.(true);
            instance?.play?.();
          } catch {
            // Twitch keeps its own visible Play control as the fallback.
          }
        };
        const scheduleMutedRecovery = (delay: number) => {
          window.clearTimeout(startRequiredTimer);
          startRequiredTimer = window.setTimeout(() => {
            if (disposed || playbackStarted || !readyRef.current || manualPause) return;
            try {
              // A player that has not sent PLAYING but reports itself active
              // is still settling an ad or a provider transition. Keep the
              // CORE UI active and check again instead of exposing provider
              // controls or abandoning muted autoplay.
              if (instance?.isPaused?.() === false) {
                scheduleMutedRecovery(1_500);
                return;
              }
            } catch {
              // Some Twitch states do not expose isPaused yet.
            }
            requestAutoplay();
            scheduleMutedRecovery(3_000);
          }, delay);
        };
        const markPlaybackStarted = () => {
          if (playbackStarted) return;
          playbackStarted = true;
          manualPause = false;
          for (const timer of autoplayTimers) window.clearTimeout(timer);
          window.clearTimeout(startRequiredTimer);
          window.clearTimeout(readyFallbackTimer);
          handlersRef.current.onPlaying();
        };
        const handleProviderPause = () => {
          if (!playbackStarted) return;
          playbackStarted = false;
          const shouldRecover = handlersRef.current.onPaused();
          if (!shouldRecover) {
            manualPause = true;
            return;
          }
          if (!startMuted) return;
          manualPause = false;
          // Twitch can briefly report PLAYING and then pause again while an ad,
          // quality handoff, or audience gate settles. A manual CORE pause has
          // already cleared the parent's play intent and returns false above.
          // Keep retrying muted playback for unexpected provider pauses; do
          // not let an arbitrary retry cap leave the room stopped.
          for (const delay of [120, 650, 1_800]) {
            autoplayTimers.push(window.setTimeout(requestAutoplay, delay));
          }
          scheduleMutedRecovery(5_500);
        };
        if (startMuted) {
          for (const delay of [400, 1_000, 2_000, 3_500, 5_500, 7_500]) {
            autoplayTimers.push(window.setTimeout(requestAutoplay, delay));
          }
        }
        instance.addEventListener(api.Player.READY, () => {
          readyRef.current = true;
          window.clearTimeout(readyFallbackTimer);
          handlersRef.current.onReady(instance);
          syncProviderInteraction();
          if (startMuted) {
            requestAutoplay();
            for (const delay of [250, 750, 1_500]) {
              autoplayTimers.push(window.setTimeout(requestAutoplay, delay));
            }
            // Start the recovery loop only after Twitch confirms the player
            // is ready. Network, ad, and mature-content gates can all take
            // longer than a fixed mount-time timeout without being failures.
            scheduleMutedRecovery(12_000);
          }
          const resume = resumeRef.current;
          if (!instance?.seek || !resume.resumeOwner || resumedOwnerRef.current === resume.resumeOwner) return;
          try {
            instance.seek(Math.max(0, resume.resumeAt));
            resumedOwnerRef.current = resume.resumeOwner;
          } catch {
            // Live channels are not seekable.
          }
        });
        instance.addEventListener(api.Player.PLAYING, () => {
          markPlaybackStarted();
          window.clearTimeout(pauseHealthTimer);
          pauseHealthTimer = window.setTimeout(() => {
            try {
              if (playbackStarted && instance?.isPaused?.() === true) handleProviderPause();
            } catch {
              // The PAUSE event remains the authoritative fallback.
            }
          }, 900);
        });
        if (api.Player.PAUSE) {
          instance.addEventListener(api.Player.PAUSE, handleProviderPause);
        }
        instance.addEventListener(api.Player.ENDED, () => handlersRef.current.onEnded());
        instance.addEventListener(api.Player.OFFLINE, () => handlersRef.current.onEnded());
        instance.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (startMuted) {
            // Twitch can emit this before READY has fully settled. Keep
            // retrying muted playback; an audible retry would be blocked by
            // browser policy again.
            requestAutoplay();
            autoplayTimers.push(window.setTimeout(requestAutoplay, 750));
            if (readyRef.current) scheduleMutedRecovery(3_500);
            return;
          }
          // PLAYBACK_BLOCKED does not identify a browser policy failure. It
          // also fires for Twitch-owned interstitials and audience gates, so
          // expose the provider surface without reporting a playback error.
          handlersRef.current.onStartRequired();
        });
        interval = window.setInterval(() => {
          if (!instance) return;
          try {
            const position = instance.getCurrentTime();
            handlersRef.current.onProgress(position, instance.getDuration());
            const positionAdvanced = lastObservedPosition >= 0 && position > lastObservedPosition + 0.25;
            lastObservedPosition = position;
            if (positionAdvanced && !playbackStarted) markPlaybackStarted();

            if (!startMuted || !readyRef.current || manualPause) return;
            const paused = instance.isPaused?.();
            if (paused === false) {
              // Twitch occasionally misses PLAYING while an ad or quality
              // handoff is settling. The SDK's live paused state (or advancing
              // clock above) is enough to keep CORE's controls in sync.
              markPlaybackStarted();
              return;
            }
            if (paused === true && playbackStarted) {
              handleProviderPause();
              return;
            }
            if (paused === true) {
              requestAutoplay();
              scheduleMutedRecovery(3_000);
            }
          } catch {
            // The Twitch iframe may be between media sessions.
          }
        }, 1_000);
      })
      .catch(() => handlersRef.current.onError());
    return () => {
      disposed = true;
      instanceRef.current = null;
      handlersRef.current.onReady(null);
      readyRef.current = false;
      observer?.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(startRequiredTimer);
      window.clearTimeout(readyFallbackTimer);
      window.clearTimeout(pauseHealthTimer);
      for (const timer of autoplayTimers) window.clearTimeout(timer);
      try {
        instance?.pause?.();
        instance?.destroy?.();
      } catch {
        // Twitch owns its iframe lifecycle.
      }
    };
  }, [customControls, id, item.key, item.kind, item.twitchLogin, item.vodId, startMuted, syncProviderInteraction]);

  useEffect(() => {
    if (!resumeOwner || resumedOwnerRef.current === resumeOwner) return;
    const instance = instanceRef.current;
    if (!readyRef.current || !instance?.seek) return;
    try {
      instance.seek(Math.max(0, resumeAt));
      resumedOwnerRef.current = resumeOwner;
    } catch {
      // Live channels and not-yet-ready VODs may reject seeking.
    }
  }, [resumeAt, resumeOwner]);

  return (
    <div
      ref={mountRef}
      id={id}
      aria-hidden={customControls ? true : undefined}
      className={`absolute inset-0 h-full w-full ${customControls ? "pointer-events-none" : ""}`}
    />
  );
}

function analytics(event: string, item: Playable, extra?: Record<string, unknown>) {
  const target = window as typeof window & { dataLayer?: unknown[] };
  target.dataLayer?.push({
    event,
    watch_key: item.key,
    watch_kind: item.kind,
    watch_platform: item.platform,
    watch_member: item.memberSlug,
    ...extra,
  });
}

function progressRef(item: Playable) {
  return item.key || item.youtubeId || item.vodId || item.twitchLogin || "";
}

/** Official embeds that do not expose playback events to the parent page. */
function usesVisibleTimeProxy(item: Playable) {
  return item.platform === "instagram" || (item.kind === "clip" && item.clipSrc === "twitch");
}

function polishedLabel(value: string) {
  return formatDisplayLabel(value);
}

function playbackClock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function playbackRateLabel(rate: number) {
  if (Number.isInteger(rate)) return `${rate.toFixed(1)}×`;
  return `${rate.toFixed(2).replace(/0$/, "")}×`;
}

function PlayerSettingToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-14 w-full items-center gap-3 px-3 text-left outline-focus-ring transition duration-100 ease-linear first:rounded-t-xl last:rounded-b-xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
        disabled
          ? "cursor-not-allowed opacity-45"
          : "cursor-pointer hover:bg-white/[0.055] active:bg-white/[0.075]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-white/85">{label}</span>
        <span className="mt-0.5 block truncate text-[9px] text-white/38">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
          checked ? "bg-[#ef3b8f] ring-[#ef3b8f]" : "bg-white/10 ring-white/12"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function postYouTubePlayerCommands(target: Window, commands: YouTubePlayerCommand[]) {
  for (const command of commands) {
    target.postMessage(
      JSON.stringify({ event: "command", func: command.func, args: command.args }),
      "*",
    );
  }
}

function syncNativeCaptionTracks(
  media: HTMLVideoElement,
  enabled: boolean,
  configuredTracks: Playable["captions"],
) {
  const configuredDefault = Math.max(
    0,
    configuredTracks?.findIndex((track) => track.default) ?? -1,
  );
  let captionIndex = 0;
  for (let index = 0; index < media.textTracks.length; index += 1) {
    const track = media.textTracks[index];
    if (!track || (track.kind !== "captions" && track.kind !== "subtitles")) continue;
    track.mode = enabled && captionIndex === configuredDefault ? "showing" : "disabled";
    captionIndex += 1;
  }
}

function guideDay(value: number, viewerTime: BrowserTimeZone) {
  return new Intl.DateTimeFormat(viewerTime.locale, {
    timeZone: viewerTime.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function guideTime(value: number, viewerTime: BrowserTimeZone) {
  return new Intl.DateTimeFormat(viewerTime.locale, {
    timeZone: viewerTime.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function guideTimeZone(value: number, viewerTime: BrowserTimeZone) {
  const parts = new Intl.DateTimeFormat(viewerTime.locale, {
    timeZone: viewerTime.timeZone,
    timeZoneName: "short",
  }).formatToParts(value);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? viewerTime.timeZone;
}

function airingTimeLabel(airing: PlayerAiringContext, viewerTime: BrowserTimeZone): string | null {
  const startsAt = Date.parse(airing.startsAt);
  if (!Number.isFinite(startsAt)) return null;
  const day = guideDay(startsAt, viewerTime);
  const start = guideTime(startsAt, viewerTime);
  const point = `${day} · ${start} ${guideTimeZone(startsAt, viewerTime)}`;
  // Provider live state is open ended. A schedule forecast may still be
  // attached by an older channel session, but it is never a reliable stream
  // ending and must not leak into the player metadata.
  if (airing.status === "live") return `Live now · Started ${point}`;
  if (!airing.continuous && airing.status === "published") return `Posted ${point}`;
  const parsedEnd = airing.endsAt ? Date.parse(airing.endsAt) : NaN;
  const endsAt = Number.isFinite(parsedEnd) && parsedEnd > startsAt ? parsedEnd : null;
  const span = endsAt === null
    ? point
    : guideDay(endsAt, viewerTime) === day
      ? `${day} · ${start}–${guideTime(endsAt, viewerTime)} ${guideTimeZone(endsAt, viewerTime)}`
      : `${day} · ${start}–${guideDay(endsAt, viewerTime)} · ${guideTime(endsAt, viewerTime)} ${guideTimeZone(endsAt, viewerTime)}`;

  if (airing.continuous) return `Airing ${span}`;
  if (airing.status === "upcoming") return `Airs ${span}`;
  if (airing.status === "replay") return `Aired ${span}`;
  return `Posted ${point}`;
}

const CONTROL_FEEDBACK =
  "cursor-pointer transition-[background-color,color,box-shadow,transform,opacity] duration-100 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";
const CONTROL_HOVER =
  "hover:bg-white/10 hover:text-white hover:ring-white/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.24)]";
const PRIMARY_CONTROL_HOVER =
  "hover:bg-white/90 hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)]";
const PLAYER_RETURN_PATH = "core-player-return-path:v1";

function PlatformMark({ item }: { item: Playable }) {
  if (["youtube", "twitch", "tiktok", "instagram", "x"].includes(item.platform)) {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm">
        <SocialIcon platform={item.platform as "youtube" | "twitch" | "tiktok" | "instagram" | "x"} size={12} />
      </span>
    );
  }
  return (
    <span aria-label="CORE" className="grid size-6 place-items-center rounded-full bg-[#ef233c] text-[8px] font-black tracking-[-0.04em] text-white ring-1 ring-white/25">
      C
    </span>
  );
}

function theaterHrefFor(item: Playable) {
  const kind = item.kind === "post" ? "clip" : item.kind;
  const reference = item.youtubeId ?? item.vodId ?? item.clipId ?? item.key;
  const query = new URLSearchParams({
    kind,
    id: reference,
    ref: item.key,
    title: item.title,
  });
  if (item.memberSlug) query.set("slug", item.memberSlug);
  if (item.twitchLogin) query.set("login", item.twitchLogin);
  if (item.format) query.set("format", item.format);
  if (item.orientation) query.set("orientation", item.orientation);
  if (item.dvr?.twitchVodId) {
    query.set("dvr", item.dvr.twitchVodId);
    if (Number.isFinite(item.dvr.windowSeconds) && (item.dvr.windowSeconds ?? 0) > 0) {
      query.set("dvrWindow", String(Math.round(item.dvr.windowSeconds!)));
    }
  }
  query.set("src", item.clipSrc ?? item.platform);
  const url = item.sourceUrl ?? item.url ?? item.mediaUrl;
  if (url) query.set("url", url);
  // Preserve the verified artwork when a social photo is expanded from a
  // shelf. Provider pages are deliberately opaque, so the Theater can show a
  // complete in-app photo immediately and still offer the canonical post.
  if (item.poster) query.set("poster", item.poster);
  if (item.mediaUrl) query.set("media", item.mediaUrl);
  return `/theater?${query.toString()}`;
}

function preferredNativeSource(
  item: Playable,
  preference: "auto" | "best" | "balanced" | "data-saver",
  described: boolean,
) {
  const playableUrl = (value?: string) => Boolean(value && (value.startsWith("https://") || value.startsWith("/")));
  if (described && playableUrl(item.audioDescriptionUrl)) return item.audioDescriptionUrl;
  const sources = item.qualities?.filter((source) => playableUrl(source.src)) ?? [];
  if (!sources.length || preference === "auto") return item.mediaUrl;
  const sorted = [...sources].sort((a, b) => (a.width ?? a.bitrate ?? 0) - (b.width ?? b.bitrate ?? 0));
  if (preference === "data-saver") return sorted[0]?.src ?? item.mediaUrl;
  if (preference === "best") return sorted.at(-1)?.src ?? item.mediaUrl;
  return [...sorted].reverse().find((source) => (source.width ?? 0) <= 1_280)?.src
    ?? sorted[Math.floor(sorted.length / 2)]?.src
    ?? item.mediaUrl;
}

function HandoffPrompt({
  snapshot,
  onContinue,
  onDismiss,
}: {
  snapshot: PlaybackHandoff;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="fixed right-3 top-[4.5rem] z-[96] w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-[#121216]/95 p-3 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl" aria-label="Continue playback">
      <div className="flex gap-3">
        {snapshot.item.poster ? (
          <img src={snapshot.item.poster} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff5364]">
            Continue from {snapshot.deviceLabel}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold">{snapshot.item.title}</p>
          <p className="mt-1 text-[11px] text-white/45">Resume at {playbackClock(snapshot.positionSeconds)}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onContinue} className={`min-h-10 flex-1 rounded-xl bg-white px-3 text-xs font-semibold text-black ${CONTROL_FEEDBACK} ${PRIMARY_CONTROL_HOVER}`}>
          Continue here
        </button>
        <button type="button" onClick={onDismiss} className={`min-h-10 rounded-xl px-3 text-xs text-white/65 ring-1 ring-white/15 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}>
          Not now
        </button>
      </div>
    </aside>
  );
}

export function PersistentPlayer() {
  const path = usePathname();
  const router = useRouter();
  const player = usePlayer();
  const contextMenu = useWatchContextMenu();
  const viewerTime = useBrowserTimeZone();
  const {
    current,
    queue,
    nextUp,
    history,
    channel,
    seekRequest,
    autoplay,
    autoplayMode,
    previewAutoplay,
    activePreviewAudioId,
    showChatTimestamps,
    dataSaver,
    ambientLighting,
    captionsEnabled,
    playbackRate,
    qualityPreference,
    audioDescription,
    accessibilityPreset,
    mode,
    queueOpen,
    companionView,
    shortFormNavigation,
    shortFormPreloads,
    navigateShortForm,
    skip,
    previous,
    stop,
    minimize,
    expand,
    requestSeek,
    setAutoplay,
    setAutoplayMode,
    setPreviewAutoplay,
    setDataSaver,
    setAmbientLighting,
    setCaptionsEnabled,
    setPlaybackRate,
    setQualityPreference,
    setAudioDescription,
    applyAccessibilityPreset,
    setQueueOpen,
    setCompanionView,
    removeFromQueue,
    playFromQueue,
    refill,
    play,
    addTile,
  } = player;
  const handoff = usePlaybackHandoff();
  const { data: live } = useLiveStatus();
  const {
    map,
    trackTick,
    checkpoint,
    markComplete,
    markWatched,
    ready: progressReady,
    accountKey,
  } = useWatchProgress();
  const { ids: dvrIds, loading: dvrLoading, user: dvrUser } = useMyList();
  const subscription = useSubscription();
  const discovery = useWatchDiscovery();
  const [parent, setParent] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [twitchStartRequired, setTwitchStartRequired] = useState(false);
  const [livePrompt, setLivePrompt] = useState<(NonNullable<typeof live>["live"][number]) | null>(null);
  const [playbackSettingsOpen, setPlaybackSettingsOpen] = useState(false);
  const [uiPosition, setUiPosition] = useState(0);
  const [uiDuration, setUiDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [twitchDvrActive, setTwitchDvrActive] = useState(false);
  const [twitchDvrStartSeconds, setTwitchDvrStartSeconds] = useState(0);
  const [liveDvrPreviewSeconds, setLiveDvrPreviewSeconds] = useState(0);
  const [twitchReadyToken, setTwitchReadyToken] = useState(0);
  const [twitchQualities, setTwitchQualities] = useState<Array<{ id: string; label: string; isDefault: boolean }>>([]);
  const [twitchQuality, setTwitchQuality] = useState("auto");
  const [touchControlsVisible, setTouchControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [guideDetailsCollapsed, setGuideDetailsCollapsed] = useState(false);
  const [guideMenuOpen, setGuideMenuOpen] = useState(false);
  const [contentAdvisoryReady, setContentAdvisoryReady] = useState(false);
  const [waitingForTuningAudio, setWaitingForTuningAudio] = useState(false);
  const [playerStageShellHeight, setPlayerStageShellHeight] = useState<number | null>(null);
  const [pagePointerInside, setPagePointerInside] = useState(true);
  const [shortFormIdleWarmupReady, setShortFormIdleWarmupReady] = useState(false);
  const [shortFormNetwork, setShortFormNetwork] = useState<{
    saveData: boolean;
    effectiveType: string | null;
    deviceMemoryGb: number | null;
  }>({ saveData: false, effectiveType: null, deviceMemoryGb: null });
  const [nativeCapabilities, setNativeCapabilities] = useState({
    pip: false,
    remote: false,
    airplay: false,
    dvr: false,
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const contentAdvisoryAudioRef = useRef<HTMLAudioElement | null>(null);
  const playerSectionRef = useRef<HTMLElement | null>(null);
  const playerStageShellRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const companionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const guideDetailsCollapseRef = useRef<HTMLButtonElement | null>(null);
  const guideDetailsRestoreRef = useRef<HTMLButtonElement | null>(null);
  const twitchPlayerRef = useRef<TwitchInstance | null>(null);
  const twitchDvrActiveRef = useRef(false);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const playingRef = useRef(false);
  const endingRef = useRef(false);
  const resumeOwnerRef = useRef("");
  const seenLiveRef = useRef<Set<string> | null>(null);
  const currentKeyRef = useRef<string | null>(null);
  const queueRefillRequestedRef = useRef<string | null>(null);
  const previousPathRef = useRef(path);
  const progressMapRef = useRef(map);
  const controlsHideTimerRef = useRef<number | null>(null);
  const shortWheelDeltaRef = useRef(0);
  const shortWheelResetTimerRef = useRef<number | null>(null);
  const shortWheelLockUntilRef = useRef(0);
  const shortKeyLockUntilRef = useRef(0);
  const youtubeVolumeRef = useRef(1);
  const volumeItemKeyRef = useRef<string | null>(null);
  const previewDuckTimersRef = useRef<Set<number>>(new Set());
  const previewDuckRef = useRef<{
    itemKey: string;
    provider: "native" | "youtube" | "twitch";
    originalVolume: number;
    wasMuted: boolean;
  } | null>(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(
        playerSectionRef.current
        && document.fullscreenElement === playerSectionRef.current,
      ));
    };
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const startContentAdvisory = useCallback(() => {
    const audio = contentAdvisoryAudioRef.current;
    if (!audio) return;
    void audio.play().catch(() => {
      // Audible media cannot begin until a direct viewer gesture in many
      // browsers. The visual advisory is still shown briefly, but never make
      // a viewer click through a failed audio autoplay attempt before the
      // provider can begin its own muted autoplay path.
      window.setTimeout(() => setContentAdvisoryReady(true), 1_400);
    });
  }, []);

  useEffect(() => {
    if (!current) {
      setContentAdvisoryReady(true);
      setWaitingForTuningAudio(false);
      return;
    }
    if (hasAcknowledgedContentAdvisory()) {
      setContentAdvisoryReady(true);
      setWaitingForTuningAudio(false);
      return;
    }
    // Count the warning when it is presented, rather than when audio happens
    // to finish. This keeps it from replaying on later visits as well.
    acknowledgeContentAdvisory();
    const hasTuningAudio = hasNetworkTuningAudio();
    setContentAdvisoryReady(false);
    setWaitingForTuningAudio(hasTuningAudio);
    let disposed = false;
    let audio: HTMLAudioElement | null = null;
    const beginAfterTuning = async () => {
      // The network stinger is an intentional part of tuning in. Do not let
      // the spoken age warning overlap it; the second message begins only
      // once DJ Cora ends or the viewer uses the Skip control.
      await waitForNetworkTuningAudio();
      if (disposed) return;
      setWaitingForTuningAudio(false);
      audio = new Audio("/brand/content-advisory.mp3");
      audio.preload = "auto";
      contentAdvisoryAudioRef.current = audio;
      const complete = () => {
        setContentAdvisoryReady(true);
      };
      audio.addEventListener("ended", complete, { once: true });
      audio.addEventListener("error", complete, { once: true });
      startContentAdvisory();
    };
    void beginAfterTuning();
    return () => {
      disposed = true;
      setWaitingForTuningAudio(false);
      audio?.pause();
      if (audio && contentAdvisoryAudioRef.current === audio) contentAdvisoryAudioRef.current = null;
    };
  }, [current?.key, startContentAdvisory]);

  useEffect(() => {
    setGuideDetailsCollapsed(false);
  }, [current?.key, channel?.airing?.startsAt]);
  const theaterPage = path.startsWith("/theater");
  const shortsPage = path.startsWith("/shorts");
  const playerPage = theaterPage || shortsPage;
  const previousPlayerPageRef = useRef(playerPage);
  const playerPageSidebarInitializedRef = useRef<string | null>(null);
  const guideLivePlayback = isGuideLiveTwitchPlayback(current, channel);
  const shortFormTheaterNavigation = Boolean(
    current
      && shortFormNavigation
      && (playerPage || mode === "theater")
      && contentShape(current) === "portrait",
  );

  useEffect(() => {
    const browserNavigator = navigator as ShortFormNavigator;
    const connection = browserNavigator.connection;
    const updateNetworkHints = () => {
      setShortFormNetwork({
        saveData: Boolean(connection?.saveData),
        effectiveType: connection?.effectiveType ?? null,
        deviceMemoryGb: typeof browserNavigator.deviceMemory === "number"
          ? browserNavigator.deviceMemory
          : null,
      });
    };
    updateNetworkHints();
    connection?.addEventListener?.("change", updateNetworkHints);
    return () => connection?.removeEventListener?.("change", updateNetworkHints);
  }, []);

  useEffect(() => {
    if (!shortFormTheaterNavigation || dataSaver || qualityPreference === "data-saver") {
      setShortFormIdleWarmupReady(false);
      return;
    }

    // Mount the next provider immediately. Let the active player finish its
    // critical boot work before adding a second hidden provider document.
    const browserWindow = window as IdleWindow;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const cancelPendingWarmup = () => {
      if (idleHandle !== null) browserWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      idleHandle = null;
      timeoutHandle = null;
    };
    const finishWarmup = () => {
      idleHandle = null;
      timeoutHandle = null;
      if (document.visibilityState === "visible") setShortFormIdleWarmupReady(true);
    };
    const scheduleWarmup = () => {
      cancelPendingWarmup();
      if (document.visibilityState !== "visible") return;
      if (browserWindow.requestIdleCallback) {
        idleHandle = browserWindow.requestIdleCallback(finishWarmup, { timeout: 1_200 });
      } else {
        timeoutHandle = window.setTimeout(finishWarmup, 600);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleWarmup();
      else cancelPendingWarmup();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleWarmup();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelPendingWarmup();
    };
  }, [dataSaver, qualityPreference, shortFormTheaterNavigation]);

  const autoplayIntentRef = useRef<{ itemKey: string; muted: boolean } | null>(null);
  if (current && autoplayIntentRef.current?.itemKey !== current.key) {
    // Capture the initial intent per title. Keeping this stable prevents a
    // mini player from being destroyed/recreated when it expands or returns.
    autoplayIntentRef.current = {
      itemKey: current.key,
      muted: shouldStartFullPlayerMuted(mode, playerPage, guideLivePlayback),
    };
  } else if (current && shouldUpgradeTwitchLiveAutoplay({
    isTwitchLive: current.kind === "live" && current.platform === "twitch",
    mode,
    playerPage,
    guideLivePlayback,
    playing: playingRef.current,
    mutedIntent: Boolean(autoplayIntentRef.current?.muted),
  })) {
    // A paused mini player or late Guide context may reach Theater with an
    // unmuted startup intent. Upgrade once so Twitch remounts into its muted
    // autoplay path; already-playing streams remain uninterrupted.
    autoplayIntentRef.current = { itemKey: current.key, muted: true };
  }
  const autoStartMuted = Boolean(
    current
      && autoplayIntentRef.current?.itemKey === current.key
      && autoplayIntentRef.current.muted,
  );
  const routeHidden =
    path.startsWith("/multiview") ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/admin") ||
    path.startsWith("/chat");

  useEffect(() => {
    if (!playerPage || !current) return;
    // Initialize once per player destination, not once per title. Otherwise
    // closing the Shorts companion panel is undone the moment a viewer moves
    // to the next short.
    const playerPageKey = shortsPage ? "shorts" : "theater";
    if (playerPageSidebarInitializedRef.current === playerPageKey) return;
    playerPageSidebarInitializedRef.current = playerPageKey;
    setQueueOpen(true);
    setCompanionView("details");
  }, [current?.key, playerPage, setCompanionView, setQueueOpen, shortsPage]);

  useEffect(() => {
    if (!playerPage) playerPageSidebarInitializedRef.current = null;
  }, [playerPage]);

  useEffect(() => {
    // A stale blocked state must never cover the next live channel while its
    // fresh muted autoplay attempts are still in flight.
    setTwitchStartRequired(false);
  }, [current?.key, current?.kind, current?.platform]);

  useEffect(() => {
    setGuideMenuOpen(false);
  }, [current?.key]);

  useEffect(() => {
    const shell = playerStageShellRef.current;
    const playerScreenActive = mode === "theater" || playerPage;
    if (!current || !shell || !playerScreenActive || routeHidden || isFullscreen) {
      setPlayerStageShellHeight(null);
      return;
    }

    const syncHeight = () => {
      const nextHeight = Math.round(shell.getBoundingClientRect().height * 10) / 10;
      if (nextHeight <= 0) return;
      setPlayerStageShellHeight((previous) => previous === nextHeight ? previous : nextHeight);
    };

    syncHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncHeight);
    observer?.observe(shell);
    window.addEventListener("resize", syncHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [current?.key, isFullscreen, mode, playerPage, routeHidden]);

  const hidden = !current || routeHidden;
  const activeMark = current ? map[progressRef(current)] : undefined;
  const selectedNativeMedia = current
    ? preferredNativeSource(current, qualityPreference, audioDescription)
    : undefined;
  const nativeSourceSupported = Boolean(
    current?.format !== "photo" &&
      selectedNativeMedia &&
      (selectedNativeMedia.startsWith("https://") || selectedNativeMedia.startsWith("/")),
  );
  const twitchInteractive = Boolean(
    current && ((current.kind === "live" && current.twitchLogin) || current.vodId),
  );
  const chapters = current?.chapters ?? [];
  const activeChapter = chapters.find((chapter, index) => {
    const end = chapter.endSeconds ?? chapters[index + 1]?.startSeconds ?? Number.POSITIVE_INFINITY;
    return uiPosition >= chapter.startSeconds && uiPosition < end;
  });
  const introChapter = chapters.find((chapter) => chapter.kind === "intro");
  const canSkipIntro = Boolean(
    introChapter?.endSeconds &&
      uiPosition >= Math.max(0, introChapter.startSeconds - 2) &&
      uiPosition < introChapter.endSeconds,
  );
  const matchingFullVideo = current?.format === "short" && current.relatedFullVideoId
    ? [...queue, ...history].find((item) => item.youtubeId === current.relatedFullVideoId) ?? {
        key: `yt-${current.relatedFullVideoId}`,
        kind: "youtube" as const,
        platform: "youtube" as const,
        title: `Full video from ${current.memberLabel}`,
        poster: `https://i.ytimg.com/vi/${current.relatedFullVideoId}/maxresdefault.jpg`,
        memberSlug: current.memberSlug,
        memberLabel: current.memberLabel,
        accountLabel: current.accountLabel,
        youtubeId: current.relatedFullVideoId,
        twitchLogin: null,
        vodId: null,
        clipSrc: null,
        clipId: null,
        url: `https://www.youtube.com/watch?v=${current.relatedFullVideoId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${current.relatedFullVideoId}`,
        embeddable: true,
        orientation: "landscape" as const,
        format: "long" as const,
      }
    : null;
  const twitchCaptionsSupported = Boolean(
    current?.platform === "twitch"
      && ((current.kind === "live" && current.twitchLogin) || current.vodId),
  );
  const captionSupported = Boolean(
    (nativeSourceSupported && current?.captions?.length)
      || current?.youtubeId
      || twitchCaptionsSupported,
  );
  const rateSupported = Boolean(nativeSourceSupported || current?.youtubeId);
  const qualitySupported = Boolean(nativeSourceSupported && (current?.qualities?.length ?? 0) > 1);
  const audioDescriptionSupported = Boolean(
    current?.audioDescriptionUrl &&
    (current.audioDescriptionUrl.startsWith("https://") || current.audioDescriptionUrl.startsWith("/")),
  );
  const canStartOver = Boolean(current?.dvr?.enabled || nativeCapabilities.dvr);
  const liveDvrWindowDuration = twitchLiveDvrWindowSeconds(current);
  const twitchLiveDvrAvailable = liveDvrWindowDuration > 0;
  const hasActiveResumeState = Boolean(
    activeMark?.completed ||
      activeMark?.positionUpdatedAt ||
      (activeMark?.positionSeconds ?? 0) > 0,
  );

  useEffect(() => {
    if (twitchDvrActive) return;
    setLiveDvrPreviewSeconds(liveDvrWindowDuration);
  }, [current?.key, liveDvrWindowDuration, twitchDvrActive]);

  useEffect(() => {
    setParent(window.location.hostname);
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (current && autoStartMuted) setIsMuted(true);
  }, [autoStartMuted, current?.key]);

  // Full playback has a real URL. The globally mounted player stays alive
  // while navigation changes the surrounding surface, so media never restarts.
  useEffect(() => {
    if (!current || mode !== "theater" || playerPage || routeHidden) return;
    try {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      if (returnPath.startsWith("/") && !returnPath.startsWith("//")) {
        sessionStorage.setItem(PLAYER_RETURN_PATH, returnPath);
      }
    } catch {
      // Storage is optional; `/` remains the safe return destination.
    }
    const destination = theaterHrefFor(current);
    beginCinematicTransition(destination, {
      kind: "theater",
      title: current.title,
      eyebrow: current.kind === "live" ? "Lights down · connecting live" : "Lights down · preparing playback",
    });
    router.push(destination as never, { scroll: false });
  }, [current, mode, playerPage, routeHidden, router]);

  // Short-form navigation replaces the current Theater URL so reload/share
  // opens the visible Short or Reel without adding every wheel step to Back.
  useEffect(() => {
    if (!current || !theaterPage || !shortFormTheaterNavigation) return;
    const nextHref = theaterHrefFor(current);
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (currentHref === nextHref) return;
    router.replace(nextHref as never, { scroll: false });
  }, [current, router, shortFormTheaterNavigation, theaterPage]);

  // Playback follows the viewer through the app. Moving away from the page
  // where theater was opened collapses it instead of obscuring the new page.
  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = path;
    if (
      previousPath === path ||
      !current ||
      mode !== "theater" ||
      path.startsWith("/theater") ||
      path.startsWith("/shorts") ||
      path.startsWith("/multiview")
    ) return;
    minimize();
  }, [current, minimize, mode, path]);

  useEffect(() => {
    progressMapRef.current = map;
  }, [map]);

  // Keep long-form and short-form sessions supplied without waiting for the
  // final item. The API returns a bounded batch and `refill` deduplicates it
  // against the current queue/history, so requesting when five remain is
  // safe and keeps the next transition seamless.
  useEffect(() => {
    if (!current || !autoplay || channel || queue.length > 5) {
      if (queue.length > 5) queueRefillRequestedRef.current = null;
      return;
    }
    if (queueRefillRequestedRef.current === current.key) return;
    queueRefillRequestedRef.current = current.key;
    const query = new URLSearchParams({ mode: autoplayMode });
    if (current.memberSlug) query.set("member", current.memberSlug);
    query.set("platform", current.platform);
    if (current.format) query.set("format", current.format);
    void fetch(`/api/watch/queue?${query}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { items?: Playable[] }) => refill(data.items ?? []))
      .catch(() => { queueRefillRequestedRef.current = null; });
  }, [autoplay, autoplayMode, channel, current, queue.length, refill]);

  useEffect(() => {
    const nextKey = current?.key ?? null;
    if (currentKeyRef.current === nextKey) return;
    currentKeyRef.current = nextKey;
    if (volumeItemKeyRef.current !== nextKey) {
      volumeItemKeyRef.current = nextKey;
      youtubeVolumeRef.current = 1;
      previewDuckRef.current = null;
      for (const timer of previewDuckTimersRef.current) window.clearTimeout(timer);
      previewDuckTimersRef.current.clear();
    }
    setCountdown(null);
    setPlaybackError(false);
    setTwitchStartRequired(false);
    setPlaybackSettingsOpen(false);
    setCompanionView(twitchLiveChatLogin(current) ? "chat" : "up-next");
    setIsPlaying(false);
    setIsMuted(false);
    twitchDvrActiveRef.current = false;
    setTwitchDvrActive(false);
    setTwitchDvrStartSeconds(0);
    setTwitchQualities([]);
    setTwitchQuality("auto");
    setTouchControlsVisible(false);
    setNativeCapabilities({ pip: false, remote: false, airplay: false, dvr: false });
    twitchPlayerRef.current = null;
    endingRef.current = false;
    playingRef.current = false;
    if (!current) return;
    const mark = progressMapRef.current[progressRef(current)];
    positionRef.current = mark?.completed ? 0 : mark?.positionSeconds ?? 0;
    setUiPosition(positionRef.current);
    durationRef.current = mark?.durationSeconds ?? current.durationSeconds ?? 0;
    setUiDuration(durationRef.current);
    analytics("watch_start", current);
    void fetch("/api/account/presence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: current.kind === "live" ? "live_embed" : current.kind === "vod" ? "vod_play" : "video_play",
        subject: current.memberSlug ?? "house",
        ref: current.key,
      }),
    }).catch(() => {});
  }, [current, setCompanionView]);

  const seekTo = useCallback((seconds: number) => {
    if (!current || !Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    positionRef.current = target;
    setUiPosition(target);
    const media = videoRef.current;
    if (media && media.readyState >= 1) {
      const bounded = Number.isFinite(media.duration) && media.duration > 0
        ? Math.min(target, Math.max(0, media.duration - 0.25))
        : target;
      media.currentTime = bounded;
      return;
    }
    if (twitchPlayerRef.current?.seek) {
      try {
        twitchPlayerRef.current.seek(target);
        return;
      } catch {
        // Live Twitch channels commonly reject seeking.
      }
    }
    const source = iframeRef.current?.contentWindow;
    if (!source) return;
    if (current.youtubeId) {
      source.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [target, true] }), "*");
    } else if (current.platform === "tiktok") {
      source.postMessage({ "x-tiktok-player": true, type: "seekTo", value: target }, "*");
    }
  }, [current]);

  useEffect(() => {
    if (!current || !seekRequest || seekRequest.itemKey !== current.key) return;
    seekTo(seekRequest.seconds);
  }, [current, seekRequest, seekTo]);

  const handoffPreferences = useMemo(() => ({
    captionsEnabled,
    playbackRate,
    qualityPreference,
    audioDescription,
    accessibilityPreset,
  }), [accessibilityPreset, audioDescription, captionsEnabled, playbackRate, qualityPreference]);

  useEffect(() => {
    if (!current || !handoff.deviceId) return;
    const publishCurrent = () => handoff.publish({
      item: current,
      positionSeconds: positionRef.current,
      durationSeconds: durationRef.current,
      playing: playingRef.current,
      preferences: handoffPreferences,
    });
    publishCurrent();
    const interval = window.setInterval(publishCurrent, 15_000);
    window.addEventListener("pagehide", publishCurrent);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", publishCurrent);
      publishCurrent();
    };
  }, [current, handoff.deviceId, handoff.publish, handoffPreferences]);

  const availableHandoff = useMemo(() => {
    const candidate = handoff.candidate;
    if (!candidate) return null;
    if (
      candidate.item.key === current?.key &&
      candidate.positionSeconds <= uiPosition + 10
    ) return null;
    return candidate;
  }, [current?.key, handoff.candidate, uiPosition]);

  const acceptHandoff = useCallback(() => {
    const candidate = availableHandoff;
    if (!candidate) return;
    applyAccessibilityPreset(candidate.preferences.accessibilityPreset);
    setCaptionsEnabled(candidate.preferences.captionsEnabled);
    setPlaybackRate(candidate.preferences.playbackRate);
    setQualityPreference(candidate.preferences.qualityPreference);
    setAudioDescription(candidate.preferences.audioDescription);
    play(candidate.item, undefined, {
      mode: "theater",
      startAtSeconds: candidate.positionSeconds,
    });
    handoff.dismiss();
  }, [
    applyAccessibilityPreset,
    availableHandoff,
    handoff.dismiss,
    play,
    setAudioDescription,
    setCaptionsEnabled,
    setPlaybackRate,
    setQualityPreference,
  ]);

  useEffect(() => {
    if (!current || !progressReady) return;
    if (seekRequest?.itemKey === current.key) return;
    const owner = `${accountKey}:${current.key}`;
    if (resumeOwnerRef.current === owner) return;
    // Do not latch an empty/failed snapshot as the resume decision. A later
    // successful account refresh must still be able to apply its checkpoint.
    if (!hasActiveResumeState) return;
    resumeOwnerRef.current = owner;
    const resumeAt =
      activeMark && !activeMark.completed && activeMark.positionSeconds > 5
        ? activeMark.positionSeconds
        : 0;
    positionRef.current = resumeAt;
    setUiPosition(resumeAt);
    durationRef.current = activeMark?.durationSeconds || current.durationSeconds || 0;
    setUiDuration(durationRef.current);
    if (videoRef.current && videoRef.current.readyState >= 1) {
      videoRef.current.currentTime = resumeAt;
      return;
    }
    const source = iframeRef.current?.contentWindow;
    if (!source) return;
    if (current.youtubeId) {
      source.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [resumeAt, true] }),
        "*",
      );
    } else if (current.platform === "tiktok") {
      source.postMessage(
        { "x-tiktok-player": true, type: "seekTo", value: resumeAt },
        "*",
      );
    }
  }, [accountKey, activeMark, current, hasActiveResumeState, progressReady, seekRequest]);

  useEffect(() => {
    if (!current) return;
    const reference = progressRef(current);
    const interval = window.setInterval(() => {
      if (!playingRef.current) return;
      if (usesVisibleTimeProxy(current) && document.visibilityState !== "visible") return;
      const duration = durationRef.current;
      const position = positionRef.current;
      const progress =
        current.kind === "live" || duration <= 0 ? 0 : Math.min(0.99, Math.max(0, position / duration));
      trackTick(reference, current.kind, current.memberSlug, 15, progress, position, duration, current.platform);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [current, trackTick]);

  const checkpointCurrent = useCallback(() => {
    if (!current || !progressReady) return;
    const duration = durationRef.current;
    const position = positionRef.current;
    const progress =
      current.kind === "live" || duration <= 0
        ? 0
        : Math.min(0.99, Math.max(0, position / duration));
    checkpoint(
      progressRef(current),
      current.kind,
      current.memberSlug,
      progress,
      position,
      duration,
      current.platform,
    );
  }, [checkpoint, current, progressReady]);

  // Save the exact resume point even when a viewer leaves before the regular
  // 15-second tick. `keepalive` in checkpoint also lets pagehide finish it.
  useEffect(() => {
    if (!current || !progressReady) return;
    return () => checkpointCurrent();
  }, [current, progressReady, checkpointCurrent]);

  useEffect(() => {
    if (!current || !progressReady) return;
    const onPageHide = () => checkpointCurrent();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") checkpointCurrent();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [current, progressReady, checkpointCurrent]);

  const finish = useCallback(
    (reason: "ended" | "offline" | "error" = "ended") => {
    if (!current || endingRef.current || currentKeyRef.current !== current.key) return;
    endingRef.current = true;
    playingRef.current = false;
    setIsPlaying(false);
      if (reason !== "error" && current.kind !== "live") {
        markComplete(
          progressRef(current),
          current.kind,
          current.memberSlug,
          positionRef.current,
          durationRef.current,
          current.platform,
        );
      }
      analytics("watch_complete", current, { reason });
      if (!autoplay) {
        setCountdown(null);
        return;
      }
      const delay = autoplayCountdownSeconds(current, Boolean(nextUp));
      if (delay === 0 && isShortFormNavigationItem(current)) {
        setCountdown(null);
        if (!navigateShortForm("next")) skip();
        return;
      }
      setCountdown(delay);
    },
    [autoplay, current, markComplete, navigateShortForm, nextUp, skip],
  );

  useEffect(() => {
    if (!current) return;
    const opaqueEmbed = usesVisibleTimeProxy(current);
    const stillImage = current.format === "photo";
    if (!opaqueEmbed && !stillImage) return;
    durationRef.current = stillImage ? 8 : current.durationSeconds ?? 0;
    setUiDuration(durationRef.current);
    if (stillImage) {
      playingRef.current = true;
      setIsPlaying(true);
    }
    const interval = window.setInterval(() => {
      if (!playingRef.current || endingRef.current) return;
      if (document.visibilityState !== "visible") return;
      positionRef.current += 1;
      setUiPosition(positionRef.current);
      if (durationRef.current > 0 && positionRef.current >= durationRef.current) finish();
    }, 1_000);
    return () => {
      window.clearInterval(interval);
      if (stillImage || opaqueEmbed) {
        playingRef.current = false;
        setIsPlaying(false);
      }
    };
  }, [current, finish]);

  useEffect(() => () => {
    if (controlsHideTimerRef.current) window.clearTimeout(controlsHideTimerRef.current);
  }, []);

  useEffect(() => {
    const pointerGated = mode === "theater" || playerPage;
    if (!pointerGated) {
      setPagePointerInside(true);
      return;
    }

    const root = document.documentElement;
    const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    let blurFrame: number | null = null;

    const showForPointer = (event: PointerEvent) => {
      if (!finePointer.matches || event.pointerType === "mouse") setPagePointerInside(true);
    };
    const hideForPointer = (event: PointerEvent) => {
      if (finePointer.matches && event.pointerType === "mouse") setPagePointerInside(false);
    };
    const syncPointerMode = () => {
      setPagePointerInside(!finePointer.matches || root.matches(":hover"));
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") setPagePointerInside(false);
      else if (!finePointer.matches) setPagePointerInside(true);
    };
    const handleBlur = () => {
      if (!finePointer.matches) return;
      blurFrame = window.requestAnimationFrame(() => {
        blurFrame = null;
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLIFrameElement
          && playerSectionRef.current?.contains(activeElement)
        ) return;
        setPagePointerInside(false);
      });
    };

    syncPointerMode();

    root.addEventListener("pointerenter", showForPointer);
    root.addEventListener("pointermove", showForPointer);
    root.addEventListener("pointerleave", hideForPointer);
    finePointer.addEventListener("change", syncPointerMode);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);

    return () => {
      root.removeEventListener("pointerenter", showForPointer);
      root.removeEventListener("pointermove", showForPointer);
      root.removeEventListener("pointerleave", hideForPointer);
      finePointer.removeEventListener("change", syncPointerMode);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      if (blurFrame !== null) window.cancelAnimationFrame(blurFrame);
    };
  }, [mode, playerPage]);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      skip();
      return;
    }
    const timeout = window.setTimeout(() => setCountdown((value) => (value == null ? null : value - 1)), 1_000);
    return () => window.clearTimeout(timeout);
  }, [countdown, skip]);

  useEffect(() => {
    if (!autoplay) setCountdown(null);
  }, [autoplay]);

  useEffect(() => {
    if (!playbackSettingsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsTriggerRef.current?.contains(target)) return;
      setPlaybackSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [playbackSettingsOpen]);

  useEffect(() => {
    if (!playbackSettingsOpen) return;
    const frame = window.requestAnimationFrame(() => {
      settingsPanelRef.current
        ?.querySelector<HTMLButtonElement>("[data-player-settings-close]")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [playbackSettingsOpen]);

  useEffect(() => {
    if (!current || current.kind !== "live" || !current.twitchLogin || !live) return;
    const stillLive = live.live.some(
      (entry) => entry.isLive && entry.login.toLowerCase() === current.twitchLogin!.toLowerCase(),
    );
    if (!stillLive) finish("offline");
  }, [live, current, finish]);

  useEffect(() => {
    if (!live) return;
    const now = new Set(
      live.live.filter((entry) => entry.isLive).map((entry) => entry.login.toLowerCase()),
    );
    if (!seenLiveRef.current) {
      seenLiveRef.current = now;
      return;
    }
    if (current && current.kind !== "live") {
      const newlyLive = live.live.find(
        (entry) => entry.isLive && !seenLiveRef.current!.has(entry.login.toLowerCase()),
      );
      if (newlyLive) setLivePrompt(newlyLive);
    }
    seenLiveRef.current = now;
  }, [live, current]);

  useEffect(() => {
    const height = hidden || mode === "theater" ? "0px" : "8.5rem";
    document.documentElement.style.setProperty("--now-playing-h", height);
    if (mode !== "theater" || hidden) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [hidden, mode, path]);

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape" && playbackSettingsOpen) {
        event.preventDefault();
        setPlaybackSettingsOpen(false);
        window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
        return;
      }
      if (event.key === "Escape" && queueOpen) {
        event.preventDefault();
        setQueueOpen(false);
        window.requestAnimationFrame(() => companionTriggerRef.current?.focus());
        return;
      }
      if (event.key === "Escape" && mode === "theater") {
        event.preventDefault();
        if (playerPage) {
          minimize();
          let returnPath = "/";
          try {
            const stored = sessionStorage.getItem(PLAYER_RETURN_PATH);
            if (stored?.startsWith("/") && !stored.startsWith("//") && !stored.startsWith("/theater")) returnPath = stored;
          } catch {
            // Fall back to Watch.
          }
          router.push(returnPath as never, { scroll: false });
        } else {
          minimize();
        }
      }
      if (
        shortFormTheaterNavigation
        && !playbackSettingsOpen
        && (event.key === "ArrowDown" || event.key === "ArrowUp")
        && !event.altKey
        && !event.ctrlKey
        && !event.metaKey
      ) {
        const shortNavigationControl = target?.closest("[data-short-form-navigation]");
        const blockedTarget = shortNavigationControl ? null : target?.closest(
          "input, textarea, select, [contenteditable=true], button, a, [role=button], [role=slider], [role=tab], [role=listbox], [role=option], #player-companion-panel",
        );
        if (!blockedTarget && !settingsPanelRef.current?.contains(target)) {
          const now = performance.now();
          if (now >= shortKeyLockUntilRef.current) {
            event.preventDefault();
            shortKeyLockUntilRef.current = now + 260;
            navigateShortForm(event.key === "ArrowDown" ? "next" : "previous");
          }
          return;
        }
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        skip();
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", onKey);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: current.title,
          artist: formatDisplayLabel(current.accountLabel ?? current.memberLabel),
          artwork: current.poster ? [{ src: current.poster }] : [],
        });
        navigator.mediaSession.setActionHandler("nexttrack", skip);
        navigator.mediaSession.setActionHandler("previoustrack", previous);
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          if (typeof details.seekTime === "number") requestSeek(details.seekTime);
        });
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          requestSeek(Math.max(0, positionRef.current - (details.seekOffset ?? 10)));
        });
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          requestSeek(positionRef.current + (details.seekOffset ?? 10));
        });
      } catch {
        // Media Session support varies by browser.
      }
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
          navigator.mediaSession.setActionHandler("seekto", null);
          navigator.mediaSession.setActionHandler("seekbackward", null);
          navigator.mediaSession.setActionHandler("seekforward", null);
          navigator.mediaSession.metadata = null;
        } catch {
          // Media Session support varies by browser.
        }
      }
    };
  }, [current, mode, minimize, navigateShortForm, playbackSettingsOpen, playerPage, previous, queueOpen, requestSeek, router, setQueueOpen, shortFormTheaterNavigation, skip]);

  useEffect(() => () => {
    if (shortWheelResetTimerRef.current !== null) {
      window.clearTimeout(shortWheelResetTimerRef.current);
    }
  }, []);

  const onShortFormWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (!shortFormTheaterNavigation || playbackSettingsOpen || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest("#player-companion-panel")
      || (target && settingsPanelRef.current?.contains(target))
    ) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = performance.now();
    if (now < shortWheelLockUntilRef.current) return;
    const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 240 : 1;
    shortWheelDeltaRef.current += event.deltaY * multiplier;
    if (shortWheelResetTimerRef.current !== null) {
      window.clearTimeout(shortWheelResetTimerRef.current);
    }
    shortWheelResetTimerRef.current = window.setTimeout(() => {
      shortWheelDeltaRef.current = 0;
      shortWheelResetTimerRef.current = null;
    }, 180);
    if (Math.abs(shortWheelDeltaRef.current) < 72) return;
    const direction = shortWheelDeltaRef.current > 0 ? "next" : "previous";
    shortWheelDeltaRef.current = 0;
    if (navigateShortForm(direction)) {
      shortWheelLockUntilRef.current = now + 620;
      setTouchControlsVisible(true);
    }
  }, [navigateShortForm, playbackSettingsOpen, shortFormTheaterNavigation]);

  const onMessage = useCallback(
    (event: MessageEvent) => {
      if (!current) return;
      const source = iframeRef.current?.contentWindow;
      if (!source || event.source !== source) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      const message = data as Record<string, unknown>;
      const originHost = (() => {
        try {
          return new URL(event.origin).hostname;
        } catch {
          return "";
        }
      })();
      const fromYouTube =
        originHost === "www.youtube.com" ||
        originHost === "youtube.com" ||
        originHost === "www.youtube-nocookie.com" ||
        originHost === "youtube-nocookie.com";
      if (current.youtubeId && fromYouTube) {
        const info = message.info;
      if (message.event === "onReady") {
        playingRef.current = false;
        setIsPlaying(false);
        postYouTubePlayerCommands(source, youtubeCaptionCommands(captionsEnabled));
        if (autoStartMuted) {
          source.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            "*",
          );
        }
        if (playbackRate !== 1) {
          source.postMessage(
            JSON.stringify({ event: "command", func: "setPlaybackRate", args: [playbackRate] }),
            "*",
          );
        }
        if (positionRef.current > 5 && source) {
            source.postMessage(
              JSON.stringify({ event: "command", func: "seekTo", args: [positionRef.current, true] }),
              "*",
            );
          }
        }
        if (message.event === "onApiChange") {
          postYouTubePlayerCommands(
            source,
            youtubeCaptionCommands(captionsEnabled, { moduleReady: true }),
          );
        }
        if (message.event === "infoDelivery" && info && typeof info === "object") {
          const details = info as Record<string, unknown>;
          if (typeof details.currentTime === "number") {
            positionRef.current = details.currentTime;
            setUiPosition(details.currentTime);
          }
          if (typeof details.duration === "number") {
            durationRef.current = details.duration;
            setUiDuration(details.duration);
          }
          if (details.playerState === 1) {
            playingRef.current = true;
            setIsPlaying(true);
          }
          if (details.playerState === 2 && playingRef.current) {
            playingRef.current = false;
            setIsPlaying(false);
            checkpointCurrent();
          }
          if (details.playerState === 0) {
            setIsPlaying(false);
            finish();
          }
          if (typeof details.muted === "boolean") setIsMuted(details.muted);
          if (typeof details.volume === "number" && Number.isFinite(details.volume)) {
            youtubeVolumeRef.current = Math.min(1, Math.max(0, details.volume / 100));
          }
        }
        if (message.event === "onStateChange" && info === 0) {
          setIsPlaying(false);
          finish();
        }
      }
      if (
        current.platform === "tiktok" &&
        (originHost === "www.tiktok.com" || originHost === "tiktok.com") &&
        message["x-tiktok-player"] === true
      ) {
        if (message.type === "onPlayerReady") {
          playingRef.current = false;
          if (autoStartMuted) {
            source.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
            source.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
          }
          if (positionRef.current > 5 && source) {
            source.postMessage(
              { "x-tiktok-player": true, type: "seekTo", value: positionRef.current },
              "*",
            );
          }
        }
        if (message.type === "onCurrentTime" && message.value && typeof message.value === "object") {
          const value = message.value as Record<string, unknown>;
          if (typeof value.currentTime === "number") {
            positionRef.current = value.currentTime;
            setUiPosition(value.currentTime);
          }
          if (typeof value.duration === "number") {
            durationRef.current = value.duration;
            setUiDuration(value.duration);
          }
        }
        if (message.type === "onStateChange") {
          if (message.value === 1) {
            playingRef.current = true;
            setIsPlaying(true);
          }
          if (message.value === 2 && playingRef.current) {
            playingRef.current = false;
            setIsPlaying(false);
            checkpointCurrent();
          }
          if (message.value === 0) {
            setIsPlaying(false);
            finish();
          }
        }
        if (message.type === "onPlayerError") {
          setPlaybackError(true);
          analytics("watch_error", current, { reason: "tiktok_player" });
        }
      }
    },
    [autoStartMuted, captionsEnabled, checkpointCurrent, current, finish, playbackRate],
  );

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onMessage]);

  useEffect(() => {
    if (!current?.youtubeId) return;
    const notify = () => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*");
    };
    const requestAutoplay = () => {
      if (!autoStartMuted) return;
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
    };
    const early = window.setTimeout(notify, 400);
    const later = window.setTimeout(notify, 1_200);
    const playEarly = window.setTimeout(requestAutoplay, 250);
    const playLater = window.setTimeout(requestAutoplay, 900);
    return () => {
      window.clearTimeout(early);
      window.clearTimeout(later);
      window.clearTimeout(playEarly);
      window.clearTimeout(playLater);
    };
  }, [autoStartMuted, current?.key, current?.youtubeId]);

  useEffect(() => {
    if (!current || current.platform !== "tiktok" || !autoStartMuted) return;
    const requestAutoplay = () => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
      target.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
    };
    // A pre-rendered TikTok frame may have emitted onPlayerReady while it was
    // still hidden. Retry commands as it is promoted instead of waiting for a
    // readiness event that will not fire a second time.
    requestAutoplay();
    const early = window.setTimeout(requestAutoplay, 250);
    const later = window.setTimeout(requestAutoplay, 900);
    return () => {
      window.clearTimeout(early);
      window.clearTimeout(later);
    };
  }, [autoStartMuted, current]);

  useEffect(() => {
    if (!shortFormTheaterNavigation) return;
    const pauseHiddenFrames = () => {
      const frames = playerSectionRef.current?.querySelectorAll<HTMLIFrameElement>(
        'iframe[data-short-form-frame="preloaded"]',
      );
      frames?.forEach((frame) => {
        const target = frame.contentWindow;
        if (!target) return;
        if (frame.dataset.shortFormProvider === "youtube") {
          target.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
          target.postMessage(JSON.stringify({ event: "command", func: "mute", args: [] }), "*");
        } else if (frame.dataset.shortFormProvider === "tiktok") {
          target.postMessage({ "x-tiktok-player": true, type: "pause" }, "*");
          target.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
        }
      });
    };
    const frame = window.requestAnimationFrame(pauseHiddenFrames);
    const retry = window.setTimeout(pauseHiddenFrames, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [current?.key, shortFormTheaterNavigation]);

  const sendYoutubeCommand = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  }, []);

  useEffect(() => {
    const previewAudioActive = Boolean(activePreviewAudioId);
    const timers = previewDuckTimersRef.current;
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scheduleRamp = (
      from: number,
      to: number,
      apply: (volume: number) => void,
      onDone?: () => void,
    ) => {
      const values = previewVolumeRamp(from, to, reducedMotion ? 1 : 6);
      values.forEach((volume, index) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          apply(volume);
          if (index === values.length - 1) onDone?.();
        }, reducedMotion ? 0 : Math.round(180 * ((index + 1) / values.length)));
        timers.add(timer);
      });
    };

    const existing = previewDuckRef.current;
    if (!previewAudioActive) {
      if (!existing || existing.itemKey !== current?.key) {
        previewDuckRef.current = null;
        return;
      }
      const finishRestore = () => {
        if (previewDuckRef.current === existing) previewDuckRef.current = null;
      };
      if (existing.provider === "native") {
        const media = videoRef.current;
        if (!media) {
          finishRestore();
          return;
        }
        scheduleRamp(media.volume, existing.originalVolume, (volume) => { media.volume = volume; }, finishRestore);
        return;
      }
      if (existing.provider === "youtube") {
        scheduleRamp(youtubeVolumeRef.current, existing.originalVolume, (volume) => {
          youtubeVolumeRef.current = volume;
          sendYoutubeCommand("setVolume", [Math.round(volume * 100)]);
        }, finishRestore);
        return;
      }
      if (existing.provider === "twitch") {
        const twitch = twitchPlayerRef.current;
        if (!twitch?.setVolume) {
          finishRestore();
          return;
        }
        const from = twitch.getVolume?.() ?? existing.originalVolume * 0.22;
        scheduleRamp(from, existing.originalVolume, (volume) => twitch.setVolume?.(volume), finishRestore);
        return;
      }
      finishRestore();
      return;
    }

    if (!current || isMuted) return;
    let snapshot = existing?.itemKey === current.key ? existing : null;
    if (nativeSourceSupported && videoRef.current) {
      const media = videoRef.current;
      snapshot ??= {
        itemKey: current.key,
        provider: "native",
        originalVolume: media.volume,
        wasMuted: media.muted,
      };
      previewDuckRef.current = snapshot;
      if (!media.muted && snapshot.provider === "native") {
        scheduleRamp(media.volume, snapshot.originalVolume * 0.22, (volume) => { media.volume = volume; });
      }
      return;
    }
    if (current.youtubeId) {
      snapshot ??= {
        itemKey: current.key,
        provider: "youtube",
        originalVolume: youtubeVolumeRef.current,
        wasMuted: isMuted,
      };
      previewDuckRef.current = snapshot;
      if (snapshot.provider === "youtube") {
        scheduleRamp(youtubeVolumeRef.current, snapshot.originalVolume * 0.22, (volume) => {
          youtubeVolumeRef.current = volume;
          sendYoutubeCommand("setVolume", [Math.round(volume * 100)]);
        });
      }
      return;
    }
    if (twitchInteractive && twitchPlayerRef.current?.setVolume) {
      const twitch = twitchPlayerRef.current;
      const originalVolume = twitch.getVolume?.() ?? 1;
      snapshot ??= {
        itemKey: current.key,
        provider: "twitch",
        originalVolume,
        wasMuted: twitch.getMuted?.() ?? isMuted,
      };
      previewDuckRef.current = snapshot;
      if (snapshot.provider === "twitch" && !snapshot.wasMuted) {
        scheduleRamp(twitch.getVolume?.() ?? snapshot.originalVolume, snapshot.originalVolume * 0.22, (volume) => twitch.setVolume?.(volume));
      }
      return;
    }
  }, [
    activePreviewAudioId,
    current,
    isMuted,
    nativeSourceSupported,
    sendYoutubeCommand,
    twitchInteractive,
    twitchReadyToken,
  ]);

  useEffect(() => () => {
    for (const timer of previewDuckTimersRef.current) window.clearTimeout(timer);
    previewDuckTimersRef.current.clear();
    const snapshot = previewDuckRef.current;
    if (!snapshot) return;
    if (snapshot.provider === "native" && videoRef.current) {
      videoRef.current.volume = snapshot.originalVolume;
    } else if (snapshot.provider === "youtube") {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "setVolume", args: [Math.round(snapshot.originalVolume * 100)] }),
        "*",
      );
    } else if (snapshot.provider === "twitch") {
      twitchPlayerRef.current?.setVolume?.(snapshot.originalVolume);
    }
    previewDuckRef.current = null;
  }, []);

  useEffect(() => {
    const enteredPlayerPage = playerPage && !previousPlayerPageRef.current;
    previousPlayerPageRef.current = playerPage;
    if (!enteredPlayerPage || !current) return;

    // Navigating an already-selected, paused mini player onto `/theater`
    // should resume it too. This is separate from the per-item initial mute
    // intent so expanding never tears down an iframe that is already playing.
    setIsMuted(true);
    const native = videoRef.current;
    if (native) {
      native.muted = true;
      void native.play().catch(() => undefined);
      return;
    }
    if (current.youtubeId) {
      sendYoutubeCommand("mute");
      sendYoutubeCommand("playVideo");
      return;
    }
    if (current.platform === "tiktok") {
      const target = iframeRef.current?.contentWindow;
      target?.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
      target?.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
      return;
    }
    try {
      twitchPlayerRef.current?.setMuted?.(true);
      twitchPlayerRef.current?.play?.();
    } catch {
      // Twitch's visible native Play control remains the browser fallback.
    }
  }, [current, playerPage, sendYoutubeCommand]);

  useEffect(() => {
    const media = videoRef.current;
    if (media) {
      media.playbackRate = playbackRate;
      syncNativeCaptionTracks(media, captionsEnabled, current?.captions);
    }
    if (current?.youtubeId) {
      const target = iframeRef.current?.contentWindow;
      if (target) {
        target.postMessage(
          JSON.stringify({ event: "command", func: "setPlaybackRate", args: [playbackRate] }),
          "*",
        );
        postYouTubePlayerCommands(target, youtubeCaptionCommands(captionsEnabled));
      }
    }
    const twitch = twitchPlayerRef.current;
    if (twitchCaptionsSupported && twitch) {
      try {
        if (captionsEnabled) twitch.enableCaptions?.();
        else twitch.disableCaptions?.();
      } catch {
        // Twitch may not have caption data for the current broadcast or VOD.
      }
    }
  }, [
    captionsEnabled,
    current?.captions,
    current?.key,
    current?.youtubeId,
    playbackRate,
    selectedNativeMedia,
    twitchCaptionsSupported,
  ]);

  const refreshNativeCapabilities = useCallback((media: DeviceVideo) => {
    const dvr = Boolean(
      current?.kind === "live" &&
      media.seekable.length > 0 &&
      media.seekable.end(media.seekable.length - 1) - media.seekable.start(0) > 10 &&
      media.currentTime - media.seekable.start(0) > 3,
    );
    const next = {
      pip: Boolean(document.pictureInPictureEnabled && media.requestPictureInPicture),
      remote: Boolean(media.remote?.prompt),
      airplay: Boolean(media.webkitShowPlaybackTargetPicker),
      dvr,
    };
    setNativeCapabilities((currentValue) =>
      currentValue.pip === next.pip &&
      currentValue.remote === next.remote &&
      currentValue.airplay === next.airplay &&
      currentValue.dvr === next.dvr
        ? currentValue
        : next,
    );
  }, [current?.kind]);

  const startTwitchDvrAt = useCallback((seconds: number) => {
    if (
      !current
      || current.kind !== "live"
      || current.platform !== "twitch"
      || !current.dvr?.twitchVodId
      || liveDvrWindowDuration <= 0
    ) return;
    const target = clampLiveDvrPosition(seconds, liveDvrWindowDuration);
    if (!shouldEnterLiveDvr(target, liveDvrWindowDuration)) return;

    // Twitch channels themselves cannot seek. Switch to the matching growing
    // archive and start it at the point selected on CORE's live timeline.
    twitchDvrActiveRef.current = true;
    setTwitchDvrStartSeconds(target);
    setTwitchDvrActive(true);
    setIsMuted(true);
    positionRef.current = target;
    durationRef.current = liveDvrWindowDuration;
    setUiPosition(target);
    setUiDuration(liveDvrWindowDuration);
    setPlaybackError(false);
    setTwitchStartRequired(false);
    analytics("watch_rewind_live", current, {
      twitch_vod_id: current.dvr.twitchVodId,
      position_seconds: Math.round(target),
      behind_live_seconds: Math.round(liveDvrBehindSeconds(target, liveDvrWindowDuration)),
    });
  }, [current, liveDvrWindowDuration]);

  const returnToTwitchLive = useCallback(() => {
    if (!current?.twitchLogin || current.kind !== "live") return;
    twitchDvrActiveRef.current = false;
    setTwitchDvrActive(false);
    setTwitchDvrStartSeconds(0);
    setLiveDvrPreviewSeconds(liveDvrWindowDuration);
    positionRef.current = 0;
    durationRef.current = 0;
    setUiPosition(0);
    setUiDuration(0);
    setPlaybackError(false);
    setTwitchStartRequired(false);
    analytics("watch_go_live", current);
  }, [current, liveDvrWindowDuration]);

  const startFromBeginning = useCallback(() => {
    if (!current || !canStartOver) return;
    const twitchVodId = current.kind === "live" && current.platform === "twitch"
      ? current.dvr?.twitchVodId
      : null;
    if (twitchVodId) {
      startTwitchDvrAt(0);
      return;
    }
    const media = videoRef.current;
    if (media?.seekable.length) {
      seekTo(media.seekable.start(0));
      return;
    }
    // Explicit provider DVR metadata is required for embeds because their
    // seekable ranges are not visible cross-origin.
    if (current.dvr?.enabled) seekTo(0);
  }, [canStartOver, current, seekTo, startTwitchDvrAt]);

  const enterPictureInPicture = useCallback(async () => {
    const media = videoRef.current;
    if (!media || !nativeCapabilities.pip) return;
    try { await media.requestPictureInPicture(); } catch { /* browser/provider declined */ }
  }, [nativeCapabilities.pip]);

  const openRemotePlayback = useCallback(async () => {
    const media = videoRef.current as DeviceVideo | null;
    if (!media) return;
    try {
      if (media.remote?.prompt) await media.remote.prompt();
      else media.webkitShowPlaybackTargetPicker?.();
    } catch {
      // Cancellation and unavailable receivers are normal outcomes.
    }
  }, []);

  const stopPlayback = useCallback(() => {
    handoff.clear();
    stop();
  }, [handoff.clear, stop]);

  const setPlaybackIntent = useCallback((action: "play" | "pause") => {
    const shouldPlay = action === "play";
    const media = videoRef.current;
    if (media) {
      if (shouldPlay && media.paused) {
        void media.play().catch(() => {
          playingRef.current = false;
          setIsPlaying(false);
        });
      } else if (!shouldPlay && !media.paused) {
        media.pause();
      }
      return;
    }
    if (current?.youtubeId) {
      sendYoutubeCommand(shouldPlay ? "playVideo" : "pauseVideo");
      playingRef.current = shouldPlay;
      setIsPlaying(shouldPlay);
      return;
    }
    if (current?.platform === "tiktok") {
      iframeRef.current?.contentWindow?.postMessage(
        { "x-tiktok-player": true, type: shouldPlay ? "play" : "pause" },
        "*",
      );
      playingRef.current = shouldPlay;
      setIsPlaying(shouldPlay);
      return;
    }
    const twitch = twitchPlayerRef.current;
    if (!twitch) return;
    try {
      // Set CORE's intent before notifying Twitch. Its PAUSE event can arrive
      // immediately, and the embed must treat that event as intentional only
      // when it originated from this control.
      playingRef.current = shouldPlay;
      setIsPlaying(shouldPlay);
      if (shouldPlay) twitch.play?.();
      else twitch.pause?.();
    } catch {
      // Twitch retains its approved controls if the SDK command is rejected.
    }
  }, [current?.platform, current?.youtubeId, sendYoutubeCommand]);

  const togglePlayback = useCallback(() => {
    setPlaybackIntent(isPlaying ? "pause" : "play");
  }, [isPlaying, setPlaybackIntent]);

  useEffect(() => {
    const publish = () => {
      const detail: WatchPlaybackStateDetail = {
        itemKey: current?.key ?? null,
        playing: playingRef.current,
        positionSeconds: Math.max(0, positionRef.current),
        durationSeconds: Math.max(0, durationRef.current),
        observedAt: new Date().toISOString(),
      };
      window.dispatchEvent(new CustomEvent(WATCH_PLAYBACK_STATE_EVENT, { detail }));
    };
    publish();
    if (!current) return;
    const timer = window.setInterval(publish, 1_000);
    return () => window.clearInterval(timer);
  }, [current, isPlaying]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<WatchPlaybackControlDetail>).detail;
      if (!detail || detail.itemKey !== (current?.key ?? null)) return;
      if (detail.action === "seek") {
        if (Number.isFinite(detail.positionSeconds)) seekTo(detail.positionSeconds!);
        return;
      }
      setPlaybackIntent(detail.action);
    };
    window.addEventListener(WATCH_PLAYBACK_CONTROL_EVENT, onControl);
    return () => window.removeEventListener(WATCH_PLAYBACK_CONTROL_EVENT, onControl);
  }, [current?.key, seekTo, setPlaybackIntent]);

  const toggleMuted = useCallback(() => {
    const media = videoRef.current;
    if (media) {
      media.muted = !media.muted;
      setIsMuted(media.muted);
      return;
    }
    if (current?.youtubeId) {
      sendYoutubeCommand(isMuted ? "unMute" : "mute");
      setIsMuted((value) => !value);
      return;
    }
    const twitch = twitchPlayerRef.current;
    if (!twitch?.setMuted) return;
    try {
      twitch.setMuted(!isMuted);
      setIsMuted(!isMuted);
    } catch {
      // Keep the last provider-confirmed state.
    }
  }, [current?.youtubeId, isMuted, sendYoutubeCommand]);

  const revealTouchControls = useCallback(() => {
    setTouchControlsVisible(true);
    if (controlsHideTimerRef.current) window.clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = window.setTimeout(() => setTouchControlsVisible(false), 3_800);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerSectionRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be denied by browser policy or user preference.
    }
  }, []);

  const playerReturnPath = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(PLAYER_RETURN_PATH);
      if (stored?.startsWith("/") && !stored.startsWith("//") && !stored.startsWith("/theater")) return stored;
    } catch {
      // Fall through to Watch.
    }
    return "/";
  }, []);

  const leavePlayerPage = useCallback((close: boolean) => {
    if (close) stopPlayback();
    else minimize();
    if (playerPage) {
      const destination = playerReturnPath();
      beginCinematicTransition(destination, { kind: "return", eyebrow: "Returning to Watch" });
      router.push(destination as never, { scroll: false });
    }
  }, [minimize, playerPage, playerReturnPath, router, stopPlayback]);

  const readPresenceTimeMs = useCallback(
    () => Math.max(0, positionRef.current * 1_000),
    [],
  );

  if (routeHidden) return null;
  if (!current) {
    return availableHandoff ? (
      <HandoffPrompt snapshot={availableHandoff} onContinue={acceptHandoff} onDismiss={handoff.dismiss} />
    ) : null;
  }

  const currentContextItem = {
    id: current.key,
    kind: current.kind,
    platform: current.platform,
    title: current.title,
    poster: current.poster,
    backdrop: current.poster,
    memberSlug: current.memberSlug,
    memberLabel: current.memberLabel,
    accent: "#e60070",
    href: current.sourceUrl || current.url || "/watch",
    sourceUrl: current.sourceUrl || current.url || undefined,
    durationSeconds: current.durationSeconds,
    dvr: current.dvr,
    format: current.format,
    orientation: current.orientation,
    embeddable: current.embeddable,
  } as const;

  const activeAiring = channel?.airing?.itemKey === current.key ? channel.airing : null;
  const activeAiringLabel = activeAiring && viewerTime.ready
    ? airingTimeLabel(activeAiring, viewerTime)
    : null;
  const dvrAllowed = subscription.hasFeature("dvr.extended_retention");
  const dvrActionLoading = dvrLoading || subscription.loading;
  const dvrLocked = Boolean(dvrUser && !dvrActionLoading && !dvrAllowed);
  const savedToDvr = dvrAllowed && dvrIds.includes(current.key);
  const currentFeedback = discovery.state.feedback[current.key]?.value ?? null;
  const setCurrentFeedback = (value: "like" | "not_interested") => {
    discovery.setFeedback(current.key, currentFeedback === value ? null : value);
  };
  const toggleDvrSave = () => {
    if (!dvrUser) {
      redirectToMyListSignIn();
      return;
    }
    if (subscription.loading) return;
    if (!dvrAllowed) {
      window.location.assign(subscription.featureHref("dvr.extended_retention"));
      return;
    }
    toggleMyList(current.key);
  };
  const shape = contentShape(current);
  const src = embedFor(current, {
    parent,
    origin,
    autoplay: true,
    muted: autoStartMuted,
    loop: false,
    controls: current.youtubeId ? false : undefined,
  });
  const activeTwitchArchiveId = twitchDvrActive ? current.dvr?.twitchVodId : null;
  const twitchPlaybackItem: Playable = activeTwitchArchiveId
    ? {
        ...current,
        kind: "vod",
        twitchLogin: null,
        vodId: activeTwitchArchiveId,
        durationSeconds: current.dvr?.windowSeconds ?? current.durationSeconds,
      }
    : current;
  const imageMedia = current.format === "photo"
    ? current.mediaUrl ?? current.poster ?? current.url
    : null;
  const nativeMedia = nativeSourceSupported ? selectedNativeMedia! : null;
  const futureShortFormPreloadCount = shortFormPreloadBudget({
    dataSaver,
    qualityPreference,
    saveData: shortFormNetwork.saveData,
    effectiveType: shortFormNetwork.effectiveType,
    deviceMemoryGb: shortFormNetwork.deviceMemoryGb,
    idleReady: shortFormIdleWarmupReady,
  });
  const futureShortFormPreloads = shortFormPreloads
    .slice(0, futureShortFormPreloadCount)
    // Instagram's official embed cannot be paused while hidden. Warm a Reel
    // only when it is the immediate next item; YouTube and TikTok may use the
    // optional second idle slot because their players support pause commands.
    .filter((item, index) => index === 0 || item.platform !== "instagram");
  const shortFormFrameDeck = !dataSaver && qualityPreference !== "data-saver" && shortFormTheaterNavigation
    ? [current, ...futureShortFormPreloads].flatMap((item) => {
        const active = item.key === current.key;
        const supportedProvider = Boolean(
          item.youtubeId
          || item.platform === "tiktok"
          || item.platform === "instagram",
        );
        if (!supportedProvider || !isShortFormNavigationItem(item)) return [];
        const frameSrc = embedFor(item, {
          parent,
          origin,
          muted: true,
          // Hidden frames intentionally use `autoplay: false,` with
          // `loop: false`; the active frame gets an autoplay hint instead.
          autoplay: active,
          loop: false,
          controls: item.youtubeId ? false : undefined,
        });
        return frameSrc ? [{ item, src: frameSrc }] : [];
      })
    : [];
  const activeShortFormFrame = shortFormFrameDeck.some(({ item }) => item.key === current.key);
  const theaterHref = theaterHrefFor(current);
  const scrubberDuration = Math.max(
    0,
    uiDuration
      || (twitchDvrActive ? current.dvr?.windowSeconds : 0)
      || current.durationSeconds
      || activeMark?.durationSeconds
      || 0,
  );
  const scrubberPosition = Math.min(scrubberDuration, Math.max(0, uiPosition));
  const canScrub = scrubberDuration > 0 && (current.kind !== "live" || twitchDvrActive) && Boolean(
    nativeMedia
      || current.youtubeId
      || current.vodId
      || (twitchDvrActive && current.dvr?.twitchVodId)
      || current.platform === "tiktok",
  );
  const scrubberProgress = canScrub ? (scrubberPosition / scrubberDuration) * 100 : 0;
  const theater = mode === "theater";
  const playerScreen = theater || playerPage;
  const socialTheaterPresentation = playerScreen
    && (current.platform === "instagram" || current.platform === "tiktok");
  const socialTheaterLabel = current.platform === "instagram"
    ? current.format === "photo" ? "Instagram photo" : "Instagram Reel"
    : "TikTok";
  // A compact/theater player can remain mounted while navigating to Shorts.
  // Keep the TV-style guide exclusive to Theater so it never leaks into the
  // dedicated portrait player route.
  const guideOverlayOpen = theater && !shortsPage && guideMenuOpen;
  const coreTwitchLiveControls = twitchInteractive && isCoreControlledTwitchLivePlayback(current, {
    playerScreen,
    guideLivePlayback,
  });
  const twitchAutoplayWarmup = coreTwitchLiveControls
    && !isPlaying
    && !twitchStartRequired
    && !playbackError;
  const coreTwitchAtLiveEdge = coreTwitchLiveControls && !twitchDvrActive;
  const liveDvrPreviewPosition = clampLiveDvrPosition(
    liveDvrPreviewSeconds,
    liveDvrWindowDuration,
  );
  const liveDvrPreviewProgress = liveDvrProgressPercent(
    liveDvrPreviewPosition,
    liveDvrWindowDuration,
  );
  const liveDvrPreviewBehind = liveDvrBehindSeconds(
    liveDvrPreviewPosition,
    liveDvrWindowDuration,
  );
  const canAddMultiview = playerScreen && shape === "landscape" && !imageMedia;
  const guideVodDetails = Boolean(
    playerScreen
      && shape === "landscape"
      && activeAiring
      && (activeAiring.status === "replay" || activeAiring.status === "published")
      && current.kind !== "live",
  );
  const cleanTwitchFrame = playerScreen && twitchInteractive
    && (!coreTwitchLiveControls || twitchAutoplayWarmup);
  const modalTheater = theater && !playerPage;
  const ambientMember = MEMBERS.find((member) => (
    member.slug === current.memberSlug
    || member.twitchLogin.toLowerCase() === current.twitchLogin?.toLowerCase()
  ));
  const companionChatChannel = current.kind === "live" && current.platform === "twitch" && current.twitchLogin
    ? {
        login: current.twitchLogin,
        displayName: ambientMember?.stageName ?? formatHandleDisplay(current.twitchLogin),
        avatarUrl: ambientMember?.portrait,
        accent: ambientMember?.accent,
        isCore: Boolean(ambientMember),
        passportChannelSlug: ambientMember?.slug,
      }
    : null;
  const availableCompanionViews = playerCompanionViews(Boolean(companionChatChannel));
  const activeCompanionView = normalizePlayerCompanionView(
    companionView,
    Boolean(companionChatChannel),
  );
  const inlineGuideVodDetails = guideVodDetails
    && !queueOpen
    && !guideDetailsCollapsed
    && !isFullscreen;
  const restoreGuideVodDetails = guideVodDetails
    && !queueOpen
    && guideDetailsCollapsed
    && !isFullscreen;
  const collapseGuideVodDetails = () => {
    setGuideDetailsCollapsed(true);
    window.requestAnimationFrame(() => guideDetailsRestoreRef.current?.focus());
  };
  const reopenGuideVodDetails = () => {
    setGuideDetailsCollapsed(false);
    window.requestAnimationFrame(() => guideDetailsCollapseRef.current?.focus());
  };
  const toggleCompanion = () => {
    setPlaybackSettingsOpen(false);
    if (queueOpen) {
      setQueueOpen(false);
      return;
    }
    setCompanionView(activeCompanionView);
    setQueueOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById(`player-companion-tab-${activeCompanionView}`)?.focus();
    });
  };
  const closeCompanion = () => {
    setQueueOpen(false);
    window.requestAnimationFrame(() => companionTriggerRef.current?.focus());
  };
  const onCompanionTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key !== "ArrowLeft"
      && event.key !== "ArrowRight"
      && event.key !== "Home"
      && event.key !== "End"
    ) return;
    event.preventDefault();
    const next = movePlayerCompanionView(
      activeCompanionView,
      event.key,
      Boolean(companionChatChannel),
    );
    setCompanionView(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`player-companion-tab-${next}`)?.focus();
    });
  };
  const ambientSource = current.poster || channel?.artwork || ambientMember?.portrait || null;
  const ambientPausedReason = dataSaver
    ? "Data Saver pauses ambient lighting"
    : accessibilityPreset === "calm"
      ? "Calm viewing pauses ambient lighting"
      : null;
  const ambientActive = playerScreen && ambientLighting && !ambientPausedReason;
  const playerPanelPosition = playerScreen
    ? "fixed bottom-3 right-3 w-[min(25rem,calc(100vw-1.5rem))]"
    : `absolute ${shape === "portrait" ? "bottom-[8.5rem]" : "bottom-[5.75rem]"} left-0 w-[min(24rem,calc(100vw-1.5rem))]`;
  const aspect =
    shape === "portrait" ? "aspect-[9/16]" : shape === "square" ? "aspect-square" : "aspect-video";
  const playerStageWidth = isFullscreen
    ? "max-w-none"
    : inlineGuideVodDetails
    ? "max-w-none"
    : shape === "portrait"
    ? "max-w-[calc((100dvh-8rem)*9/16)]"
    : shape === "square"
      ? "max-w-[calc(100dvh-8rem)]"
      : "max-w-[calc((100dvh-8rem)*16/9)]";
  const customTransport = Boolean(nativeMedia || current.youtubeId || coreTwitchLiveControls);
  const twitchQualityOptions = [
    ...(!twitchQualities.some((quality) => quality.id === twitchQuality) && twitchQuality
      ? [{ id: twitchQuality, label: twitchQuality, isDefault: twitchQuality === "auto" }]
      : []),
    ...twitchQualities,
  ].map((quality) => ({
    id: quality.id,
    label: quality.id === "auto" ? "Auto" : quality.id === "chunked" ? "Source" : quality.label,
  }));
  const updateTwitchQuality = (quality: string) => {
    try {
      twitchPlayerRef.current?.setQuality?.(quality);
      setTwitchQuality(quality);
    } catch {
      // Twitch keeps the last available quality.
    }
  };

  return (
    <>
      <section
        ref={playerSectionRef}
        onWheel={onShortFormWheel}
        aria-label="Now playing"
        role={modalTheater ? "dialog" : "region"}
        aria-modal={modalTheater ? true : undefined}
        data-page-pointer-inside={playerScreen ? pagePointerInside : undefined}
        className={
          playerScreen
            ? `watch-player-stage fixed inset-0 z-[80] isolate flex overflow-hidden bg-[#050507] ${isFullscreen ? "p-0" : "p-2 pt-12 md:p-5"}`
            : shape === "portrait"
              ? "fixed bottom-3 left-3 z-[80] w-[min(15rem,calc(100vw-1.5rem))] transition-[width,transform,opacity] duration-300"
              : shape === "square"
                ? "fixed bottom-3 left-3 z-[80] w-[min(18rem,calc(100vw-1.5rem))] transition-[width,transform,opacity] duration-300"
                : "fixed bottom-3 left-3 z-[80] w-[min(25rem,calc(100vw-1.5rem))] transition-[width,transform,opacity] duration-300"
        }
      >
        {ambientActive ? (
          <PlayerAmbientBloom
            key={`${current.key}:${ambientSource ?? "accent"}`}
            source={ambientSource}
            accent={ambientMember?.accent}
          />
        ) : null}
        {theater && !shortsPage ? (
          <div className="watch-player-theater-home">
            <Tooltip title="Home" description="Leave Theater and return home." placement="right">
              <Link
                href="/"
                onClick={() => minimize()}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-black/75 px-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:bg-white hover:text-black hover:ring-white/70 ${CONTROL_FEEDBACK}`}
                aria-label="Back to Home"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                <span>Home</span>
              </Link>
            </Tooltip>
          </div>
        ) : null}
        {theater && !shortsPage ? (
          <div className="watch-player-guide-home">
            <Tooltip title={guideMenuOpen ? "Return to Now Playing" : "Open Guide"} description={guideMenuOpen ? "Return to the media player." : "Browse this channel without leaving Theater."} placement="top">
              <button
                type="button"
                onClick={() => {
                  setGuideMenuOpen((open) => !open);
                  if (!guideMenuOpen) {
                    setQueueOpen(true);
                    setCompanionView("details");
                  }
                }}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-black/75 px-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:bg-white hover:text-black hover:ring-white/70 ${CONTROL_FEEDBACK}`}
                aria-label={guideMenuOpen ? "Return to Now Playing" : "Open Guide"}
                aria-pressed={guideMenuOpen}
              >
                <span>{guideMenuOpen ? "Now Playing" : "Guide"}</span>
              </button>
            </Tooltip>
          </div>
        ) : null}
        <div
          data-player-workspace-grid={playerScreen ? true : undefined}
          className={
            playerScreen
              ? `relative z-10 mx-auto grid h-full min-h-0 min-w-0 w-full ${isFullscreen ? "max-w-none gap-0" : shortsPage && queueOpen ? "max-w-[min(100%,calc((100dvh-8rem)*9/16+22.75rem))] gap-3" : "max-w-[1920px] gap-3"} ${queueOpen && !isFullscreen ? shortsPage ? "lg:grid-cols-[minmax(0,calc((100dvh-8rem)*9/16))_22rem]" : "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`
              : "w-full"
          }
        >
          <div
            ref={playerStageShellRef}
            data-player-stage-shell={playerScreen ? true : undefined}
            data-player-layout={playerScreen ? "screen" : "compact"}
            data-player-shape={shape}
            className={
              playerScreen
                ? `relative mx-auto flex min-h-0 min-w-0 w-full flex-col ${isFullscreen ? "h-full self-stretch" : "self-center"} ${playerStageWidth} ${playbackSettingsOpen ? "overflow-visible" : ""}`
                : `relative flex min-h-0 flex-col rounded-2xl bg-[#08080a] shadow-2xl ring-1 ring-white/15 ${playbackSettingsOpen ? "overflow-visible" : "overflow-hidden"}`
            }
          >
            {cleanTwitchFrame ? (
              <div
                className="mb-2 flex min-h-11 items-center gap-2 rounded-xl bg-[#0b0b0e]/92 px-2 py-1.5 text-white ring-1 ring-white/12"
                aria-label="Twitch player actions"
              >
                {current.vodId ? (
                  <span
                    data-player-vod-badge
                    className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-[#ef233c]/12 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff5364] ring-1 ring-inset ring-[#ef233c]/35"
                    title="Video on demand"
                  >
                    <span className="grid h-5 min-w-8 place-items-center rounded bg-[#ef233c] px-1 text-[9px] tracking-[0.08em] text-white">VOD</span>
                    <span className="hidden xl:inline">Video on demand</span>
                  </span>
                ) : null}
                {channel?.href ? (
                  <Link
                    href={channel.href as never}
                    className={`min-w-0 flex-1 rounded-lg px-2 py-1 hover:bg-white/8 ${CONTROL_FEEDBACK}`}
                    title={`Open ${channel.title}`}
                  >
                    <span className="block truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#ff5364]">
                      {channel.title}
                    </span>
                    <span className="block truncate text-xs font-semibold text-white/85">{current.title}</span>
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1 px-2 py-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#ff5364]">
                      Twitch {current.kind === "live" ? "live" : "video"}
                    </span>
                    <span className="block truncate text-xs font-semibold text-white/85">{current.title}</span>
                  </div>
                )}
                <Tooltip
                  title={dvrLocked ? "DVR with CORE Membership" : dvrUser && savedToDvr ? "Remove from DVR" : "Add to DVR"}
                  description={dvrLocked ? "DVR is included with CORE Membership." : dvrUser ? savedToDvr ? "Remove this broadcast from your DVR." : "Add this broadcast to your DVR for later." : "Sign in to add this broadcast to your DVR."}
                  placement="bottom"
                >
                  <button
                    type="button"
                    onClick={toggleDvrSave}
                    disabled={dvrActionLoading}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold ring-1 ring-inset ${savedToDvr ? "bg-white text-black ring-white" : "text-white/78 ring-white/16 hover:bg-white/10 hover:text-white"} ${CONTROL_FEEDBACK}`}
                    aria-label={dvrLocked ? `Unlock DVR to save ${current.title}` : dvrUser && savedToDvr ? `Remove ${current.title} from DVR` : `Add ${current.title} to DVR`}
                    aria-pressed={Boolean(dvrUser && savedToDvr)}
                  >
                    <Archive className="size-4" aria-hidden />
                    <span className="hidden 2xl:inline">{dvrActionLoading ? "Loading…" : dvrLocked ? "Unlock DVR" : savedToDvr ? "In DVR" : "Add to DVR"}</span>
                  </button>
                </Tooltip>
                {canStartOver || twitchDvrActive ? (
                  <button
                    type="button"
                    onClick={twitchDvrActive ? returnToTwitchLive : startFromBeginning}
                    className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold text-white ring-1 ring-white/18 hover:bg-white hover:text-black ${CONTROL_FEEDBACK}`}
                    aria-label={twitchDvrActive ? "Go to the live edge" : "Rewind this live stream to the beginning"}
                  >
                    {twitchDvrActive ? "Go live" : "Start over"}
                  </button>
                ) : null}
                <Tooltip
                  title={queueOpen ? "Close side panel" : companionChatChannel ? "Live chat & more" : "Up next & details"}
                  description={queueOpen ? "Hide the queue, live chat, and video details." : companionChatChannel ? "Open live chat, your queue, and video details." : "Open your queue and video details."}
                  placement="bottom"
                >
                  <button
                    ref={companionTriggerRef}
                    type="button"
                    onClick={() => toggleCompanion()}
                    className={`grid size-10 shrink-0 place-items-center rounded-lg text-white/75 hover:bg-white/12 hover:text-white ${CONTROL_FEEDBACK} ${queueOpen ? "bg-white/12 text-white" : ""}`}
                    aria-label={queueOpen ? "Close player sidebar" : companionChatChannel ? "Open live chat and player sidebar" : `Open player sidebar${queue.length ? `, ${queue.length} queued items` : ""}`}
                    aria-expanded={queueOpen}
                    aria-controls="player-companion-panel"
                  >
                    {companionChatChannel ? <MessageSquareText aria-hidden /> : <ListVideo aria-hidden />}
                  </button>
                </Tooltip>
                <div className="watch-player-window-controls is-twitch-header ml-1 flex shrink-0 items-center gap-1">
                  <Tooltip title="Minimize player" description="Keep watching in a compact floating player." placement="bottom">
                    <button
                      type="button"
                      onClick={() => leavePlayerPage(false)}
                      className={`grid size-10 shrink-0 place-items-center rounded-lg text-white/75 hover:bg-white/12 hover:text-white ${CONTROL_FEEDBACK}`}
                      aria-label="Minimize player"
                    >
                      ↙
                    </button>
                  </Tooltip>
                  <Tooltip title="Close player" description="Stop playback and close the player." placement="bottom">
                    <button
                      type="button"
                      onClick={() => leavePlayerPage(true)}
                      data-player-close
                      className={`grid size-10 shrink-0 place-items-center rounded-lg text-lg text-white/65 hover:bg-white hover:text-black ${CONTROL_FEEDBACK}`}
                      aria-label="Stop playback"
                    >
                      ×
                    </button>
                  </Tooltip>
                </div>
              </div>
            ) : null}
            <div className={playerScreen ? `watch-player-frame-shell relative isolate w-full overflow-visible ${isFullscreen ? "h-full" : ""} ${guideOverlayOpen ? "is-guide-open" : ""} ${inlineGuideVodDetails ? "is-guide-vod" : ""}` : "contents"}>
              <div
                onPointerDown={revealTouchControls}
                onPointerUp={(event) => {
                  if (event.button !== 2 || !contextMenu) return;
                  event.preventDefault();
                  contextMenu.open(event, { type: "content", item: currentContextItem });
                }}
                onContextMenu={(event) => {
                  if (!contextMenu) return;
                  event.preventDefault();
                  contextMenu.open(event, { type: "content", item: currentContextItem });
                }}
                data-twitch-native-player={cleanTwitchFrame ? true : undefined}
                data-core-twitch-controls={coreTwitchLiveControls ? true : undefined}
                className={
                  cleanTwitchFrame
                    ? `watch-player-media relative z-10 w-full bg-black ${isFullscreen ? "h-full" : aspect}`
                    : playerScreen
                    ? `watch-player-media relative z-10 w-full overflow-hidden bg-black ${isFullscreen ? "h-full rounded-none shadow-none ring-0" : `rounded-2xl shadow-2xl ring-1 ring-white/15 ${aspect}`} ${touchControlsVisible || playbackSettingsOpen ? "is-controls-visible" : ""}`
                    : `watch-player-media relative overflow-hidden rounded-t-2xl bg-black ${aspect} ${touchControlsVisible || playbackSettingsOpen ? "is-controls-visible" : ""}`
                }
              >
              {contentAdvisoryReady ? <>
              {/* Keep artwork visible while any provider iframe or Twitch SDK
                  is loading. It also remains available if the provider fails. */}
              <img
                src={current.poster || "/embed-preview.png"}
                alt=""
                aria-hidden="true"
                data-player-media-fallback
                onError={(event) => {
                  if (event.currentTarget.src.endsWith("/embed-preview.png")) return;
                  event.currentTarget.src = "/embed-preview.png";
                }}
                className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
              />
              {imageMedia ? (
                <div className="absolute inset-0 isolate overflow-hidden bg-[#070709]">
                  <img
                    src={imageMedia}
                    alt=""
                    aria-hidden
                    className="absolute inset-[-4%] h-[108%] w-[108%] scale-110 object-cover opacity-30 blur-2xl"
                  />
                  <img
                    key={current.key}
                    src={imageMedia}
                    alt={current.title}
                    onLoad={() => {
                      playingRef.current = true;
                      setIsPlaying(true);
                      setPlaybackError(false);
                    }}
                    onError={() => {
                      playingRef.current = false;
                      setPlaybackError(true);
                      analytics("watch_error", current, { reason: "image_media" });
                    }}
                    className="absolute inset-0 z-10 h-full w-full object-contain"
                  />
                </div>
              ) : twitchInteractive ? (
                <TwitchMedia
                  key={`${current.key}:${activeTwitchArchiveId ?? "live"}`}
                  item={twitchPlaybackItem}
                  onEnded={() => {
                    if (twitchDvrActiveRef.current) returnToTwitchLive();
                    else finish();
                  }}
                  onPlaying={() => {
                    playingRef.current = true;
                    setIsPlaying(true);
                    setPlaybackError(false);
                    setTwitchStartRequired(false);
                  }}
                  onPaused={() => {
                    if (!playingRef.current) return false;
                    playingRef.current = false;
                    setIsPlaying(false);
                    checkpointCurrent();
                    return true;
                  }}
                  onProgress={(position, duration) => {
                    positionRef.current = Number.isFinite(position) ? position : 0;
                    durationRef.current = Number.isFinite(duration) ? duration : 0;
                    setUiPosition(positionRef.current);
                    setUiDuration(durationRef.current);
                  }}
                  onError={() => {
                    setPlaybackError(true);
                    analytics("watch_error", current, { reason: "twitch_player" });
                  }}
                  onStartRequired={() => {
                    setTwitchStartRequired(true);
                    // Twitch has mounted but browser policy (or a provider
                    // interstitial) needs a direct viewer interaction. Keep
                    // the provider surface shielded and prompt with CORE Play
                    // rather than treating the stream as a hard failure.
                    playingRef.current = false;
                    setIsPlaying(false);
                  }}
                  onReady={(instance) => {
                    twitchPlayerRef.current = instance;
                    setTwitchReadyToken((token) => token + 1);
                    if (!instance) return;
                    try {
                      const qualities = (instance.getQualities?.() ?? []).flatMap((quality) => {
                        if (typeof quality === "string") {
                          return quality ? [{ id: quality, label: quality, isDefault: quality === "auto" }] : [];
                        }
                        const id = typeof quality.group === "string" ? quality.group : "";
                        if (!id) return [];
                        const label = typeof quality.name === "string" && quality.name ? quality.name : id;
                        return [{ id, label, isDefault: quality.isDefault === true }];
                      });
                      setTwitchQualities(qualities);
                      setTwitchQuality(
                        instance.getQuality?.()
                          ?? qualities.find((quality) => quality.isDefault)?.id
                          ?? qualities[0]?.id
                          ?? "auto",
                      );
                      setIsMuted(instance.getMuted?.() ?? autoStartMuted);
                      if (captionsEnabled) instance.enableCaptions?.();
                      else instance.disableCaptions?.();
                    } catch {
                      // Provider capabilities can arrive after READY.
                    }
                  }}
                  resumeAt={
                    activeTwitchArchiveId
                      ? twitchDvrStartSeconds
                      : seekRequest?.itemKey === current.key
                      ? seekRequest.seconds
                      : progressReady && activeMark && !activeMark.completed
                      ? activeMark.positionSeconds
                      : 0
                  }
                  resumeOwner={
                    activeTwitchArchiveId
                      ? `live-dvr:${activeTwitchArchiveId}:${Math.round(twitchDvrStartSeconds * 10)}`
                      : seekRequest?.itemKey === current.key
                      ? `seek:${seekRequest.requestId}`
                      : progressReady && hasActiveResumeState
                      ? `${accountKey}:${current.key}`
                      : ""
                  }
                  startMuted={autoStartMuted || Boolean(activeTwitchArchiveId)}
                  customControls={/* customControls={coreTwitchLiveControls} is
                      enabled after the Twitch surface warms. */ coreTwitchLiveControls && !twitchAutoplayWarmup}
                />
              ) : nativeMedia ? (
                <video
                  key={`${current.key}:${nativeMedia}`}
                  ref={videoRef}
                  src={nativeMedia}
                  poster={current.poster || undefined}
                  autoPlay
                  muted={autoStartMuted}
                  playsInline
                  className="absolute inset-0 h-full w-full object-contain"
                  onLoadedMetadata={(event) => {
                    const media = event.currentTarget as DeviceVideo;
                    durationRef.current = Number.isFinite(media.duration) ? media.duration : current.durationSeconds ?? 0;
                    setUiDuration(durationRef.current);
                    media.playbackRate = playbackRate;
                    if (positionRef.current > 0.25 && positionRef.current < durationRef.current - 0.5) {
                      media.currentTime = positionRef.current;
                    }
                    syncNativeCaptionTracks(media, captionsEnabled, current.captions);
                    refreshNativeCapabilities(media);
                  }}
                  onTimeUpdate={(event) => {
                    const media = event.currentTarget as DeviceVideo;
                    positionRef.current = media.currentTime;
                    setUiPosition(media.currentTime);
                    if (Number.isFinite(media.duration)) {
                      durationRef.current = media.duration;
                      setUiDuration(media.duration);
                    }
                    refreshNativeCapabilities(media);
                  }}
                  onCanPlay={(event) => {
                    if (autoStartMuted) void event.currentTarget.play().catch(() => undefined);
                  }}
                  onPlaying={() => {
                    playingRef.current = true;
                    setIsPlaying(true);
                    setPlaybackError(false);
                  }}
                  onPause={() => {
                    if (!playingRef.current) return;
                    playingRef.current = false;
                    setIsPlaying(false);
                    checkpointCurrent();
                  }}
                  onVolumeChange={(event) => setIsMuted(event.currentTarget.muted || event.currentTarget.volume === 0)}
                  onEnded={() => {
                    setIsPlaying(false);
                    finish();
                  }}
                  onError={() => {
                    setPlaybackError(true);
                    analytics("watch_error", current, { reason: "native_media" });
                  }}
                >
                  {(current.captions ?? []).map((track) => (
                    <track
                      key={`${track.language}:${track.label}:${track.src}`}
                      kind={track.kind ?? "captions"}
                      src={track.src}
                      srcLang={track.language}
                      label={track.label}
                      default={captionsEnabled && Boolean(track.default ?? current.captions?.[0] === track)}
                    />
                  ))}
                </video>
              ) : src && !activeShortFormFrame ? (
                <iframe
                  key={current.key}
                  ref={iframeRef}
                  title={current.title}
                  src={src}
                  tabIndex={current.youtubeId || current.platform === "twitch" ? -1 : undefined}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => {
                    // Loading an Instagram document does not prove its Reel is
                    // playing; it may still be showing provider UI. Keep that
                    // opaque transport state unknown.
                    if (current.platform !== "instagram") {
                      playingRef.current = usesVisibleTimeProxy(current);
                    }
                    setPlaybackError(false);
                  }}
                  className="absolute inset-0 h-full w-full"
                  style={current.youtubeId || current.platform === "twitch" ? { pointerEvents: "none", userSelect: "none" } : undefined}
                />
              ) : src ? null : (
                <div className="absolute inset-0 grid place-items-center bg-[#101014] p-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-white">This title plays on {current.platform}.</p>
                    {current.url ? (
                      <a
                        href={current.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-xs font-semibold text-black ${CONTROL_FEEDBACK} ${PRIMARY_CONTROL_HOVER}`}
                      >
                        Open source
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
              {shortFormFrameDeck.length ? (
                <div
                  data-short-form-preload-deck
                  className="absolute inset-0"
                >
                  {shortFormFrameDeck.map(({ item, src: frameSrc }) => {
                    const active = item.key === current.key;
                    return (
                      <iframe
                        key={item.key}
                        ref={active ? iframeRef : undefined}
                        data-short-form-frame={active ? "active" : "preloaded"}
                        data-short-form-provider={item.youtubeId ? "youtube" : item.platform}
                        data-player-item-key={item.key}
                        title={active ? item.title : `Preloading ${item.title}`}
                        src={frameSrc}
                        loading="eager"
                        tabIndex={active && !item.youtubeId ? undefined : -1}
                        aria-hidden={active ? undefined : true}
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen={active}
                        referrerPolicy="origin"
                        onLoad={() => {
                          if (!active) return;
                          // Instagram does not expose a supported player event
                          // API, so iframe readiness is only visual readiness.
                          setPlaybackError(false);
                        }}
                        className={`absolute inset-0 h-full w-full transition-opacity duration-100 ${active ? "z-[1] opacity-100" : "pointer-events-none z-0 opacity-0"}`}
                        style={active && !item.youtubeId ? undefined : { pointerEvents: "none", userSelect: "none" }}
                      />
                    );
                  })}
                </div>
              ) : null}
              </> : (
                <div className="absolute inset-0 z-30 overflow-hidden bg-[#080608]" role="status" aria-label="Mature audience advisory. The following program is intended for audiences ages 13 and older. Viewer discretion is advised.">
                  <img
                    src={shape === "portrait" ? "/watch/advisory/coretv-mature-audience-station-portrait-v2.png" : "/watch/advisory/coretv-mature-audience-station-v2.png"}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  {waitingForTuningAudio ? (
                    <button type="button" onClick={skipNetworkTuningAudio} className={`absolute bottom-4 right-4 min-h-10 rounded-lg border border-white/20 bg-black/45 px-4 text-[11px] font-extrabold text-white shadow-[0_0_24px_rgba(144,22,52,.28)] backdrop-blur-sm ${CONTROL_FEEDBACK}`}>
                      Skip DJ Cora
                    </button>
                  ) : null}
                </div>
              )}
              {current.kind !== "live" && nativeMedia && current.platform === "house" ? (
                <OnScreenIdentityOverlay
                  contentId={current.key}
                  mode="vod"
                  variant="overlay"
                  getMediaTimeMs={readPresenceTimeMs}
                  mediaElementRef={videoRef}
                  mediaFit="contain"
                />
              ) : null}
              {current.youtubeId ? (
                <button
                  type="button"
                  data-youtube-interaction-shield
                  onClick={togglePlayback}
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                  aria-pressed={isPlaying}
                  className="absolute inset-0 z-[12] cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/85"
                />
              ) : coreTwitchLiveControls && !twitchAutoplayWarmup ? (
                <div
                  data-core-twitch-interaction-shield
                  aria-hidden="true"
                  className="absolute inset-0 z-[12] cursor-default"
                  onDoubleClick={() => void toggleFullscreen()}
                />
              ) : null}
              {coreTwitchLiveControls && !twitchAutoplayWarmup ? (
                <div
                  data-core-twitch-native-controls-cover
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-[18] h-[5.5rem] bg-gradient-to-t from-black via-black/95 to-transparent"
                />
              ) : null}
              {shortFormTheaterNavigation && shortFormNavigation ? (
                <div
                  data-short-form-navigation
                  className="absolute right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-2xl bg-black/70 p-1.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl md:right-3"
                  aria-label={`Short-form navigation, item ${shortFormNavigation.index} of ${shortFormNavigation.total}`}
                >
                  <Tooltip
                    title="Previous short"
                    description={`Go back in ${channel?.title ?? "this short-form lineup"}.`}
                    placement="left"
                  >
                    <button
                      type="button"
                      onClick={() => navigateShortForm("previous")}
                      aria-label="Previous short"
                      aria-keyshortcuts="ArrowUp"
                      className={`grid size-11 place-items-center rounded-xl text-white/75 ring-1 ring-transparent hover:bg-white/15 hover:text-white hover:ring-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5364] md:size-10 ${CONTROL_FEEDBACK}`}
                    >
                      <ChevronUp className="size-5" aria-hidden />
                    </button>
                  </Tooltip>
                  <span className="min-w-9 rounded-full bg-white/10 px-1.5 py-1 text-center text-[9px] font-bold tabular-nums text-white/65" aria-hidden="true">
                    {shortFormNavigation.index}/{shortFormNavigation.total}
                  </span>
                  <Tooltip
                    title="Next short"
                    description={`Keep watching ${channel?.title ?? "this short-form lineup"}.`}
                    placement="left"
                  >
                    <button
                      type="button"
                      onClick={() => navigateShortForm("next")}
                      aria-label="Next short"
                      aria-keyshortcuts="ArrowDown"
                      className={`grid size-11 place-items-center rounded-xl text-white/75 ring-1 ring-transparent hover:bg-white/15 hover:text-white hover:ring-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5364] md:size-10 ${CONTROL_FEEDBACK}`}
                    >
                      <ChevronDown className="size-5" aria-hidden />
                    </button>
                  </Tooltip>
                </div>
              ) : null}
              {!cleanTwitchFrame && !shortsPage ? <PlayerNetworkWatermark channel={channel} compact={!playerScreen} /> : null}
              {!cleanTwitchFrame && channel ? (
                <div data-player-channel-badge className={`absolute z-40 flex items-center gap-2 ${playerScreen ? "left-3 top-3 max-w-[calc(100%-8rem)]" : "left-2 top-2 max-w-[calc(100%-6.5rem)]"}`}>
                  {channel ? channel.href ? (
                    <Link
                      href={channel.href as never}
                      className={`inline-flex min-w-0 items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:bg-black/90 hover:ring-white/40 ${CONTROL_FEEDBACK}`}
                      title={`Open ${channel.title}`}
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-[#ef233c] shadow-[0_0_10px_#ef233c]" />
                      <span className="truncate">{playerScreen ? channel.title : channel.title.replace(/\s+Network\b/i, "")}</span>
                    </Link>
                  ) : (
                    <span className="pointer-events-none inline-flex min-w-0 items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md">
                      <span className="size-1.5 shrink-0 rounded-full bg-[#ef233c] shadow-[0_0_10px_#ef233c]" />
                      <span className="truncate">{playerScreen ? channel.title : channel.title.replace(/\s+Network\b/i, "")}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {socialTheaterPresentation && !cleanTwitchFrame ? (
                <div
                  data-social-theater-presentation
                  className="absolute bottom-4 left-4 z-30 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-2xl border border-white/15 bg-black/72 py-1.5 pl-1.5 pr-2.5 text-white shadow-[0_14px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                >
                  <PlatformMark item={current} />
                  <span className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">{socialTheaterLabel}</span>
                    <span className="block max-w-[13rem] truncate text-xs font-semibold text-white">{current.memberLabel}</span>
                  </span>
                  {(current.sourceUrl ?? current.url) ? (
                    <a
                      href={(current.sourceUrl ?? current.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`ml-1 inline-flex min-h-8 shrink-0 items-center rounded-lg bg-white px-2.5 text-[10px] font-bold text-black hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${CONTROL_FEEDBACK}`}
                    >
                      Original ↗
                    </a>
                  ) : null}
                </div>
              ) : null}
              {!cleanTwitchFrame ? <div className={`watch-player-window-controls absolute z-40 flex items-center ${playerScreen ? "right-3 top-3 gap-2" : "right-2 top-2 gap-1 rounded-full bg-black/75 p-1 shadow-xl ring-1 ring-white/20 backdrop-blur-md"}`}>
                {playerScreen ? (
                  <Tooltip title="Minimize player" description="Keep watching in a compact floating player." placement="bottom">
                    <button
                      type="button"
                      onClick={() => leavePlayerPage(false)}
                      className={`grid size-11 place-items-center rounded-full bg-black/75 text-base text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:bg-white hover:text-black hover:ring-white/70 hover:shadow-2xl md:size-10 ${CONTROL_FEEDBACK}`}
                      aria-label="Minimize player"
                    >
                      ↙
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip title="Open player page" description="Expand this video in the full media player." placement="bottom">
                    <Link
                      href={theaterHref as never}
                      onClick={expand}
                      className={`grid place-items-center rounded-full text-base text-white hover:bg-white hover:text-black hover:shadow-lg ${playerScreen ? "size-11 bg-black/75 shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:ring-white/70 md:size-10" : "size-10 ring-1 ring-transparent hover:ring-white/60"} ${CONTROL_FEEDBACK}`}
                      aria-label="Open on the media player page"
                    >
                      ↗
                    </Link>
                  </Tooltip>
                )}
                <Tooltip title="Close player" description="Stop playback and close the player." placement="bottom">
                  <button
                    type="button"
                    onClick={() => leavePlayerPage(true)}
                    data-player-close
                    className={`grid place-items-center rounded-full text-lg text-white/75 hover:bg-white hover:text-black hover:shadow-lg ${playerScreen ? "size-11 bg-black/75 shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:ring-white/70 md:size-10" : "size-10 ring-1 ring-transparent hover:ring-white/60"} ${CONTROL_FEEDBACK}`}
                    aria-label="Stop playback"
                  >
                    ×
                  </button>
                </Tooltip>
              </div> : null}
              {playerScreen && !cleanTwitchFrame && !coreTwitchLiveControls && (canStartOver || twitchDvrActive) ? (
                <button
                  type="button"
                  onClick={twitchDvrActive ? returnToTwitchLive : startFromBeginning}
                  className={`absolute right-[7.25rem] top-3 z-20 min-h-10 rounded-full bg-black/75 px-4 text-xs font-semibold text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md hover:bg-white hover:text-black hover:ring-white/70 ${CONTROL_FEEDBACK}`}
                  aria-label={twitchDvrActive ? "Go to the live edge" : "Rewind this live stream to the beginning"}
                >
                  {twitchDvrActive ? "Go live" : "Start over"}
                </button>
              ) : null}
              {playerScreen && !cleanTwitchFrame && canSkipIntro && introChapter?.endSeconds ? (
                <button
                  type="button"
                  onClick={() => requestSeek(introChapter.endSeconds!)}
                  className={`absolute bottom-4 right-4 z-20 min-h-11 rounded-xl bg-white/95 px-5 text-sm font-semibold text-black shadow-2xl hover:bg-white hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${CONTROL_FEEDBACK}`}
                >
                  Skip intro
                </button>
              ) : null}
              {playerScreen && !cleanTwitchFrame && matchingFullVideo ? (
                <button
                  type="button"
                  onClick={() => play(matchingFullVideo, queue)}
                  className={`absolute bottom-4 left-4 z-20 min-h-11 max-w-[min(22rem,55%)] truncate rounded-xl bg-black/80 px-4 text-left text-xs font-semibold text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-md hover:bg-white hover:text-black hover:ring-white/70 ${CONTROL_FEEDBACK}`}
                  title={matchingFullVideo.title}
                >
                  Watch full video · {matchingFullVideo.title}
                </button>
              ) : null}
              {(playbackError || twitchStartRequired) && !cleanTwitchFrame ? coreTwitchLiveControls ? (
                <div className="absolute inset-x-3 top-16 z-30 flex justify-center text-center">
                  <div className="rounded-2xl bg-black/82 p-2 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
                    <p className="text-xs font-semibold">Twitch is ready when you are</p>
                    <p className="mt-0.5 text-[10px] text-white/60">Use CORE Play to continue. The provider controls never cover this player.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setTwitchStartRequired(false);
                        setPlaybackError(false);
                        togglePlayback();
                      }}
                      className={`mt-2 min-h-9 rounded-lg bg-white px-3 text-[11px] font-bold text-black ${CONTROL_FEEDBACK} ${PRIMARY_CONTROL_HOVER}`}
                    >
                      Play now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-black/90 p-3 text-xs text-white ring-1 ring-white/20">
                  Playback was blocked or unavailable. Try the source, or move to the next title.
                  <div className="mt-2 flex gap-2">
                    {current.url ? (
                      <a href={current.url} target="_blank" rel="noopener noreferrer" className={`rounded-sm font-semibold underline underline-offset-2 hover:text-white ${CONTROL_FEEDBACK}`}>
                        Open source
                      </a>
                    ) : null}
                    <button type="button" onClick={skip} className={`rounded-sm font-semibold underline underline-offset-2 hover:text-white ${CONTROL_FEEDBACK}`}>
                      Play next
                    </button>
                  </div>
                </div>
              ) : null}
              {countdown != null ? (
                <div className="absolute inset-0 z-30 grid place-items-center bg-black/80 p-5 text-center">
                  <div className="max-w-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Up next in {countdown}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{nextUp?.title ?? "Finding something fresh"}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCountdown(null);
                          skip();
                        }}
                        className={`min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black ${CONTROL_FEEDBACK} ${PRIMARY_CONTROL_HOVER}`}
                      >
                        Play now
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCountdown(null);
                          endingRef.current = false;
                          expand();
                          setQueueOpen(true);
                        }}
                        className={`min-h-11 rounded-xl px-4 text-xs font-semibold text-white ring-1 ring-white/25 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                      >
                        Choose next
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCountdown(null);
                          endingRef.current = false;
                        }}
                        className={`min-h-11 rounded-xl px-4 text-xs font-semibold text-white/70 ring-1 ring-white/15 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                      >
                        Cancel autoplay
                      </button>
                      <button type="button" onClick={stopPlayback} className={`min-h-11 rounded-xl px-3 text-xs text-white/60 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}>
                        Stop
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {!cleanTwitchFrame ? <div className="watch-player-custom-controls" aria-label="Playback controls">
                {customTransport ? (
                  <>
                    <Tooltip
                      title={isPlaying ? "Pause" : "Play"}
                      description={isPlaying ? "Pause this video at the current time." : "Continue this video from the current time."}
                      placement="top"
                    >
                      <button
                        type="button"
                        onClick={togglePlayback}
                        className={CONTROL_FEEDBACK}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
                      </button>
                    </Tooltip>
                    <Tooltip
                      title={isMuted ? "Unmute" : "Mute"}
                      description={isMuted ? "Turn this video's sound back on." : "Turn off sound for this video."}
                      placement="top"
                    >
                      <button
                        type="button"
                        onClick={toggleMuted}
                        className={CONTROL_FEEDBACK}
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                      </button>
                    </Tooltip>
                    {captionSupported ? (
                      <Tooltip
                        title={captionsEnabled ? "Turn captions off" : "Turn captions on"}
                        description={captionsEnabled ? "Hide spoken dialogue and audio cues." : "Show spoken dialogue and audio cues."}
                        placement="top"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (accessibilityPreset === "calm") applyAccessibilityPreset("standard");
                            setCaptionsEnabled(!captionsEnabled);
                          }}
                          className={`${CONTROL_FEEDBACK} ${captionsEnabled ? "is-active" : ""}`}
                          aria-label={`${captionsEnabled ? "Disable" : "Enable"} captions`}
                          aria-pressed={captionsEnabled}
                        >
                          <Captions aria-hidden />
                        </button>
                      </Tooltip>
                    ) : null}
                  </>
                ) : null}
                <span className="watch-player-controls-spacer" />
                {current.kind === "live" && current.platform === "twitch" && current.twitchLogin ? (
                  <TwitchSubscribeCta login={current.twitchLogin} />
                ) : null}
                {current.platform === "youtube" && current.youtubeId && (
                  current.memberSlug || current.memberLabel.trim().toLowerCase() === "core"
                ) ? (
                  <YouTubeSubscribeCta
                    memberSlug={current.memberSlug ?? "house"}
                  />
                ) : null}
                {coreTwitchLiveControls ? (
                  <div className="watch-twitch-quality is-core-overlay">
                    <WatchSelect
                      compact
                      ariaLabel="Twitch playback quality"
                      value={twitchQuality}
                      onChange={updateTwitchQuality}
                      options={twitchQualityOptions}
                    />
                  </div>
                ) : null}
                {canAddMultiview ? (
                  <Tooltip
                    title="Add another view"
                    description="Keep this playing while you choose another title, Twitch stream, or YouTube video."
                    placement="top"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        beginCinematicTransition("/multiview?picker=1");
                        router.push("/multiview?picker=1" as never);
                      }}
                      className={CONTROL_FEEDBACK}
                      aria-label="Add another view"
                    >
                      <LayoutGrid aria-hidden />
                    </button>
                  </Tooltip>
                ) : null}
                {playerScreen ? (
                  <Tooltip
                    title={queueOpen ? "Close side panel" : companionChatChannel ? "Live chat & more" : "Up next & details"}
                    description={queueOpen ? "Hide the queue, live chat, and video details." : companionChatChannel ? "Open live chat, your queue, and video details." : "Open your queue and video details."}
                    placement="top"
                  >
                    <button
                      ref={companionTriggerRef}
                      type="button"
                      onClick={() => toggleCompanion()}
                      className={`${CONTROL_FEEDBACK} ${queueOpen ? "is-active" : ""}`}
                      aria-label={queueOpen ? "Close player sidebar" : companionChatChannel ? "Open live chat and player sidebar" : `Open player sidebar${queue.length ? `, ${queue.length} queued items` : ""}`}
                      aria-expanded={queueOpen}
                      aria-controls="player-companion-panel"
                    >
                      {companionChatChannel ? <MessageSquareText aria-hidden /> : <ListVideo aria-hidden />}
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip
                  title={playbackSettingsOpen ? "Close settings" : "Player settings"}
                  description={playbackSettingsOpen ? "Return to the video controls." : "Adjust playback, accessibility, quality, and devices."}
                  placement="top"
                >
                  <button
                    ref={settingsTriggerRef}
                    type="button"
                    onClick={() => setPlaybackSettingsOpen((open) => !open)}
                    className={`${CONTROL_FEEDBACK} ${playbackSettingsOpen ? "is-active" : ""}`}
                    aria-label={playbackSettingsOpen ? "Close player settings" : "Open player settings"}
                    aria-expanded={playbackSettingsOpen}
                    aria-controls="playback-settings-panel"
                    aria-haspopup="dialog"
                  >
                    <Settings2 aria-hidden />
                  </button>
                </Tooltip>
                {playerScreen ? (
                  <Tooltip
                    title={isFullscreen ? "Exit full screen" : "Enter full screen"}
                    description={isFullscreen ? "Return this video to the media player page." : "Expand this video to fill your screen."}
                    placement="top"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleFullscreen()}
                      className={CONTROL_FEEDBACK}
                      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
                    >
                      <Maximize aria-hidden />
                    </button>
                  </Tooltip>
                ) : null}
              </div> : null}
              {(canScrub || coreTwitchAtLiveEdge) && !cleanTwitchFrame ? (
                <div
                  className={`watch-player-scrubber ${coreTwitchAtLiveEdge ? "is-live-edge" : twitchDvrActive ? "is-live-dvr" : ""}`}
                  style={{
                    ["--watch-scrubber-progress" as string]: `${
                      coreTwitchAtLiveEdge ? liveDvrPreviewProgress : scrubberProgress
                    }%`,
                  }}
                  data-player-scrubber
                  data-player-live-edge={coreTwitchAtLiveEdge ? true : undefined}
                >
                  {coreTwitchAtLiveEdge ? (
                    <>
                      <span className="watch-player-live-offset">
                        {twitchLiveDvrAvailable ? `−${playbackClock(liveDvrPreviewBehind)}` : "Now"}
                      </span>
                      {twitchLiveDvrAvailable ? (
                        <input
                          type="range"
                          min={0}
                          max={liveDvrWindowDuration}
                          step={1}
                          value={liveDvrPreviewPosition}
                          onChange={(event) => setLiveDvrPreviewSeconds(Number(event.currentTarget.value))}
                          onPointerUp={(event) => startTwitchDvrAt(Number(event.currentTarget.value))}
                          onKeyUp={(event) => {
                            if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                              startTwitchDvrAt(Number(event.currentTarget.value));
                            }
                          }}
                          aria-label={`Rewind ${current.title}`}
                          aria-valuetext={
                            liveDvrPreviewBehind <= 1
                              ? "At the live edge"
                              : `${playbackClock(liveDvrPreviewBehind)} behind live`
                          }
                          className="cursor-grab rounded-full transition-[filter,box-shadow] duration-100 hover:brightness-125 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
                        />
                      ) : (
                        <div
                          className="watch-player-live-track"
                          role="status"
                          aria-label="Live playback is at the live edge"
                        >
                          <span />
                        </div>
                      )}
                      <span className="watch-player-live-badge"><i aria-hidden />Live</span>
                    </>
                  ) : (
                    <>
                      <span>{playbackClock(scrubberPosition)}</span>
                      <input
                        type="range"
                        min={0}
                        max={scrubberDuration}
                        step={0.1}
                        value={scrubberPosition}
                        onChange={(event) => seekTo(Number(event.currentTarget.value))}
                        aria-label={`Seek through ${current.title}`}
                        aria-valuetext={`${playbackClock(scrubberPosition)} of ${playbackClock(scrubberDuration)}`}
                        className="cursor-grab rounded-full transition-[filter,box-shadow] duration-100 hover:brightness-125 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
                      />
                      {twitchDvrActive ? (
                        <Tooltip
                          title="Go live"
                          description="Leave the rewind window and return to the current live moment."
                          placement="top"
                        >
                          <button
                            type="button"
                            className={`watch-player-go-live ${CONTROL_FEEDBACK}`}
                            onClick={returnToTwitchLive}
                            aria-label="Go to the live edge"
                          >
                            <i aria-hidden />
                            Live
                          </button>
                        </Tooltip>
                      ) : <span>{playbackClock(scrubberDuration)}</span>}
                    </>
                  )}
                </div>
              ) : null}
            </div>
            {playerScreen && guideMenuOpen ? <TheaterNetworkGuide onReturn={() => setGuideMenuOpen(false)} /> : null}
            {restoreGuideVodDetails ? (
              <Tooltip title="Show Now Playing" description="Reopen this video's details." placement="left">
                <button
                  ref={guideDetailsRestoreRef}
                  type="button"
                  className="watch-guide-vod-restore"
                  onClick={reopenGuideVodDetails}
                  aria-label="Show Now Playing details"
                  aria-controls="guide-vod-program-details"
                  aria-expanded="false"
                >
                  <PanelRightOpen aria-hidden />
                  <span>Now Playing</span>
                </button>
              </Tooltip>
            ) : null}
            {inlineGuideVodDetails && activeAiring ? (
              <aside id="guide-vod-program-details" className="watch-guide-vod-details" aria-labelledby="guide-vod-program-title">
                <div>
                  <div className="watch-guide-vod-heading">
                    <span className="watch-guide-vod-badge">
                      <span>VOD</span>
                      Video on demand
                    </span>
                    <Tooltip title="Collapse details" description="Give the video more room." placement="left">
                      <button
                        ref={guideDetailsCollapseRef}
                        type="button"
                        className="watch-guide-vod-collapse"
                        onClick={collapseGuideVodDetails}
                        aria-label="Collapse Now Playing details"
                        aria-controls="guide-vod-program-details"
                        aria-expanded="true"
                      >
                        <PanelRightClose aria-hidden />
                      </button>
                    </Tooltip>
                  </div>
                  <p className="watch-guide-vod-kicker">Now Playing</p>
                  <h2 id="guide-vod-program-title">{current.title}</h2>
                  <p className="watch-guide-vod-channel">{activeAiring.network} · {activeAiring.channel}</p>
                </div>
                <dl className="watch-guide-vod-facts">
                  <div>
                    <dt>Airtime</dt>
                    <dd>{activeAiringLabel ?? "Using your local time…"}</dd>
                  </div>
                  <div>
                    <dt>Creator</dt>
                    <dd>{polishedLabel(current.accountLabel ?? current.memberLabel)}</dd>
                  </div>
                  {scrubberDuration > 0 ? (
                    <div>
                      <dt>Length</dt>
                      <dd>{playbackClock(scrubberDuration)}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="watch-guide-vod-actions">
                  <button type="button" onClick={toggleDvrSave} disabled={dvrActionLoading} aria-pressed={Boolean(dvrUser && savedToDvr)}>
                    <Archive aria-hidden />
                    {dvrLocked ? "Unlock DVR" : savedToDvr ? "Saved to DVR" : "Add to DVR"}
                  </button>
                  {dvrUser && dvrAllowed ? <Link href={"/dvr" as never}>Open DVR</Link> : null}
                  {current.sourceUrl || current.url ? (
                    <a href={(current.sourceUrl || current.url)!} target="_blank" rel="noopener noreferrer">Open on Twitch</a>
                  ) : null}
                </div>
              </aside>
            ) : null}
            </div>
            {cleanTwitchFrame ? (
              <div className="watch-twitch-control-rail" data-core-twitch-controls aria-label="CORE playback controls">
                <Tooltip
                  title={isPlaying ? "Pause" : "Play"}
                  description={isPlaying ? "Pause this broadcast at the current time." : "Continue this broadcast from the current time."}
                  placement="top"
                >
                  <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
                  </button>
                </Tooltip>
                <Tooltip
                  title={isMuted ? "Unmute" : "Mute"}
                  description={isMuted ? "Turn this broadcast's sound back on." : "Turn off sound for this broadcast."}
                  placement="top"
                >
                  <button type="button" onClick={toggleMuted} aria-label={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                  </button>
                </Tooltip>
                {canScrub ? (
                  <div className="watch-twitch-control-scrubber" style={{ ["--watch-scrubber-progress" as string]: `${scrubberProgress}%` }}>
                    <span>{playbackClock(scrubberPosition)}</span>
                    <input
                      type="range"
                      min={0}
                      max={scrubberDuration}
                      step={0.1}
                      value={scrubberPosition}
                      onChange={(event) => seekTo(Number(event.currentTarget.value))}
                      aria-label={`Seek through ${current.title}`}
                      aria-valuetext={`${playbackClock(scrubberPosition)} of ${playbackClock(scrubberDuration)}`}
                    />
                    <span>{playbackClock(scrubberDuration)}</span>
                  </div>
                ) : <span className="watch-player-controls-spacer" />}
                <div className="watch-twitch-quality">
                  <WatchSelect
                    compact
                    ariaLabel="Twitch playback quality"
                    value={twitchQuality}
                    onChange={updateTwitchQuality}
                    options={twitchQualityOptions}
                  />
                </div>
                {captionSupported ? (
                  <Tooltip
                    title={captionsEnabled ? "Turn captions off" : "Turn captions on"}
                    description={captionsEnabled ? "Hide spoken dialogue and audio cues." : "Show spoken dialogue and audio cues."}
                    placement="top"
                  >
                    <button type="button" onClick={() => setCaptionsEnabled(!captionsEnabled)} className={captionsEnabled ? "is-active" : ""} aria-label={`${captionsEnabled ? "Disable" : "Enable"} captions`} aria-pressed={captionsEnabled}>
                      <Captions aria-hidden />
                    </button>
                  </Tooltip>
                ) : null}
                {canAddMultiview ? (
                  <Tooltip
                    title="Add another view"
                    description="Keep this playing while you choose another title, Twitch stream, or YouTube video."
                    placement="top"
                  >
                    <button type="button" onClick={() => {
                      beginCinematicTransition("/multiview?picker=1");
                      router.push("/multiview?picker=1" as never);
                    }} aria-label="Add another view">
                      <LayoutGrid aria-hidden />
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip
                  title={playbackSettingsOpen ? "Close settings" : "Player settings"}
                  description={playbackSettingsOpen ? "Return to the broadcast controls." : "Adjust playback, accessibility, quality, and devices."}
                  placement="top"
                >
                  <button ref={settingsTriggerRef} type="button" onClick={() => setPlaybackSettingsOpen((open) => !open)} className={playbackSettingsOpen ? "is-active" : ""} aria-label={playbackSettingsOpen ? "Close player settings" : "Open player settings"} aria-expanded={playbackSettingsOpen} aria-controls="playback-settings-panel">
                    <Settings2 aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip
                  title={isFullscreen ? "Exit full screen" : "Enter full screen"}
                  description={isFullscreen ? "Return this broadcast to the media player page." : "Expand this broadcast to fill your screen."}
                  placement="top"
                >
                  <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}>
                    <Maximize aria-hidden />
                  </button>
                </Tooltip>
              </div>
            ) : null}
            {current.kind !== "live"
              && !imageMedia
              && !usesVisibleTimeProxy(current)
              && !(nativeMedia && current.platform === "house") ? (
              <OnScreenIdentityOverlay
                contentId={current.key}
                mode="vod"
                variant="rail"
                getMediaTimeMs={readPresenceTimeMs}
              />
            ) : null}
            {!playerScreen ? (
            <div
              data-player-details
              className="relative border-t border-white/10"
            >
              <div
                className={
                  "flex min-h-[5rem] min-w-0 items-start gap-2.5 px-3 py-2.5"
                }
              >
                {channel?.artwork ? (
                  <img
                    src={channel.artwork}
                    alt=""
                    aria-hidden
                    className="mt-0.5 size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                  />
                ) : null}
                <div className="min-w-0 flex-1" aria-live={activeAiring ? "polite" : undefined}>
                  {channel ? (
                    <p
                      className="mb-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-[#ff5364]"
                      title={activeAiring ? `${activeAiring.network} · ${activeAiring.channel}` : channel.title}
                    >
                      {activeAiring
                        ? `Tuned to ${activeAiring.network} · ${activeAiring.channel}`
                        : `Playing on ${channel.title}`}
                    </p>
                  ) : null}
                  <p
                    className="line-clamp-2 text-[13px] font-semibold leading-[1.05rem] text-white"
                    title={current.title}
                  >
                    {current.title}
                  </p>
                  <p className={`mt-0.5 truncate text-[10px] leading-4 ${activeAiringLabel ? "font-medium text-white/70" : "text-white/50"}`} title={activeAiringLabel ?? undefined}>
                    {activeAiringLabel ?? (
                      <>
                        {polishedLabel(current.accountLabel ?? current.memberLabel)}
                        {activeChapter ? ` · ${activeChapter.title}` : ""}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
            ) : null}
            {playbackSettingsOpen ? (
              <section
                ref={settingsPanelRef}
                id="playback-settings-panel"
                role="dialog"
                className={`z-[52] max-h-[calc(100dvh-1.5rem)] overscroll-contain overflow-y-auto rounded-2xl bg-[#121216]/96 p-3.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl ${playerPanelPosition}`}
                aria-label="Player settings"
                data-player-settings
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Player settings</p>
                  <Tooltip title="Close settings" description="Return to the video controls." placement="bottom">
                    <button
                      type="button"
                      data-player-settings-close
                      onClick={() => {
                        setPlaybackSettingsOpen(false);
                        window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
                      }}
                      className={`grid size-11 shrink-0 place-items-center rounded-xl text-lg text-white/55 md:size-10 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                      aria-label="Close player settings"
                    >
                      ×
                    </button>
                  </Tooltip>
                </div>

                <div className="mt-3 space-y-4">
                  <div>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Playback</p>
                    <div className="divide-y divide-white/8 overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-inset ring-white/10">
                      <PlayerSettingToggle
                        label="Ambient lighting"
                        description={
                          ambientPausedReason
                            ? `Paused by ${accessibilityPreset === "calm" ? "Calm mode" : "Data Saver"}`
                            : "Match colors to the video"
                        }
                        checked={ambientLighting && !ambientPausedReason}
                        disabled={Boolean(ambientPausedReason)}
                        onChange={setAmbientLighting}
                      />
                      <PlayerSettingToggle
                        label="Autoplay"
                        description="Play the next video"
                        checked={autoplay}
                        onChange={setAutoplay}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Accessibility</p>
                    <div className="divide-y divide-white/8 overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-inset ring-white/10">
                      <PlayerSettingToggle
                        label="Closed captions"
                        description={captionSupported ? "Show spoken words" : "Unavailable for this video"}
                        checked={captionSupported && captionsEnabled}
                        disabled={!captionSupported}
                        onChange={(value) => {
                          if (accessibilityPreset === "calm") applyAccessibilityPreset("standard");
                          setCaptionsEnabled(value);
                        }}
                      />
                      <PlayerSettingToggle
                        label="Audio description"
                        description={audioDescriptionSupported ? "Describe visual action" : "Unavailable for this video"}
                        checked={audioDescriptionSupported && audioDescription}
                        disabled={!audioDescriptionSupported}
                        onChange={(value) => {
                          if (accessibilityPreset === "calm") applyAccessibilityPreset("standard");
                          setAudioDescription(value);
                        }}
                      />
                      <PlayerSettingToggle
                        label="Calm mode"
                        description="Less motion and autoplay"
                        checked={accessibilityPreset === "calm"}
                        onChange={(value) => applyAccessibilityPreset(value ? "calm" : "standard")}
                      />
                    </div>
                  </div>

                  {rateSupported || qualitySupported || coreTwitchLiveControls ? (
                    <div className="grid gap-2">
                      {rateSupported ? (
                        <div>
                          <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Speed</p>
                          <label className="watch-player-speed-control">
                            <span className="watch-player-speed-value">
                              <span>Playback speed</span>
                              <output>{playbackRateLabel(playbackRate)}</output>
                            </span>
                            <input
                              type="range"
                              min={0.5}
                              max={2}
                              step={0.25}
                              value={playbackRate}
                              onChange={(event) => {
                                const value = Number(event.currentTarget.value);
                                if (!Number.isFinite(value)) return;
                                if (accessibilityPreset === "calm") applyAccessibilityPreset("standard");
                                setPlaybackRate(value);
                              }}
                              aria-label="Playback speed"
                              aria-valuetext={playbackRateLabel(playbackRate)}
                              style={{ ["--watch-speed-progress" as string]: `${((playbackRate - 0.5) / 1.5) * 100}%` }}
                            />
                            <span className="watch-player-speed-scale" aria-hidden="true">
                              <span>0.5×</span>
                              <span>1×</span>
                              <span>1.5×</span>
                              <span>2.0×</span>
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {qualitySupported ? (
                        <div>
                          <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Quality</p>
                          <WatchSelect
                            compact
                            ariaLabel="Playback quality"
                            value={qualityPreference}
                            onChange={(value) => setQualityPreference(value as typeof qualityPreference)}
                            options={[
                              { id: "auto", label: "Auto" },
                              { id: "best", label: "Best available" },
                              { id: "balanced", label: "Balanced" },
                              { id: "data-saver", label: "Data saver" },
                            ]}
                          />
                        </div>
                      ) : coreTwitchLiveControls ? (
                        <div>
                          <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Quality</p>
                          <WatchSelect
                            compact
                            ariaLabel="Twitch playback quality"
                            value={twitchQuality}
                            onChange={updateTwitchQuality}
                            options={twitchQualityOptions}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {nativeCapabilities.pip || nativeCapabilities.remote || nativeCapabilities.airplay ? (
                    <div className="grid grid-cols-2 gap-2">
                      {nativeCapabilities.pip ? (
                        <button
                          type="button"
                          onClick={() => void enterPictureInPicture()}
                          className={`min-h-11 rounded-xl bg-white/[0.035] px-3 text-xs font-semibold text-white/72 ring-1 ring-inset ring-white/10 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                        >
                          Picture in Picture
                        </button>
                      ) : null}
                      {nativeCapabilities.remote || nativeCapabilities.airplay ? (
                        <button
                          type="button"
                          onClick={() => void openRemotePlayback()}
                          className={`min-h-11 rounded-xl bg-white/[0.035] px-3 text-xs font-semibold text-white/72 ring-1 ring-inset ring-white/10 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                        >
                          Play on device
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {chapters.length ? (
                    <div>
                      <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">Chapters</p>
                      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                        {chapters.map((chapter) => (
                          <button
                            key={`${chapter.startSeconds}:${chapter.title}`}
                            type="button"
                            onClick={() => requestSeek(chapter.startSeconds)}
                            className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-xs ring-1 ${CONTROL_FEEDBACK} ${activeChapter === chapter ? "bg-white text-black ring-white shadow-sm hover:bg-white/90 hover:text-black" : `text-white/70 ring-white/10 ${CONTROL_HOVER}`}`}
                          >
                            <span className="truncate">{chapter.title}</span>
                            <span className="shrink-0 tabular-nums opacity-60">{playbackClock(chapter.startSeconds)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {current.kind !== "live" ? (
                    <div>
                      <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/42">History</p>
                      <button
                        type="button"
                        disabled={Boolean(activeMark?.completed)}
                        onClick={() => markWatched(
                          progressRef(current),
                          current.kind,
                          current.memberSlug,
                          uiDuration || current.durationSeconds,
                        )}
                        className={`min-h-11 w-full rounded-xl bg-white/[0.035] px-3 text-left text-xs font-semibold text-white/72 ring-1 ring-inset ring-white/10 disabled:cursor-default disabled:text-white/40 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                      >
                        {activeMark?.completed ? "Marked watched" : "Mark as watched"}
                        <span className="mt-0.5 block text-[10px] font-normal text-white/42">
                          Completes the progress bar without adding watch time.
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          {queueOpen && playerScreen && !isFullscreen ? (
            <aside
              id="player-companion-panel"
              aria-label="Player sidebar"
              data-player-companion-ready={playerStageShellHeight ? true : undefined}
              style={playerStageShellHeight ? { ["--watch-player-companion-height" as string]: `${playerStageShellHeight}px` } : undefined}
              className="watch-player-companion fixed inset-x-2 bottom-2 top-16 z-40 flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[#101014]/90 shadow-2xl ring-1 ring-white/15 backdrop-blur-2xl lg:static lg:shadow-none"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-white/10 p-2">
                <div
                  role="tablist"
                  aria-label="Player sidebar views"
                  className="grid min-w-0 flex-1 grid-flow-col auto-cols-fr gap-1 rounded-xl bg-black/25 p-1"
                >
                  {availableCompanionViews.map((view) => {
                    const selected = activeCompanionView === view;
                    const label = view === "up-next" ? "Up next" : view === "chat" ? "Live chat" : "Details";
                    const Icon = view === "up-next" ? ListVideo : view === "chat" ? MessageSquareText : Info;
                    return (
                      <Tooltip
                        key={view}
                        title={label}
                        description={view === "details" ? "Review this title’s information and quick actions." : view === "up-next" ? "Manage what plays after this title." : "Open the live conversation for this channel."}
                        placement="bottom"
                      >
                        <button
                          id={`player-companion-tab-${view}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls="player-companion-view"
                          tabIndex={selected ? 0 : -1}
                          onClick={() => setCompanionView(view)}
                          onKeyDown={onCompanionTabKeyDown}
                          className={`inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold shadow-sm ring-1 ring-transparent transition-[transform,background-color,color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${selected ? "bg-white text-black ring-white/80 shadow-white/10 hover:bg-white/90" : "text-white/60 hover:bg-white/12 hover:text-white hover:ring-white/12"}`}
                        >
                          <Icon className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{label}</span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
                <Tooltip title="Close side panel" description="Hide the queue, chat, and video details." placement="bottom">
                  <button
                    type="button"
                    onClick={closeCompanion}
                    className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl text-white/55 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                    aria-label="Close player sidebar"
                  >
                    ×
                  </button>
                </Tooltip>
              </div>

              <div
                id="player-companion-view"
                role="tabpanel"
                aria-labelledby={`player-companion-tab-${activeCompanionView}`}
                tabIndex={0}
                className={`min-h-0 flex-1 ${guideOverlayOpen && activeCompanionView === "details" ? "overflow-y-auto" : "overflow-hidden"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 ${activeCompanionView === "chat" ? "" : "p-2"}`}
              >
                {activeCompanionView === "up-next" ? (
                  <>
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                        {channel ? `Up next on ${channel.title}` : "Up next"}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-white/60">
                        {channel
                          ? channel.subtitle ?? "This channel keeps its lineup in order and loops continuously."
                          : "Live moves to the front. Your choice keeps playing."}
                      </p>
                    </div>
                    {!shortsPage ? (
                      <div className="mb-2 grid grid-cols-3 gap-1.5">
                        <div className="relative">
                          <WatchSelect
                            ariaLabel="Autoplay mode"
                            value={autoplayMode}
                            onChange={(value) => setAutoplayMode(value as typeof autoplayMode)}
                            options={AUTOPLAY_MODES.map((entry) => ({ id: entry.id, label: entry.label }))}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewAutoplay(!previewAutoplay)}
                          aria-pressed={previewAutoplay}
                          className={`min-h-11 rounded-xl px-2 text-[10px] font-semibold ring-1 ${CONTROL_FEEDBACK} ${previewAutoplay ? "bg-white/15 text-white ring-white/35 shadow-sm hover:bg-white/20 hover:ring-white/45" : `text-white/45 ring-white/10 ${CONTROL_HOVER}`}`}
                        >
                          Previews {previewAutoplay ? "on" : "off"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDataSaver(!dataSaver)}
                          aria-pressed={dataSaver}
                          className={`min-h-11 rounded-xl px-2 text-[10px] font-semibold ring-1 ${CONTROL_FEEDBACK} ${dataSaver ? "bg-white/15 text-white ring-white/35 shadow-sm hover:bg-white/20 hover:ring-white/45" : `text-white/45 ring-white/10 ${CONTROL_HOVER}`}`}
                        >
                          Data saver {dataSaver ? "on" : "off"}
                        </button>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {queue.slice(0, 3).map((item, index) => (
                        <article key={item.key} className="group relative isolate min-h-[4.5rem] overflow-hidden rounded-xl bg-[#17171c] ring-1 ring-white/10 transition hover:ring-white/25">
                          {item.poster ? (
                            <img
                              src={item.poster}
                              alt=""
                              aria-hidden
                              className="absolute inset-0 -z-20 h-full w-full object-cover opacity-90 saturate-[1.04] transition duration-300 group-hover:scale-[1.025] group-hover:opacity-100 motion-reduce:transition-none"
                            />
                          ) : null}
                          <span className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black/55 via-black/15 to-transparent" aria-hidden />
                          <button
                            type="button"
                            onClick={() => playFromQueue(item.key)}
                            className={`flex min-h-[4.5rem] w-full min-w-0 flex-col justify-end px-3 py-2 pr-12 text-left ${CONTROL_FEEDBACK}`}
                          >
                            <span className="mb-1.5 flex items-center gap-1.5">
                              <PlatformMark item={item} />
                              {index === 0 ? <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/80">Next</span> : null}
                              {item.kind === "live" ? <span className="rounded-full bg-[#ef233c] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white">Live</span> : null}
                            </span>
                            <span className="block line-clamp-2 text-xs font-semibold leading-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">{item.title}</span>
                            {item.recommendationReason ? <span className="mt-0.5 block truncate text-[10px] text-white/55">{item.recommendationReason}</span> : null}
                          </button>
                          <Tooltip title="Remove from queue" description="Remove this video from Up next." placement="left">
                            <button
                              type="button"
                              onClick={() => removeFromQueue(item.key)}
                              className={`absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white/60 ring-1 ring-white/10 backdrop-blur-sm ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
                              aria-label={`Remove ${item.title} from queue`}
                            >
                              ×
                            </button>
                          </Tooltip>
                        </article>
                      ))}
                      {queue.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-xs text-white/40">
                          The next fresh title will be found automatically.
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : activeCompanionView === "chat" && companionChatChannel ? (
                  <div className="h-full min-h-0 p-2">
                    <ChatDock
                      channels={[companionChatChannel]}
                      mode="focused"
                      focusedLogin={companionChatChannel.login}
                      maxConnected={1}
                      dataSaver={dataSaver}
                      showTimestamps={showChatTimestamps}
                      showToolbar={false}
                      className="h-full min-h-0"
                    />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {current.poster ? (
                      <img src={current.poster} alt="" className="h-24 w-full rounded-xl object-cover ring-1 ring-white/10" />
                    ) : null}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5364]">Now playing</p>
                      <h2 className="mt-0.5 line-clamp-2 text-base font-semibold leading-tight text-white">{current.title}</h2>
                      <p className="mt-0.5 truncate text-[11px] text-white/50">
                        {formatDisplayLabel(current.accountLabel ?? current.memberLabel)} · {current.platform} · {current.kind === "live" ? "Live" : playbackClock(scrubberDuration)}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-xl bg-white/[0.035] p-2.5 ring-1 ring-white/10">
                      <div>
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Source</dt>
                        <dd className="mt-0.5 text-xs font-medium text-white/80">{current.platform === "youtube" ? "YouTube" : current.platform === "twitch" ? "Twitch" : current.platform === "instagram" ? "Instagram" : current.platform === "tiktok" ? "TikTok" : "CORE"}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Duration</dt>
                        <dd className="mt-0.5 text-xs font-medium text-white/80">{current.kind === "live" ? twitchDvrActive ? playbackClock(scrubberDuration) : "Live now" : playbackClock(scrubberDuration)}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Current time</dt>
                        <dd className="mt-0.5 text-xs font-medium text-white/80">{current.kind === "live" && !twitchDvrActive ? "Live edge" : `${playbackClock(scrubberPosition)} / ${playbackClock(scrubberDuration)}`}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Channel</dt>
                        <dd className="mt-0.5 truncate text-xs font-medium text-white/80">{channel?.title ?? current.memberLabel}</dd>
                      </div>
                    </dl>
                    <div className="grid grid-cols-2 gap-2">
                      <Tooltip title={dvrLocked ? "DVR with CORE Membership" : dvrUser && savedToDvr ? "Remove from DVR" : "Add to DVR"} description={dvrLocked ? "DVR is included with CORE Membership." : dvrUser ? "Keep this in your DVR for later." : "Sign in to save this to your DVR."} placement="top">
                        <button type="button" onClick={toggleDvrSave} disabled={dvrActionLoading} aria-pressed={Boolean(dvrUser && savedToDvr)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 ${savedToDvr ? "bg-white text-black ring-white" : `bg-white/[0.04] text-white/80 ring-white/12 ${CONTROL_HOVER}`} ${CONTROL_FEEDBACK}`}><Archive className="size-3.5" aria-hidden />{dvrLocked ? "Unlock DVR" : savedToDvr ? "In DVR" : "Add to DVR"}</button>
                      </Tooltip>
                      <Tooltip title={activeMark?.completed ? "Marked watched" : "Mark as watched"} description="Complete this title in your watch history." placement="top">
                        <button type="button" onClick={() => markWatched(progressRef(current), current.kind, current.memberSlug, uiDuration || current.durationSeconds)} disabled={Boolean(activeMark?.completed)} className={`min-h-11 rounded-xl px-3 text-xs font-semibold text-white/75 ring-1 ring-white/12 ${CONTROL_FEEDBACK} ${CONTROL_HOVER} disabled:cursor-default disabled:opacity-45`}>{activeMark?.completed ? "Watched" : "Mark watched"}</button>
                      </Tooltip>
                      <Tooltip title="More like this" description="Use this to tune future recommendations." placement="top">
                        <button type="button" onClick={() => setCurrentFeedback("like")} aria-pressed={currentFeedback === "like"} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 ${currentFeedback === "like" ? "bg-white text-black ring-white" : `text-white/75 ring-white/12 ${CONTROL_HOVER}`} ${CONTROL_FEEDBACK}`}><ThumbsUp className="size-3.5" aria-hidden />Like</button>
                      </Tooltip>
                      <Tooltip title="Less interested" description="Show fewer recommendations like this title." placement="top">
                        <button type="button" onClick={() => setCurrentFeedback("not_interested")} aria-pressed={currentFeedback === "not_interested"} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 ${currentFeedback === "not_interested" ? "bg-white text-black ring-white" : `text-white/75 ring-white/12 ${CONTROL_HOVER}`} ${CONTROL_FEEDBACK}`}><ThumbsDown className="size-3.5" aria-hidden />Less interested</button>
                      </Tooltip>
                    </div>
                    {activeChapter && !playerScreen ? (
                      <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">Current chapter</p>
                        <p className="mt-1 text-sm font-semibold text-white">{activeChapter.title}</p>
                      </div>
                    ) : null}
                    {chapters.length && !playerScreen ? (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">Chapters</p>
                        <div className="space-y-1">
                          {chapters.map((chapter) => (
                            <button
                              key={`${chapter.startSeconds}:${chapter.title}`}
                              type="button"
                              onClick={() => requestSeek(chapter.startSeconds)}
                              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-xs ring-1 ${CONTROL_FEEDBACK} ${activeChapter === chapter ? "bg-white text-black ring-white" : `text-white/70 ring-white/10 ${CONTROL_HOVER}`}`}
                            >
                              <span className="truncate">{chapter.title}</span>
                              <span className="shrink-0 tabular-nums opacity-60">{playbackClock(chapter.startSeconds)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {!playerScreen && (current.sourceUrl ?? current.url) ? (
                      <a
                        href={(current.sourceUrl ?? current.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-4 text-xs font-semibold text-black ${CONTROL_FEEDBACK} ${PRIMARY_CONTROL_HOVER}`}
                      >
                        Open original
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {availableHandoff ? (
        <HandoffPrompt snapshot={availableHandoff} onContinue={acceptHandoff} onDismiss={handoff.dismiss} />
      ) : null}

      {livePrompt ? (
        <div className="fixed right-3 top-[4.5rem] z-[95] w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl bg-[#121216] p-3 text-white shadow-2xl ring-1 ring-white/20">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--live)]">Just went live</p>
          <p className="mt-1 truncate text-sm font-semibold">{formatHandleDisplay(livePrompt.login)}</p>
          <p className="mt-1 line-clamp-2 text-xs text-white/55">{livePrompt.title || "Live now"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const member = MEMBERS.find(
                  (entry) => entry.twitchLogin.toLowerCase() === livePrompt.login.toLowerCase(),
                );
                play({
                  key: `live-${member?.slug ?? livePrompt.login}`,
                  kind: "live",
                  platform: "twitch",
                  title: livePrompt.title || `${member?.stageName ?? livePrompt.login} live`,
                  poster: livePrompt.thumbnailUrl || member?.portrait || "",
                  memberSlug: member?.slug ?? null,
                  memberLabel: member?.stageName ?? livePrompt.login,
                  youtubeId: null,
                  twitchLogin: livePrompt.login,
                  vodId: null,
                  clipSrc: null,
                  clipId: null,
                  url: `https://twitch.tv/${livePrompt.login}`,
                  format: "live",
                });
                setLivePrompt(null);
              }}
              className={`min-h-11 rounded-xl bg-[color:var(--live)] px-4 text-xs font-semibold hover:brightness-110 hover:shadow-[0_6px_20px_rgba(239,35,60,0.24)] ${CONTROL_FEEDBACK}`}
            >
              Switch to live
            </button>
            <button
              type="button"
              onClick={() => {
                const member = MEMBERS.find(
                  (entry) => entry.twitchLogin.toLowerCase() === livePrompt.login.toLowerCase(),
                );
                addTile({
                  key: `live-${member?.slug ?? livePrompt.login}`,
                  kind: "live",
                  platform: "twitch",
                  title: livePrompt.title || `${member?.stageName ?? livePrompt.login} live`,
                  poster: livePrompt.thumbnailUrl || member?.portrait || "",
                  memberSlug: member?.slug ?? null,
                  memberLabel: member?.stageName ?? livePrompt.login,
                  youtubeId: null,
                  twitchLogin: livePrompt.login,
                  vodId: null,
                  clipSrc: null,
                  clipId: null,
                  url: `https://twitch.tv/${livePrompt.login}`,
                  format: "live",
                }, { focus: false });
                setLivePrompt(null);
              }}
              className={`min-h-11 rounded-xl px-4 text-xs font-semibold text-white ring-1 ring-white/20 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
            >
              Add tile
            </button>
            <button
              type="button"
              onClick={() => setLivePrompt(null)}
              className={`min-h-11 rounded-xl px-4 text-xs text-white/65 ring-1 ring-white/15 ${CONTROL_FEEDBACK} ${CONTROL_HOVER}`}
            >
              Keep watching
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

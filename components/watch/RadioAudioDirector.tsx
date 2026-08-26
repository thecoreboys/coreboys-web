"use client";

import { Radio, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  RADIO_CUE_LIFECYCLE_EVENT,
  RADIO_CUE_REQUEST_EVENT,
  RADIO_CUE_SKIP_EVENT,
  RADIO_NETWORK_LIVE_TAKEOVER_EVENT,
  RADIO_USER_GESTURE_EVENT,
  chooseRadioCue,
  emitRadioCueLifecycle,
  isApprovedRadioAudioUrl,
  normalizeRadioCueRequest,
  normalizeRadioNetworkLiveTakeoverEvent,
  radioCueHistoryKey,
  radioCuePriority,
  rememberRadioCue,
  rememberRadioCueEntry,
  setRadioAudioDirectorMounted,
  wasRadioCueRemembered,
  type RadioCue,
  type RadioCueLifecycleEvent,
  type RadioCueOutcome,
  type RadioCueRequest,
  type RadioNetworkLiveTakeoverEvent,
} from "@/lib/radio-client";
import styles from "./RadioAudioDirector.module.css";

const FADE_MS = 180;
const GESTURE_GRACE_MS = 4_000;
const MAX_QUEUE_DEPTH = 2;
const LIVE_TAKEOVER_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1_000;

type CaptionMode = "always" | "fallback" | "off";

type ActivePlayback = {
  token: number;
  request: RadioCueRequest & { id: string; cue: RadioCue };
  audio: HTMLAudioElement;
  resolve?: (outcome: RadioCueOutcome) => void;
  completed: boolean;
  requestResolved: boolean;
  fadeFrame: number | null;
  onEnded: () => void;
  onError: () => void;
};

type Presentation = {
  token: number;
  request: RadioCueRequest & { id: string; cue: RadioCue };
  blocked: boolean;
  reason?: string;
};

type QueuedPlayback = {
  request: RadioCueRequest & { id: string; cue: RadioCue };
  resolve?: (outcome: RadioCueOutcome) => void;
};

export type RadioAudioDirectorProps = {
  /** Local preference supplied by the account/settings layer. */
  enabled?: boolean;
  /** 0–1 volume multiplier for DJ Cora only. */
  volume?: number;
  /** Visible, human-reviewed cue captions. */
  captions?: CaptionMode;
  /** Optional catalog used to resolve `core:watch-network-live-takeover` events. */
  cueCatalog?: readonly RadioCue[];
  /** Custom catalog resolver. It must return an approved static cue/request. */
  resolveLiveTakeoverCue?: (
    event: RadioNetworkLiveTakeoverEvent,
    catalog: readonly RadioCue[],
  ) => RadioCueRequest | RadioCue | null;
  onLifecycle?: (event: RadioCueLifecycleEvent) => void;
  className?: string;
};

function clamp(value: number, lower = 0, upper = 1) {
  return Math.min(upper, Math.max(lower, value));
}

function cueLabel(request: RadioCueRequest & { cue: RadioCue }) {
  return request.cue.title?.trim()
    || (request.kind === "live_takeover" ? "Live switch" : "DJ Cora");
}

function cueCaption(request: RadioCueRequest & { cue: RadioCue }) {
  return request.cue.caption?.trim()
    || request.cue.transcript?.trim()
    || (request.kind === "live_takeover" && request.creatorName
      ? `${request.creatorName} just went live.`
      : "DJ Cora is on the line.");
}

function displayNameForReason(reason?: string) {
  if (reason === "user_gesture_required") return "Tap play to hear DJ Cora.";
  return "Your browser needs a quick audio confirmation.";
}

function requestFromCue(
  cue: RadioCue,
  overrides: Partial<RadioCueRequest> = {},
): RadioCueRequest {
  return {
    ...cue,
    ...overrides,
    id: overrides.id ?? cue.id,
    kind: overrides.kind ?? cue.kind,
    audioUrl: overrides.audioUrl ?? cue.audioUrl,
    cue,
  };
}

function isCue(value: RadioCueRequest | RadioCue): value is RadioCue {
  return "id" in value && "audioUrl" in value && !("cue" in value && value.cue);
}

/**
 * The one mounted client owner for short DJ Cora voice assets.
 *
 * It only accepts pre-rendered asset URLs from the approved catalog/request.
 * There is intentionally no provider, TTS, fetch, prompt, or generated audio
 * path here, so additional viewers never create additional generation cost.
 */
export function RadioAudioDirector({
  enabled = true,
  volume = 0.72,
  captions = "always",
  cueCatalog = [],
  resolveLiveTakeoverCue,
  onLifecycle,
  className,
}: RadioAudioDirectorProps) {
  const reducedMotion = useReducedMotion();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const activeRef = useRef<ActivePlayback | null>(null);
  const queueRef = useRef<QueuedPlayback[]>([]);
  const tokenRef = useRef(0);
  const mountedRef = useRef(false);
  const recentUserGestureAtRef = useRef(0);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(clamp(volume));
  const captionsRef = useRef<CaptionMode>(captions);
  const catalogRef = useRef<readonly RadioCue[]>(cueCatalog);
  const resolverRef = useRef(resolveLiveTakeoverCue);
  const lifecycleRef = useRef(onLifecycle);
  const reducedMotionRef = useRef(reducedMotion);

  enabledRef.current = enabled;
  volumeRef.current = clamp(volume);
  captionsRef.current = captions;
  catalogRef.current = cueCatalog;
  resolverRef.current = resolveLiveTakeoverCue;
  lifecycleRef.current = onLifecycle;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    mountedRef.current = true;
    setRadioAudioDirectorMounted(true);

    const publish = (
      request: RadioCueRequest & { id: string; cue: RadioCue },
      outcome: RadioCueOutcome,
    ) => {
      const event: RadioCueLifecycleEvent = {
        ...outcome,
        at: Date.now(),
        networkSlug: request.networkSlug ?? null,
        creatorSlug: request.creatorSlug ?? null,
        sourceContentId: request.sourceContentId ?? null,
      };
      emitRadioCueLifecycle(event);
      lifecycleRef.current?.(event);
    };

    const clearPresentation = (token: number) => {
      if (!mountedRef.current) return;
      setPresentation((current) => current?.token === token ? null : current);
    };

    const fadeTo = (playback: ActivePlayback, destination: number, duration: number) => new Promise<void>((resolve) => {
      if (playback.fadeFrame !== null) cancelAnimationFrame(playback.fadeFrame);
      const start = playback.audio.volume;
      const target = clamp(destination);
      if (!duration || Math.abs(start - target) < 0.01) {
        playback.audio.volume = target;
        playback.fadeFrame = null;
        resolve();
        return;
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        if (activeRef.current !== playback || playback.completed) {
          playback.fadeFrame = null;
          resolve();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        playback.audio.volume = start + ((target - start) * progress);
        if (progress >= 1) {
          playback.fadeFrame = null;
          resolve();
          return;
        }
        playback.fadeFrame = requestAnimationFrame(step);
      };
      playback.fadeFrame = requestAnimationFrame(step);
    });

    const drainQueue = () => {
      if (activeRef.current || !queueRef.current.length) return;
      const next = queueRef.current.shift();
      if (!next) return;
      void accept(next.request, next.resolve);
    };

    const finish = (
      playback: ActivePlayback,
      status: Extract<RadioCueOutcome["status"], "finished" | "skipped" | "interrupted">,
      reason?: string,
      shouldDrain = true,
    ) => {
      if (activeRef.current !== playback || playback.completed) return;
      playback.completed = true;
      if (playback.fadeFrame !== null) cancelAnimationFrame(playback.fadeFrame);
      playback.audio.removeEventListener("ended", playback.onEnded);
      playback.audio.removeEventListener("error", playback.onError);
      if (status !== "finished") {
        playback.audio.pause();
        playback.audio.currentTime = 0;
      }
      activeRef.current = null;
      clearPresentation(playback.token);
      const outcome: RadioCueOutcome = { status, cueId: playback.request.id, kind: playback.request.kind, reason };
      publish(playback.request, outcome);
      // A start request resolves exactly once. Lifecycle events carry later
      // finished/skipped/interrupted state for analytics and UI consumers.
      if (!playback.requestResolved) {
        playback.requestResolved = true;
        playback.resolve?.(outcome);
      }
      if (shouldDrain) drainQueue();
    };

    const stop = async (
      status: Extract<RadioCueOutcome["status"], "skipped" | "interrupted">,
      reason: string,
      shouldDrain = true,
    ) => {
      const playback = activeRef.current;
      if (!playback) return;
      await fadeTo(playback, 0, reducedMotionRef.current ? 0 : FADE_MS);
      finish(playback, status, reason, shouldDrain);
    };

    const showBlockedFallback = (
      request: RadioCueRequest & { id: string; cue: RadioCue },
      reason: string,
    ) => {
      if (!mountedRef.current) return;
      setPresentation({ token: ++tokenRef.current, request, blocked: true, reason });
    };

    const start = async (
      request: RadioCueRequest & { id: string; cue: RadioCue },
      resolve?: (outcome: RadioCueOutcome) => void,
    ) => {
      const targetVolume = clamp((typeof request.cue.volume === "number" ? request.cue.volume : 1) * volumeRef.current);
      const audio = new Audio(request.audioUrl);
      audio.preload = "auto";
      audio.volume = 0;

      const token = ++tokenRef.current;
      const onEnded = () => finish(playback, "finished", "ended");
      const onError = () => {
        if (activeRef.current !== playback || playback.completed) return;
        playback.completed = true;
        if (playback.fadeFrame !== null) cancelAnimationFrame(playback.fadeFrame);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        activeRef.current = null;
        clearPresentation(token);
        const outcome: RadioCueOutcome = { status: "autoplay_blocked", cueId: request.id, kind: request.kind, reason: "audio_error" };
        // Even if captions are disabled, an autoplay rejection needs an
        // actionable visual fallback; otherwise the saved cue is silent with
        // no way for a visitor to confirm it manually.
        showBlockedFallback(request, "audio_error");
        publish(request, outcome);
        playback.requestResolved = true;
        resolve?.(outcome);
        drainQueue();
      };
      const playback: ActivePlayback = { token, request, audio, resolve, completed: false, requestResolved: false, fadeFrame: null, onEnded, onError };
      activeRef.current = playback;
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });

      try {
        await audio.play();
      } catch {
        if (activeRef.current !== playback || playback.completed) return;
        playback.completed = true;
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        activeRef.current = null;
        const outcome: RadioCueOutcome = { status: "autoplay_blocked", cueId: request.id, kind: request.kind, reason: "play_rejected" };
        showBlockedFallback(request, "play_rejected");
        publish(request, outcome);
        playback.requestResolved = true;
        resolve?.(outcome);
        drainQueue();
        return;
      }

      if (activeRef.current !== playback || playback.completed) {
        audio.pause();
        return;
      }
      rememberRadioCue(request.cue, { historyKey: request.historyKey });
      if (request.kind === "live_takeover" && request.sourceContentId) {
        rememberRadioCueEntry({
          id: `source:${request.sourceContentId}`,
          key: `live_takeover:${request.networkSlug?.trim() || "global"}`,
          at: Date.now(),
        }, "session");
      }
      if (captionsRef.current === "always" && mountedRef.current) {
        setPresentation({ token, request, blocked: false });
      }
      const outcome: RadioCueOutcome = { status: "started", cueId: request.id, kind: request.kind };
      publish(request, outcome);
      playback.requestResolved = true;
      resolve?.(outcome);
      void fadeTo(playback, targetVolume, reducedMotionRef.current ? 0 : FADE_MS);
    };

    const suppress = (
      request: RadioCueRequest & { id: string; cue: RadioCue },
      resolve: ((outcome: RadioCueOutcome) => void) | undefined,
      reason: string,
    ) => {
      const outcome: RadioCueOutcome = { status: "suppressed", cueId: request.id, kind: request.kind, reason };
      publish(request, outcome);
      resolve?.(outcome);
    };

    const accept = async (
      incoming: RadioCueRequest,
      resolve?: (outcome: RadioCueOutcome) => void,
    ) => {
      const request = normalizeRadioCueRequest(incoming);
      if (!isApprovedRadioAudioUrl(request.audioUrl)) {
        const outcome: RadioCueOutcome = { status: "invalid", cueId: request.id, kind: request.kind, reason: "invalid_audio_url" };
        publish(request, outcome);
        resolve?.(outcome);
        return;
      }
      if (!enabledRef.current) {
        suppress(request, resolve, "disabled");
        return;
      }
      // This is intentionally a hard condition, not merely lower priority.
      // A new 24/7 takeover can never speak over a visitor's other live view.
      if (request.kind === "live_takeover" && (request.viewerIsWatchingLive || request.allowWhenLive === false)) {
        suppress(request, resolve, request.viewerIsWatchingLive ? "viewer_already_watching_live" : "live_takeover_not_allowed");
        return;
      }
      const historyKey = radioCueHistoryKey(request.cue, request.historyKey);
      const noRepeatWindowMs = Math.max(0, request.noRepeatWindowMs ?? request.cue.cooldownMs ?? 6 * 60 * 60 * 1_000);
      if (request.kind === "live_takeover" && request.sourceContentId) {
        const sourceKey = `live_takeover:${request.networkSlug?.trim() || "global"}`;
        if (wasRadioCueRemembered(`source:${request.sourceContentId}`, sourceKey, { scope: "session", withinMs: LIVE_TAKEOVER_DEDUPE_WINDOW_MS })) {
          suppress(request, resolve, "source_already_announced_this_session");
          return;
        }
      }
      if (!request.allowRepeat && wasRadioCueRemembered(request.id, historyKey, { scope: "both", withinMs: noRepeatWindowMs })) {
        suppress(request, resolve, "cue_recently_played");
        return;
      }
      if (request.requiresUserGesture && Date.now() - recentUserGestureAtRef.current > GESTURE_GRACE_MS) {
        const outcome: RadioCueOutcome = { status: "autoplay_blocked", cueId: request.id, kind: request.kind, reason: "user_gesture_required" };
        showBlockedFallback(request, "user_gesture_required");
        publish(request, outcome);
        resolve?.(outcome);
        return;
      }

      const active = activeRef.current;
      if (active) {
        if (radioCuePriority(request.cue) > radioCuePriority(active.request.cue)) {
          await stop("interrupted", "preempted_by_higher_priority", false);
          await start(request, resolve);
          return;
        }
        if (request.queueIfBusy && queueRef.current.length < MAX_QUEUE_DEPTH) {
          // `queued` is the terminal response for this request promise. The
          // eventual start/finish is delivered through the lifecycle event,
          // avoiding a second callback resolution for raw event consumers.
          queueRef.current.push({ request });
          const outcome: RadioCueOutcome = { status: "queued", cueId: request.id, kind: request.kind, reason: "lower_priority_than_active_cue" };
          publish(request, outcome);
          resolve?.(outcome);
          return;
        }
        suppress(request, resolve, "audio_layer_busy");
        return;
      }

      await start(request, resolve);
    };

    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<RadioCueRequest & { resolve?: (outcome: RadioCueOutcome) => void }>).detail;
      if (!detail || typeof detail !== "object") return;
      void accept(detail, detail.resolve);
    };

    const handleSkip = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason ?? "user_skip";
      void stop("skipped", reason);
    };

    const markGesture = () => {
      recentUserGestureAtRef.current = Date.now();
    };

    const handleTakeover = (event: Event) => {
      const detail = normalizeRadioNetworkLiveTakeoverEvent((event as CustomEvent<unknown>).detail);
      if (!detail?.networkSlug || !detail.sourceContentId) return;
      // `previous` is supplied by the network page. Treat a prior live item as
      // live viewing conservatively; no surprise station break-ins between
      // live streams even if an integration forgets the explicit boolean.
      const viewerIsWatchingLive = detail.viewerIsWatchingLive === true || detail.previous?.kind === "live";
      if (viewerIsWatchingLive || detail.allowWhenLive === false) {
        const cueId = detail.cue?.id ?? null;
        const outcome: RadioCueOutcome = { status: "suppressed", cueId, kind: "live_takeover", reason: viewerIsWatchingLive ? "viewer_already_watching_live" : "live_takeover_not_allowed" };
        const pseudo = normalizeRadioCueRequest({
          id: cueId ?? `takeover:${detail.sourceContentId}`,
          kind: "live_takeover",
          audioUrl: detail.cue?.audioUrl ?? detail.audioUrl ?? "/audio/network-tunes/core-247.mp3",
          networkSlug: detail.networkSlug,
          creatorName: detail.creatorName,
          creatorSlug: detail.creatorSlug,
          sourceContentId: detail.sourceContentId,
        });
        publish(pseudo, outcome);
        return;
      }

      const resolverValue = resolverRef.current?.(detail, catalogRef.current) ?? null;
      let next: RadioCueRequest | null = null;
      if (resolverValue) {
        next = isCue(resolverValue)
          ? requestFromCue(resolverValue, { kind: "live_takeover", networkSlug: detail.networkSlug, creatorName: detail.creatorName, creatorSlug: detail.creatorSlug, sourceContentId: detail.sourceContentId, viewerIsWatchingLive, allowWhenLive: detail.allowWhenLive ?? true, priority: detail.priority ?? resolverValue.priority ?? undefined })
          : { ...resolverValue, kind: "live_takeover", networkSlug: detail.networkSlug, creatorName: detail.creatorName, creatorSlug: detail.creatorSlug, sourceContentId: detail.sourceContentId, viewerIsWatchingLive, allowWhenLive: detail.allowWhenLive ?? true, priority: detail.priority ?? resolverValue.priority ?? undefined };
      } else if (detail.cue) {
        next = requestFromCue(detail.cue, { kind: "live_takeover", networkSlug: detail.networkSlug, creatorName: detail.creatorName, creatorSlug: detail.creatorSlug, sourceContentId: detail.sourceContentId, viewerIsWatchingLive, allowWhenLive: detail.allowWhenLive ?? true, priority: detail.priority ?? detail.cue.priority ?? undefined, transcript: detail.transcript ?? detail.cue.transcript ?? undefined, caption: detail.caption ?? detail.cue.caption ?? undefined });
      } else if (detail.audioUrl) {
        next = { id: `takeover:${detail.sourceContentId}:${detail.audioUrl}`, kind: "live_takeover", audioUrl: detail.audioUrl, networkSlug: detail.networkSlug, creatorName: detail.creatorName, creatorSlug: detail.creatorSlug, sourceContentId: detail.sourceContentId, viewerIsWatchingLive, allowWhenLive: detail.allowWhenLive ?? true, priority: detail.priority ?? undefined, transcript: detail.transcript ?? undefined, caption: detail.caption ?? undefined };
      } else {
        const alternatives = catalogRef.current.filter((cue) => cue.kind === "live_takeover" && (!cue.networkSlug || cue.networkSlug === detail.networkSlug));
        const selection = chooseRadioCue(alternatives, { historyKey: `live_takeover:${detail.networkSlug}` });
        if (selection) {
          next = requestFromCue(selection.cue, { kind: "live_takeover", networkSlug: detail.networkSlug, creatorName: detail.creatorName, creatorSlug: detail.creatorSlug, sourceContentId: detail.sourceContentId, viewerIsWatchingLive, allowWhenLive: detail.allowWhenLive ?? true, priority: detail.priority ?? selection.cue.priority ?? undefined, transcript: detail.transcript ?? selection.cue.transcript ?? undefined, caption: detail.caption ?? selection.cue.caption ?? undefined, allowRepeat: selection.repeated });
        }
      }
      if (!next) {
        const pseudo = normalizeRadioCueRequest({
          id: `takeover:${detail.sourceContentId}`,
          kind: "live_takeover",
          audioUrl: "/audio/network-tunes/core-247.mp3",
          networkSlug: detail.networkSlug,
          creatorName: detail.creatorName,
          creatorSlug: detail.creatorSlug,
          sourceContentId: detail.sourceContentId,
        });
        publish(pseudo, { status: "unavailable", cueId: null, kind: "live_takeover", reason: "no_approved_takeover_cue" });
        return;
      }
      void accept(next);
    };

    window.addEventListener(RADIO_CUE_REQUEST_EVENT, handleRequest);
    window.addEventListener(RADIO_CUE_SKIP_EVENT, handleSkip);
    window.addEventListener(RADIO_NETWORK_LIVE_TAKEOVER_EVENT, handleTakeover);
    window.addEventListener(RADIO_USER_GESTURE_EVENT, markGesture);
    document.addEventListener("pointerdown", markGesture, true);
    document.addEventListener("keydown", markGesture, true);
    document.addEventListener("click", markGesture, true);

    return () => {
      mountedRef.current = false;
      setRadioAudioDirectorMounted(false);
      window.removeEventListener(RADIO_CUE_REQUEST_EVENT, handleRequest);
      window.removeEventListener(RADIO_CUE_SKIP_EVENT, handleSkip);
      window.removeEventListener(RADIO_NETWORK_LIVE_TAKEOVER_EVENT, handleTakeover);
      window.removeEventListener(RADIO_USER_GESTURE_EVENT, markGesture);
      document.removeEventListener("pointerdown", markGesture, true);
      document.removeEventListener("keydown", markGesture, true);
      document.removeEventListener("click", markGesture, true);
      const playback = activeRef.current;
      if (playback) {
        playback.completed = true;
        if (playback.fadeFrame !== null) cancelAnimationFrame(playback.fadeFrame);
        playback.audio.pause();
        playback.audio.removeEventListener("ended", playback.onEnded);
        playback.audio.removeEventListener("error", playback.onError);
        activeRef.current = null;
      }
      queueRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!enabled) window.dispatchEvent(new CustomEvent<{ reason: string }>(RADIO_CUE_SKIP_EVENT, { detail: { reason: "audio_disabled" } }));
  }, [enabled]);

  const retry = () => {
    if (!presentation?.blocked) return;
    window.dispatchEvent(new CustomEvent<RadioCueRequest>(RADIO_CUE_REQUEST_EVENT, {
      detail: {
        ...presentation.request,
        requiresUserGesture: false,
        allowRepeat: true,
      },
    }));
    setPresentation(null);
  };

  const dismiss = () => {
    if (presentation?.blocked) setPresentation(null);
    else window.dispatchEvent(new CustomEvent<{ reason: string }>(RADIO_CUE_SKIP_EVENT, { detail: { reason: "caption_dismissed" } }));
  };

  if (!presentation || (!presentation.blocked && captions === "off")) return null;
  const caption = cueCaption(presentation.request);
  return (
    <aside
      className={`${styles.root}${presentation.blocked ? ` ${styles.isBlocked}` : ""}${className ? ` ${className}` : ""}`}
      aria-live="polite"
      aria-label={presentation.blocked ? "DJ Cora audio needs confirmation" : "DJ Cora announcement"}
    >
      <div className={styles.icon} aria-hidden><Radio /></div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{presentation.blocked ? "DJ CORA · AUDIO READY" : "DJ CORA · ON AIR"}</span>
        <strong>{cueLabel(presentation.request)}</strong>
        <p>{presentation.blocked ? displayNameForReason(presentation.reason) : caption}</p>
      </div>
      {presentation.blocked ? (
        <button type="button" className={styles.play} onClick={retry}>
          <Volume2 aria-hidden /> Play voice
        </button>
      ) : (
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Skip DJ Cora">
          <X aria-hidden />
        </button>
      )}
    </aside>
  );
}

/** Useful to analytics callers without importing the implementation event name. */
export { RADIO_CUE_LIFECYCLE_EVENT };

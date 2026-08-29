"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
import { Strands } from "@/components/ui/Strands";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { writeRadioAudioSettings } from "@/lib/radio/settings";
import { playRadioTunerTick } from "@/lib/radio/tuning-sound";
import { useAuth } from "@/components/providers/AuthProvider";

const FADE_MS = 180;
const GESTURE_GRACE_MS = 4_000;
const MAX_QUEUE_DEPTH = 2;
const LIVE_TAKEOVER_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const RADIO_WIDGET_PLACEMENT_KEY = "core:radio-widget-placement:v1";
const WIDGET_INSET = 12;
const EDGE_HIDE_THRESHOLD = 56;

type WidgetEdge = "left" | "right" | "top" | "bottom";

type WidgetPlacement = {
  x: number;
  y: number;
  hiddenEdge: WidgetEdge | null;
  edgeOffset: number | null;
};

type WidgetDrag = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

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
  analysisFrame: number | null;
  analysisSource: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
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

type ActiveCuePresentation = {
  token: number;
  request: RadioCueRequest & { id: string; cue: RadioCue };
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
  /** Current channel or route context, supplied by the shared player. */
  tunedNetwork?: string | null;
  tunerNetworks?: readonly { slug: string; name: string; artwork?: string }[];
  onTuneNetwork?: (slug: string) => void;
  /** Automatically tuck the widget away on immersive player routes. */
  autoCollapse?: boolean;
  className?: string;
};

function clamp(value: number, lower = 0, upper = 1) {
  return Math.min(upper, Math.max(lower, value));
}

function isWidgetEdge(value: unknown): value is WidgetEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom";
}

function readWidgetPlacement(): WidgetPlacement | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RADIO_WIDGET_PLACEMENT_KEY) ?? "null") as Partial<WidgetPlacement> | null;
    if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return {
      x: Number(parsed.x),
      y: Number(parsed.y),
      hiddenEdge: isWidgetEdge(parsed.hiddenEdge) ? parsed.hiddenEdge : null,
      edgeOffset: Number.isFinite(parsed.edgeOffset) ? Number(parsed.edgeOffset) : null,
    };
  } catch {
    return null;
  }
}

function saveWidgetPlacement(placement: WidgetPlacement) {
  try {
    window.localStorage.setItem(RADIO_WIDGET_PLACEMENT_KEY, JSON.stringify(placement));
  } catch {
    // A private browsing policy can disable localStorage; dragging still works.
  }
}

function clampVisiblePlacement(placement: WidgetPlacement, width: number, height: number) {
  return {
    x: clamp(placement.x, WIDGET_INSET, Math.max(WIDGET_INSET, window.innerWidth - width - WIDGET_INSET)),
    y: clamp(placement.y, WIDGET_INSET, Math.max(WIDGET_INSET, window.innerHeight - height - WIDGET_INSET)),
    hiddenEdge: null,
    edgeOffset: null,
  } satisfies WidgetPlacement;
}

function hiddenWidgetPlacement(edge: WidgetEdge, edgeOffset: number, width: number, height: number) {
  if (edge === "left" || edge === "right") {
    return {
      x: edge === "left" ? -width - WIDGET_INSET : window.innerWidth + WIDGET_INSET,
      y: clamp(edgeOffset - height / 2, WIDGET_INSET, Math.max(WIDGET_INSET, window.innerHeight - height - WIDGET_INSET)),
      hiddenEdge: edge,
      edgeOffset: clamp(edgeOffset, 36, Math.max(36, window.innerHeight - 36)),
    } satisfies WidgetPlacement;
  }

  return {
    x: clamp(edgeOffset - width / 2, WIDGET_INSET, Math.max(WIDGET_INSET, window.innerWidth - width - WIDGET_INSET)),
    y: edge === "top" ? -height - WIDGET_INSET : window.innerHeight + WIDGET_INSET,
    hiddenEdge: edge,
    edgeOffset: clamp(edgeOffset, 36, Math.max(36, window.innerWidth - 36)),
  } satisfies WidgetPlacement;
}

function edgeRestoreStyle(edge: WidgetEdge, edgeOffset: number): CSSProperties {
  if (edge === "left" || edge === "right") {
    return {
      [edge]: 0,
      top: clamp(edgeOffset, 36, Math.max(36, window.innerHeight - 36)),
      transform: "translateY(-50%)",
    };
  }

  return {
    [edge]: 0,
    left: clamp(edgeOffset, 36, Math.max(36, window.innerWidth - 36)),
    transform: "translateX(-50%)",
  };
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
  tunedNetwork = null,
  tunerNetworks = [],
  onTuneNetwork,
  autoCollapse = false,
  className,
}: RadioAudioDirectorProps) {
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [activeCue, setActiveCue] = useState<ActiveCuePresentation | null>(null);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [tunerIndex, setTunerIndex] = useState(0);
  const [placement, setPlacement] = useState<WidgetPlacement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const placementRef = useRef<WidgetPlacement | null>(null);
  const dragRef = useRef<WidgetDrag | null>(null);
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
  const audioContextRef = useRef<AudioContext | null>(null);

  enabledRef.current = enabled;
  volumeRef.current = clamp(volume);
  captionsRef.current = captions;
  catalogRef.current = cueCatalog;
  resolverRef.current = resolveLiveTakeoverCue;
  lifecycleRef.current = onLifecycle;
  reducedMotionRef.current = reducedMotion;

  const updatePlacement = useCallback((next: WidgetPlacement, persist = false) => {
    placementRef.current = next;
    setPlacement(next);
    if (persist) saveWidgetPlacement(next);
  }, []);

  useEffect(() => {
    let resizeFrame = 0;

    const placeWidget = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const width = root.offsetWidth || rect.width;
      const height = root.offsetHeight || rect.height;
      const current = placementRef.current ?? readWidgetPlacement();
      const next = current?.hiddenEdge
        ? hiddenWidgetPlacement(current.hiddenEdge, current.edgeOffset ?? (current.hiddenEdge === "left" || current.hiddenEdge === "right" ? rect.top + height / 2 : rect.left + width / 2), width, height)
        : clampVisiblePlacement(current ?? { x: rect.left, y: rect.top, hiddenEdge: null, edgeOffset: null }, width, height);
      updatePlacement(next, Boolean(current));
    };

    const onResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(placeWidget);
    };

    placeWidget();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(resizeFrame);
    };
  }, [updatePlacement]);

  useEffect(() => {
    const index = tunerNetworks.findIndex((network) => network.name === tunedNetwork);
    if (index >= 0) setTunerIndex(index);
  }, [tunedNetwork, tunerNetworks]);

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

    const stopVoiceMeter = (playback: ActivePlayback) => {
      if (playback.analysisFrame !== null) cancelAnimationFrame(playback.analysisFrame);
      playback.analysisFrame = null;
      playback.analysisSource?.disconnect();
      playback.analyser?.disconnect();
      playback.analysisSource = null;
      playback.analyser = null;
      if (mountedRef.current) setVoiceLevel(0);
    };

    const startVoiceMeter = (playback: ActivePlayback) => {
      try {
        const AudioContextCtor = window.AudioContext
          || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;
        const context = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        const source = context.createMediaElementSource(playback.audio);
        source.connect(analyser);
        analyser.connect(context.destination);
        playback.analysisSource = source;
        playback.analyser = analyser;
        const samples = new Uint8Array(analyser.frequencyBinCount);
        let lastPaint = 0;
        const tick = (now: number) => {
          if (activeRef.current !== playback || playback.completed) return;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 5.2);
          if (now - lastPaint > 48) { setVoiceLevel(level); lastPaint = now; }
          playback.analysisFrame = requestAnimationFrame(tick);
        };
        void context.resume().catch(() => undefined);
        playback.analysisFrame = requestAnimationFrame(tick);
      } catch {
        // The indicator still has a restrained fallback pulse on browsers
        // that cannot attach Web Audio to an HTML media element.
      }
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
      stopVoiceMeter(playback);
      activeRef.current = null;
      setActiveCue((current) => current?.token === playback.token ? null : current);
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
        setActiveCue((current) => current?.token === token ? null : current);
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
      const playback: ActivePlayback = { token, request, audio, resolve, completed: false, requestResolved: false, fadeFrame: null, onEnded, onError, analysisFrame: null, analysisSource: null, analyser: null };
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
        setActiveCue((current) => current?.token === token ? null : current);
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
      setActiveCue({ token, request });
      startVoiceMeter(playback);
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
        stopVoiceMeter(playback);
      }
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      setActiveCue(null);
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

  const activeRequest = activeCue?.request ?? presentation?.request ?? null;
  const isSpeaking = Boolean(activeCue);
  const blocked = Boolean(presentation?.blocked);
  const caption = activeRequest
    ? cueCaption(activeRequest)
    : tunedNetwork
      ? `Signal locked to ${tunedNetwork}. DJ Cora is standing by.`
      : "Choose a network to tune in.";
  const label = activeRequest ? cueLabel(activeRequest) : tunedNetwork ?? "Untuned";
  const signalLevel = isSpeaking ? Math.max(voiceLevel, 0.1) : 0;
  const selectedNetwork = tunerNetworks[tunerIndex] ?? null;
  const moveTuner = (value: number) => {
    if (value === tunerIndex) return;
    setTunerIndex(value);
    playRadioTunerTick({ enabled, volume, reducedMotion });
  };
  const commitTuner = (index = tunerIndex) => {
    const nextNetwork = tunerNetworks[index];
    if (nextNetwork) onTuneNetwork?.(nextNetwork.slug);
  };
  const toggleAudio = () => writeRadioAudioSettings({ enabled: !enabled });
  const openSettings = () => window.location.assign("/account/settings#radio");
  const skip = () => window.dispatchEvent(new CustomEvent<{ reason: string }>(RADIO_CUE_SKIP_EVENT, { detail: { reason: "radio_widget_skip" } }));

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || placement?.hiddenEdge) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, textarea, [role='button']")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    event.preventDefault();
  };

  const continueDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updatePlacement({
      x: clamp(event.clientX - drag.offsetX, -drag.width + 24, window.innerWidth - 24),
      y: clamp(event.clientY - drag.offsetY, -drag.height + 24, window.innerHeight - 24),
      hiddenEdge: null,
      edgeOffset: null,
    });
    event.preventDefault();
  };

  const finishDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = placementRef.current ?? {
      x: event.currentTarget.getBoundingClientRect().left,
      y: event.currentTarget.getBoundingClientRect().top,
      hiddenEdge: null,
      edgeOffset: null,
    };
    const edgeCandidate = ([
      { edge: "left" as const, overflow: -current.x },
      { edge: "right" as const, overflow: current.x + drag.width - window.innerWidth },
      { edge: "top" as const, overflow: -current.y },
      { edge: "bottom" as const, overflow: current.y + drag.height - window.innerHeight },
    ]).sort((a, b) => b.overflow - a.overflow)[0]!;

    const next = edgeCandidate.overflow >= EDGE_HIDE_THRESHOLD
      ? hiddenWidgetPlacement(
          edgeCandidate.edge,
          edgeCandidate.edge === "left" || edgeCandidate.edge === "right"
            ? current.y + drag.height / 2
            : current.x + drag.width / 2,
          drag.width,
          drag.height,
        )
      : clampVisiblePlacement(current, drag.width, drag.height);

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    updatePlacement(next, true);
  };

  const restoreWidget = () => {
    const edge = placement?.hiddenEdge;
    const root = rootRef.current;
    if (!edge || !root) return;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const edgeOffset = placement.edgeOffset ?? (edge === "left" || edge === "right" ? window.innerHeight / 2 : window.innerWidth / 2);
    const next = clampVisiblePlacement({
      x: edge === "left" ? WIDGET_INSET : edge === "right" ? window.innerWidth - width - WIDGET_INSET : edgeOffset - width / 2,
      y: edge === "top" ? WIDGET_INSET : edge === "bottom" ? window.innerHeight - height - WIDGET_INSET : edgeOffset - height / 2,
      hiddenEdge: null,
      edgeOffset: null,
    }, width, height);
    updatePlacement(next, true);
  };

  const widgetStyle: CSSProperties | undefined = placement
    ? { left: placement.x, top: placement.y, right: "auto", bottom: "auto" }
    : undefined;
  const restoreStyle = placement?.hiddenEdge && placement.edgeOffset !== null
    ? edgeRestoreStyle(placement.hiddenEdge, placement.edgeOffset)
    : undefined;
  const RestoreIcon = placement?.hiddenEdge === "left"
    ? ChevronRight
    : placement?.hiddenEdge === "right"
      ? ChevronLeft
      : placement?.hiddenEdge === "top"
        ? ChevronDown
        : ChevronUp;

  return (
    <>
      <aside
        ref={rootRef}
        className={`${styles.root}${isDragging ? ` ${styles.isDragging}` : ""}${placement?.hiddenEdge ? ` ${styles.isHidden}` : ""}${autoCollapse ? ` ${styles.isAutoCollapsed}` : ""}${blocked ? ` ${styles.isBlocked}` : ""}${isSpeaking ? ` ${styles.isSpeaking}` : ""}${tunedNetwork ? ` ${styles.isTuned}` : ` ${styles.isUntuned}`}${className ? ` ${className}` : ""}`}
        style={widgetStyle}
        aria-live="polite"
        aria-hidden={placement?.hiddenEdge || autoCollapse ? true : undefined}
        aria-label={blocked ? "DJ Cora audio needs confirmation" : "DJ Cora radio"}
        onPointerDown={startDragging}
        onPointerMove={continueDragging}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
        onLostPointerCapture={finishDragging}
      >
      {tunerNetworks.length ? <div className={styles.tuner}>
        <div className={styles.tunerReadout}>
          {selectedNetwork?.slug === "core" ? (
            <CoreWordmark className={styles.networkWordmark} />
          ) : selectedNetwork?.artwork ? (
            <img className={styles.networkMark} src={selectedNetwork.artwork} alt="" draggable={false} />
          ) : null}
          <span>CHANNEL DIAL</span>
          <strong>{selectedNetwork?.name ?? "UNTUNED"}</strong>
        </div>
        <div className={styles.dialTrack}>
          <input
            type="range"
            min="0"
            max={Math.max(0, tunerNetworks.length - 1)}
            step="1"
            value={tunerIndex}
            onChange={(event) => moveTuner(Number(event.target.value))}
            onPointerUp={(event) => commitTuner(Number(event.currentTarget.value))}
            onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) commitTuner(Number(event.currentTarget.value)); }}
            aria-label="Tune DJ Cora to a network"
          />
          <div className={styles.dialTicks} aria-hidden>{tunerNetworks.map((network, index) => <span key={network.slug} className={index === tunerIndex ? styles.activeTick : ""} />)}</div>
        </div>
        <span className={styles.tunerHint}>Stations</span>
      </div> : null}
      <div className={styles.signal} aria-hidden>
        <Strands
          colors={["#fb7185", "#f97316", "#22d3ee"]}
          count={3}
          speed={reducedMotion ? 0.04 : 0.13 + signalLevel * 1.5}
          amplitude={0.35 + signalLevel * 1.45}
          waviness={1.7}
          thickness={0.72}
          glow={2.8}
          taper={3}
          spread={1}
          intensity={0.18 + signalLevel * 0.82}
          saturation={1.8}
          opacity={enabled ? 1 : 0.32}
          scale={1.6}
        />
      </div>
      <div className={styles.chassis}>
        <div className={styles.topline}><span className={styles.statusDot} aria-hidden /> <span className={styles.coraLabel}>DJ CORA</span></div>
        <strong>{blocked ? "Voice ready" : label}</strong>
        <p>{blocked ? displayNameForReason(presentation?.reason) : caption}</p>
        <div className={styles.meter} aria-hidden><span style={{ transform: `scaleX(${Math.max(0.06, signalLevel)})` }} /></div>
      </div>
      <div className={styles.controls}>
        <span className={styles.tunedState}>{tunedNetwork ? "TUNED" : "UNTUNED"}</span>
        {blocked ? <button type="button" className={styles.play} onClick={retry}><Volume2 aria-hidden /> <span>Play</span></button> : null}
        {isSpeaking && !blocked ? <button type="button" className={styles.stop} onClick={skip} aria-label="Skip DJ Cora"><X aria-hidden /></button> : null}
        <button type="button" className={styles.power} onClick={toggleAudio} aria-label={enabled ? "Turn off DJ Cora audio" : "Turn on DJ Cora audio"} aria-pressed={enabled}>
          {enabled ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
        </button>
        <button type="button" className={styles.settings} onClick={user ? openSettings : undefined} aria-disabled={!user} aria-label={user ? "DJ Cora settings" : "Sign in to adjust DJ Cora settings"} title={user ? "DJ Cora settings" : "Sign in to adjust DJ Cora settings"}><Settings2 aria-hidden /></button>
      </div>
      </aside>
      {placement?.hiddenEdge && restoreStyle ? (
        <button
          type="button"
          className={styles.edgeRestore}
          data-edge={placement.hiddenEdge}
          style={restoreStyle}
          onClick={restoreWidget}
          aria-label="Show DJ Cora"
          title="Show DJ Cora"
        >
          <RestoreIcon aria-hidden />
          <span>DJ</span>
        </button>
      ) : null}
    </>
  );
}

/** Useful to analytics callers without importing the implementation event name. */
export { RADIO_CUE_LIFECYCLE_EVENT };

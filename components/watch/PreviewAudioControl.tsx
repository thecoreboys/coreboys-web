"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { TwitchPlayerInstance } from "@/lib/watch/twitch-player";
import {
  PREVIEW_AUDIO_CLAIM_EVENT,
  previewAudioSample,
  previewAudioSuppressionReason,
  previewVolumeRamp,
  type PreviewAudioStatus,
} from "@/lib/watch/preview-audio";

type PreviewAudioClaimDetail = { ownerId: string };

const PREVIEW_FADE_MS = 150;
const AUDIO_CONFIRM_MS = 1_600;

function youtubeCommand(
  frameRef: RefObject<HTMLIFrameElement | null>,
  func: string,
  args: unknown[] = [],
) {
  frameRef.current?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*",
  );
}

function youtubeListen(frameRef: RefObject<HTMLIFrameElement | null>) {
  frameRef.current?.contentWindow?.postMessage(
    JSON.stringify({ event: "listening", id: 1 }),
    "*",
  );
}

export function PreviewAudioControl({
  active,
  ready,
  native,
  nativeRef,
  frameRef,
  youtube,
  twitchRef,
  unavailableReason,
  onKeepOpen,
  onClose,
}: {
  active: boolean;
  ready: boolean;
  native: boolean;
  nativeRef: RefObject<HTMLVideoElement | null>;
  frameRef: RefObject<HTMLIFrameElement | null>;
  youtube: boolean;
  twitchRef?: RefObject<TwitchPlayerInstance | null>;
  unavailableReason?: string;
  onKeepOpen?: () => void;
  onClose?: () => void;
}) {
  const {
    current,
    previewSoundEnabled,
    previewVolume,
    setPreviewSoundEnabled,
    claimPreviewAudio,
    releasePreviewAudio,
  } = usePlayer();
  const reducedMotion = useReducedMotion();
  const [soundRequested, setSoundRequested] = useState(true);
  const reactId = useId();
  const ownerId = `hover-preview-${reactId}`;
  const sourceSupported = native || youtube || Boolean(twitchRef);
  const mainPlayerSuppressionReason = sourceSupported
    ? previewAudioSuppressionReason(current)
    : null;
  const supported = sourceSupported && !mainPlayerSuppressionReason;
  const [status, setStatus] = useState<PreviewAudioStatus>(supported ? "off" : "unavailable");
  const statusRef = useRef<PreviewAudioStatus>(status);
  const claimedRef = useRef(false);
  const attemptedSoundRef = useRef(false);
  const activeRef = useRef(active);
  const requestTokenRef = useRef(0);
  const currentVolumeRef = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());
  const rampTimersRef = useRef<Set<number>>(new Set());
  const closeRef = useRef(onClose);

  closeRef.current = onClose;
  activeRef.current = active;

  const commitStatus = useCallback((next: PreviewAudioStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearRampTimers = useCallback(() => {
    for (const timer of rampTimersRef.current) window.clearTimeout(timer);
    rampTimersRef.current.clear();
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current.clear();
    clearRampTimers();
  }, [clearRampTimers]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const applyVolume = useCallback((value: number) => {
    const bounded = Math.min(1, Math.max(0, value));
    currentVolumeRef.current = bounded;
    const native = nativeRef.current;
    if (native) native.volume = bounded;
    if (youtube) youtubeCommand(frameRef, "setVolume", [Math.round(bounded * 100)]);
    twitchRef?.current?.setVolume?.(bounded);
  }, [frameRef, nativeRef, twitchRef, youtube]);

  const rampVolume = useCallback((from: number, to: number, onDone?: () => void) => {
    const values = previewVolumeRamp(from, to, reducedMotion ? 1 : 6);
    values.forEach((value, index) => {
      const timer = window.setTimeout(() => {
        rampTimersRef.current.delete(timer);
        applyVolume(value);
        if (index === values.length - 1) onDone?.();
      }, reducedMotion ? 0 : Math.round(PREVIEW_FADE_MS * ((index + 1) / values.length)));
      rampTimersRef.current.add(timer);
    });
  }, [applyVolume, reducedMotion]);

  const finalizeStop = useCallback((nextStatus: PreviewAudioStatus) => {
    clearRampTimers();
    const native = nativeRef.current;
    if (native) {
      native.muted = true;
      native.volume = 0;
    }
    if (youtube) {
      youtubeCommand(frameRef, "setVolume", [0]);
      youtubeCommand(frameRef, "mute");
    }
    twitchRef?.current?.setMuted?.(true);
    twitchRef?.current?.setVolume?.(0);
    currentVolumeRef.current = 0;
    if (claimedRef.current) {
      claimedRef.current = false;
      releasePreviewAudio(ownerId);
    }
    commitStatus(nextStatus);
    if (nextStatus === "blocked" && activeRef.current) {
      // A rejected sound request must never leave the visible preview paused.
      if (native) void native.play().catch(() => {});
      if (youtube) youtubeCommand(frameRef, "playVideo");
      twitchRef?.current?.play?.();
    }
  }, [clearRampTimers, commitStatus, frameRef, nativeRef, ownerId, releasePreviewAudio, twitchRef, youtube]);

  const stopSound = useCallback((
    immediate = false,
    nextStatus: PreviewAudioStatus = supported ? "off" : "unavailable",
  ) => {
    requestTokenRef.current += 1;
    clearTimers();
    if (!claimedRef.current && statusRef.current !== "on" && statusRef.current !== "starting") {
      commitStatus(nextStatus);
      return;
    }
    commitStatus(nextStatus);
    if (immediate || reducedMotion || currentVolumeRef.current <= 0) {
      finalizeStop(nextStatus);
      return;
    }
    rampVolume(currentVolumeRef.current, 0, () => finalizeStop(nextStatus));
  }, [clearTimers, commitStatus, finalizeStop, rampVolume, reducedMotion, supported]);

  const requestSound = useCallback(async () => {
    if (!active || !ready || !supported) {
      commitStatus(supported ? "off" : "unavailable");
      return;
    }
    if (claimedRef.current && (statusRef.current === "on" || statusRef.current === "starting")) return;

    const requestToken = ++requestTokenRef.current;
    const continuingClaim = claimedRef.current;
    window.dispatchEvent(new CustomEvent<PreviewAudioClaimDetail>(PREVIEW_AUDIO_CLAIM_EVENT, {
      detail: { ownerId },
    }));
    claimedRef.current = true;
    claimPreviewAudio(ownerId);
    clearTimers();
    commitStatus("starting");
    if (!continuingClaim) applyVolume(Math.min(.01, previewVolume));

    const native = nativeRef.current;
    if (native) {
      try {
        // Test audible autoplay before play() resolves. Starting at zero can
        // succeed silently, then be paused by the browser during the fade-in.
        const startingVolume = Math.max(currentVolumeRef.current, Math.min(.01, previewVolume));
        applyVolume(startingVolume);
        native.muted = false;
        await native.play();
        if (!claimedRef.current || requestToken !== requestTokenRef.current) return;
        if (native.muted || native.paused) throw new Error("preview_audio_blocked");
        commitStatus("on");
        rampVolume(startingVolume, previewVolume);
      } catch (error) {
        if (!claimedRef.current || requestToken !== requestTokenRef.current) return;
        const browserBlocked = error instanceof DOMException
          ? error.name === "NotAllowedError"
          : error instanceof Error && (error.name === "NotAllowedError" || error.message === "preview_audio_blocked");
        finalizeStop(browserBlocked ? "blocked" : "unavailable");
      }
      return;
    }

    const twitch = twitchRef?.current;
    if (twitch) {
      const requestTwitchAudio = () => {
        if (!claimedRef.current || statusRef.current !== "starting") return;
        try {
          twitch.setMuted?.(false);
          twitch.play?.();
        } catch {
          finalizeStop("unavailable");
        }
      };
      requestTwitchAudio();
      rampVolume(continuingClaim ? currentVolumeRef.current : 0, previewVolume);
      schedule(requestTwitchAudio, 260);
      schedule(requestTwitchAudio, 780);
      schedule(() => {
        if (claimedRef.current && statusRef.current === "starting") finalizeStop("blocked");
      }, AUDIO_CONFIRM_MS);
      return;
    }

    if (youtube) {
      const requestYouTubeAudio = () => {
        if (!claimedRef.current || statusRef.current !== "starting") return;
        youtubeListen(frameRef);
        youtubeCommand(frameRef, "unMute");
        youtubeCommand(frameRef, "playVideo");
      };
      requestYouTubeAudio();
      rampVolume(continuingClaim ? currentVolumeRef.current : 0, previewVolume);
      schedule(requestYouTubeAudio, 260);
      schedule(requestYouTubeAudio, 780);
      schedule(() => {
        if (claimedRef.current && statusRef.current === "starting") finalizeStop("blocked");
      }, AUDIO_CONFIRM_MS);
    }
  }, [
    active,
    applyVolume,
    claimPreviewAudio,
    clearTimers,
    commitStatus,
    finalizeStop,
    frameRef,
    nativeRef,
    ownerId,
    previewVolume,
    rampVolume,
    ready,
    schedule,
    supported,
    twitchRef,
    youtube,
  ]);

  useEffect(() => {
    const media = nativeRef.current;
    if (!native || !media || !active) return;
    const onPause = () => {
      if (!claimedRef.current || media.ended || media.seeking || media.error) return;
      if (statusRef.current === "starting" || statusRef.current === "on") finalizeStop("blocked");
    };
    media.addEventListener("pause", onPause);
    return () => media.removeEventListener("pause", onPause);
  }, [active, finalizeStop, native, nativeRef]);

  useEffect(() => {
    if (!twitchRef || !active) return;
    const confirmAudio = () => {
      const instance = twitchRef.current;
      if (!instance || !claimedRef.current) return;
      try {
        const muted = instance.getMuted?.();
        if (statusRef.current === "starting" && muted === false && instance.isPaused?.() === false) commitStatus("on");
        else if (statusRef.current === "on" && muted === true) finalizeStop("blocked");
      } catch { /* The SDK may be between frames or already destroyed. */ }
    };
    const timer = window.setInterval(confirmAudio, 200);
    return () => window.clearInterval(timer);
  }, [active, commitStatus, finalizeStop, twitchRef]);

  useEffect(() => {
    if (!youtube) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !claimedRef.current
      ) return;
      const sample = previewAudioSample(event.data);
      if (statusRef.current === "on" && sample?.muted === true) {
        finalizeStop("blocked");
        return;
      }
      if (statusRef.current !== "starting") return;
      if (sample?.muted !== false || sample.playing === false) return;
      commitStatus("on");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [commitStatus, finalizeStop, frameRef, youtube]);

  useEffect(() => {
    const onClaim = (event: Event) => {
      const detail = (event as CustomEvent<PreviewAudioClaimDetail>).detail;
      if (!detail?.ownerId || detail.ownerId === ownerId || !claimedRef.current) return;
      // A new owner must never overlap with the outgoing preview. Normal hover
      // exits fade, while this arbitration path mutes synchronously.
      stopSound(true, supported ? "off" : "unavailable");
    };
    window.addEventListener(PREVIEW_AUDIO_CLAIM_EVENT, onClaim);
    return () => window.removeEventListener(PREVIEW_AUDIO_CLAIM_EVENT, onClaim);
  }, [ownerId, stopSound, supported]);

  useEffect(() => {
    if (!supported) {
      stopSound(true, "unavailable");
      return;
    }
    if (!active || !previewSoundEnabled || !soundRequested) {
      attemptedSoundRef.current = false;
      stopSound(false, "off");
      return;
    }
    // Try the viewer's sound preference once per visible popup. A browser
    // rejection keeps muted video playing and leaves a direct retry button.
    if (!ready || attemptedSoundRef.current) return;
    attemptedSoundRef.current = true;
    void requestSound();
  }, [active, previewSoundEnabled, ready, requestSound, soundRequested, stopSound, supported]);

  useEffect(() => {
    if ((status !== "on" && status !== "starting") || !claimedRef.current) return;
    clearRampTimers();
    rampVolume(currentVolumeRef.current, previewVolume);
  }, [clearRampTimers, previewVolume, rampVolume, status]);

  useEffect(() => {
    const dismiss = () => {
      stopSound(false);
      closeRef.current?.();
    };
    const dismissImmediately = () => {
      stopSound(true);
      closeRef.current?.();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dismissImmediately();
    };
    const onNavigationClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target) return;
      const href = target.getAttribute("href") ?? "";
      if (!href || href === "#" || href.startsWith("#")) return;
      dismiss();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("pagehide", dismissImmediately);
    window.addEventListener("popstate", dismissImmediately);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onNavigationClick, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("pagehide", dismissImmediately);
      window.removeEventListener("popstate", dismissImmediately);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onNavigationClick, true);
    };
  }, [stopSound]);

  useEffect(() => () => {
    clearTimers();
    const native = nativeRef.current;
    if (native) {
      native.muted = true;
      native.volume = 0;
    }
    if (youtube) {
      youtubeCommand(frameRef, "setVolume", [0]);
      youtubeCommand(frameRef, "mute");
    }
    twitchRef?.current?.setMuted?.(true);
    twitchRef?.current?.setVolume?.(0);
    if (claimedRef.current) releasePreviewAudio(ownerId);
    claimedRef.current = false;
  }, [clearTimers, frameRef, nativeRef, ownerId, releasePreviewAudio, twitchRef, youtube]);

  if (!supported) {
    const mutedReason = mainPlayerSuppressionReason
      ?? unavailableReason
      ?? "This provider keeps hover previews muted.";
    return (
      <div
        className="watch-preview-audio is-muted-preview"
        onMouseEnter={onKeepOpen}
        onFocusCapture={onKeepOpen}
      >
        <Tooltip title="Preview sound unavailable" description={mutedReason} placement="top">
          <span
            className="watch-preview-audio-toggle"
            role="status"
            aria-label={`Muted preview. ${mutedReason}`}
          >
            <VolumeX aria-hidden />
          </span>
        </Tooltip>
      </div>
    );
  }

  const unavailable = status === "unavailable";
  const disabled = unavailable;
  const muted = !soundRequested || !previewSoundEnabled || (status !== "on" && status !== "starting");
  const label = muted ? "Unmute preview" : "Mute preview";
  const title = unavailable
    ? mainPlayerSuppressionReason
      ?? unavailableReason
      ?? "This provider does not make preview audio available."
    : status === "blocked"
      ? "Your browser requires a click for sound. Select to unmute this preview."
    : muted
      ? "Unmute this preview. This also becomes your saved preview-sound preference."
      : "Mute this preview. This also becomes your saved preview-sound preference.";

  return (
    <div
      className={`watch-preview-audio is-${status}`}
      onMouseEnter={onKeepOpen}
      onFocusCapture={onKeepOpen}
    >
      <Tooltip
        title={label}
        description={title}
        placement="top"
      >
        <button
          type="button"
          className="watch-preview-audio-toggle"
          aria-label={`${label}. ${title}`}
          aria-pressed={!muted}
          aria-disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onKeepOpen?.();
            if (disabled) return;
            if (!muted) {
              setSoundRequested(false);
              setPreviewSoundEnabled(false);
              stopSound(false, "off");
              return;
            }
            setSoundRequested(true);
            setPreviewSoundEnabled(true);
            void requestSound();
          }}
        >
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </button>
      </Tooltip>
    </div>
  );
}

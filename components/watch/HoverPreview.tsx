"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Button as AriaButton } from "react-aria-components";
import { createPortal } from "react-dom";
import { Heart, Play, ThumbsDown } from "lucide-react";
import type { WatchItem } from "@/lib/watch/types";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, embedFor, itemToPlayable } from "@/lib/watch/playable";
import { resolveHoverPreviewMedia } from "@/lib/watch/card-preview";
import { clampPreviewPosition, isPreviewPlayerReady, previewPlaybackSample } from "@/lib/watch/preview-progress";
import { listenToYouTube } from "@/lib/watch/youtube-player";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import type { WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { WatchThumb } from "./WatchThumb";
import { PreviewAudioControl } from "./PreviewAudioControl";
import { XPostHoverPreview } from "./XPostHoverPreview";
import { TwitchHoverMedia } from "./TwitchHoverMedia";

type PreviewPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const PREVIEW_FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([tabindex='-1'])",
  "a[href]:not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function PreviewListGlyph({ saved }: { saved: boolean }) {
  return saved ? (
    <svg viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="m4.2 10.3 3.5 3.5 8.1-8.1" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

function previewWidth(
  shape: ReturnType<typeof contentShape>,
  viewportWidth: number,
  viewportHeight: number,
  instagramPhoto = false,
  twitch = false,
) {
  const gutteredWidth = Math.max(140, viewportWidth - 24);
  if (instagramPhoto) {
    const heightSafeWidth = Math.max(140, (viewportHeight - 150) * (4 / 5));
    return Math.min(336, gutteredWidth, heightSafeWidth);
  }
  if (shape === "portrait") {
    const heightSafeWidth = Math.max(140, (viewportHeight - 180) * (9 / 16));
    return Math.min(260, gutteredWidth, heightSafeWidth);
  }
  if (shape === "square") return Math.min(288, gutteredWidth);
  return Math.min(twitch ? 440 : 416, gutteredWidth);
}

function playbackClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export type HoverPreviewProps = {
  item: WatchItem;
  youtubeId: string | null;
  progress: number;
  done: boolean;
  positionSeconds: number;
  durationSeconds: number;
  saved: boolean;
  context?: WatchItem[];
  anchorRef: RefObject<HTMLElement | null>;
  active?: boolean;
  /** Mount media during intent delay without exposing an interactive panel. */
  preloadOnly?: boolean;
  onPreviewEnter?: () => void;
  onPreviewLeave?: () => void;
  hoverAutoplay?: boolean;
  feedback?: WatchFeedbackValue | null;
  onFeedback?: (item: WatchItem, value: WatchFeedbackValue | null) => void;
  moment?: { title: string; seconds: number };
  panelId?: string;
  keyboardActive?: boolean;
  onKeyboardDismiss?: () => void;
};

export function HoverPreview(props: HoverPreviewProps) {
  const media = resolveHoverPreviewMedia(props.item);
  if (props.item.platform === "x" && props.item.kind === "post" && !media.nativeUrl && !media.playable) {
    return (
      <XPostHoverPreview
        item={props.item}
        anchorRef={props.anchorRef}
        onPreviewEnter={props.onPreviewEnter}
        onPreviewLeave={props.onPreviewLeave}
        panelId={props.panelId}
        keyboardActive={props.keyboardActive}
        onKeyboardDismiss={props.onKeyboardDismiss}
      />
    );
  }
  return <MediaHoverPreview {...props} />;
}

function MediaHoverPreview({
  item,
  youtubeId,
  progress,
  done,
  positionSeconds,
  durationSeconds,
  saved,
  context,
  anchorRef,
  active = true,
  preloadOnly = false,
  onPreviewEnter,
  onPreviewLeave,
  feedback,
  onFeedback,
  hoverAutoplay = true,
  moment,
  panelId,
  keyboardActive = false,
  onKeyboardDismiss,
}: HoverPreviewProps) {
  const shape = contentShape(item);
  const isPhoto = item.format === "photo";
  const isInstagramPhoto = isPhoto && item.platform === "instagram";
  const isTwitchPreview = !isPhoto && item.platform === "twitch";
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const dvrLoading = authLoading || subscription.loading;
  const dvrAllowed = subscription.hasFeature("dvr.extended_retention");
  const dvrLocked = Boolean(user && !dvrLoading && !dvrAllowed);
  const dvrSaved = dvrAllowed && saved;
  const panelRef = useRef<HTMLDivElement>(null);
  const positionFrame = useRef<number | null>(null);
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [readyMotionSource, setReadyMotionSource] = useState<string | null>(null);
  const [failedMotionSource, setFailedMotionSource] = useState<string | null>(null);
  const [photoLinkCopied, setPhotoLinkCopied] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [knownDuration, setKnownDuration] = useState(() => Math.max(0, durationSeconds, item.durationSeconds ?? 0));
  const initialSeekSeconds = moment?.seconds ?? (done ? 0 : positionSeconds);
  const [scrubSeconds, setScrubSeconds] = useState(() => Math.max(0, initialSeekSeconds));
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<{ targetSeconds: number; expiresAt: number } | null>(null);
  const playbackStartedRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const keyboardFocusTransferredRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  const mediaActive = active && !preloadOnly && !handedOff && pageVisible;
  const wantsMotion = mediaActive && player.previewAutoplay && hoverAutoplay
    && !player.dataSaver
    && !reducedMotion;
  const sourcePlayable = useMemo(() => itemToPlayable(item), [item]);
  const playable = isPhoto ? null : sourcePlayable;
  const previewMedia = useMemo(() => resolveHoverPreviewMedia(item), [item]);
  const previewPlayable = previewMedia.playable;
  const fallbackHref = item.sourceUrl || item.href;

  useEffect(() => {
    const nextDuration = Math.max(0, durationSeconds, item.durationSeconds ?? 0);
    const nextPosition = Math.max(0, moment?.seconds ?? (done ? 0 : positionSeconds));
    scrubbingRef.current = false;
    pendingSeekRef.current = null;
    setPhotoLinkCopied(false);
    setKnownDuration(nextDuration);
    setScrubSeconds(clampPreviewPosition(nextPosition, nextDuration));
  }, [done, durationSeconds, item.durationSeconds, item.id, moment?.seconds, positionSeconds]);

  useEffect(() => { setHandedOff(false); }, [item.id]);

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
    const syncVisibility = () => setPageVisible(document.visibilityState === "visible");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const updatePosition = useCallback(() => {
    if (positionFrame.current != null) return;
    positionFrame.current = window.requestAnimationFrame(() => {
      positionFrame.current = null;
      const anchor = anchorRef.current;
      if (!anchor) return;
      const target = anchor.getBoundingClientRect();
      const gutter = 12;
      const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      const topInset = Math.max(gutter, headerBottom + gutter);
      const width = previewWidth(shape, window.innerWidth, window.innerHeight, isInstagramPhoto, isTwitchPreview);
      const height = Math.max(0, window.innerHeight - topInset - gutter);
      const panelHeight = Math.min(panelRef.current?.offsetHeight || (isTwitchPreview ? 300 : width * (shape === "portrait" ? 16 / 9 : shape === "square" ? 1 : 9 / 16)) + 150, height);
      const maxLeft = Math.max(gutter, window.innerWidth - width - gutter);
      const maxTop = Math.max(topInset, window.innerHeight - panelHeight - gutter);
      const centeredLeft = target.left + target.width / 2 - width / 2;
      const centeredTop = target.top + target.height / 2 - panelHeight / 2;
      const left = Math.min(maxLeft, Math.max(gutter, centeredLeft));
      const top = Math.min(maxTop, Math.max(topInset, centeredTop));
      setPosition((previous) => {
        if (
          previous &&
          Math.abs(previous.left - left) < 0.5 &&
          Math.abs(previous.top - top) < 0.5 &&
          Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5
        ) {
          return previous;
        }
        return { left, top, width, height };
      });
    });
  }, [anchorRef, isInstagramPhoto, isTwitchPreview, shape]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      if (positionFrame.current != null) window.cancelAnimationFrame(positionFrame.current);
      positionFrame.current = null;
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!position || !panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updatePosition);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [position, updatePosition]);

  useEffect(() => {
    if (!keyboardActive) {
      keyboardFocusTransferredRef.current = false;
      return;
    }
    if (!position || keyboardFocusTransferredRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const preferred = panel?.querySelector<HTMLElement>(".watch-preview-audio-toggle");
      const fallback = panel?.querySelector<HTMLElement>(PREVIEW_FOCUSABLE_SELECTOR);
      const target = preferred ?? fallback;
      if (!target) return;
      keyboardFocusTransferredRef.current = true;
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [keyboardActive, position]);

  const videoSrc = wantsMotion ? previewMedia.nativeUrl : null;
  const twitchChannel = previewPlayable?.platform === "twitch" && previewPlayable.kind === "live" ? previewPlayable.twitchLogin : null;
  const twitchVideo = previewPlayable?.platform === "twitch" ? previewPlayable.vodId : null;
  const twitchSource = !videoSrc && host && wantsMotion && (twitchChannel || twitchVideo)
      ? `twitch:${twitchChannel ? `channel:${twitchChannel}` : `video:${twitchVideo}`}`
      : null;
  const iframeSrc = useMemo(() => {
    if (videoSrc || twitchSource || !host || !previewPlayable) return null;
    // Instagram photo permalinks are frequently deleted, age-restricted, or
    // unavailable to an anonymous embed. Showing that cross-origin error page
    // in a hover card is noisy and makes a healthy cached thumbnail look
    // broken. Keep the preview on the known-good still and let the explicit
    // “View on Instagram” action open the canonical permalink.
    if (isInstagramPhoto || !wantsMotion) return null;
    return embedFor(previewPlayable, {
      parent: host.parent,
      origin: host.origin,
      muted: true,
      controls: false,
      // Request muted autoplay immediately, then retry via the provider API
      // if its player becomes ready after the iframe load event.
      autoplay: true,
      startSeconds: initialSeekSeconds,
    });
  }, [host, initialSeekSeconds, isInstagramPhoto, previewPlayable, twitchSource, videoSrc, wantsMotion]);
  const motionSource = videoSrc ?? twitchSource ?? iframeSrc;
  const motionFailed = Boolean(motionSource && failedMotionSource === motionSource);
  const previewUnavailable = motionFailed || Boolean(host && wantsMotion && !isPhoto && !previewMedia.nativeUrl && !previewPlayable);
  const motionReady = Boolean(motionSource && readyMotionSource === motionSource);

  const requestProviderPlayback = useCallback(() => {
    if (!mediaActive || !iframeSrc || (playbackStartedRef.current && resumeAppliedRef.current)) return;
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const origin = new URL(iframeSrc).origin;
    if (previewPlayable?.youtubeId) {
      listenToYouTube(target, `core-hover-${item.id}`);
      target.postMessage(JSON.stringify({ event: "command", func: "mute", args: [] }), origin);
      if (initialSeekSeconds > 0 && !resumeAppliedRef.current) {
        target.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [initialSeekSeconds, true] }), origin);
      }
      target.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), origin);
      return;
    }
    if (previewPlayable?.platform === "tiktok") {
      target.postMessage({ "x-tiktok-player": true, type: "mute" }, origin);
      if (initialSeekSeconds > 0) {
        target.postMessage({ "x-tiktok-player": true, type: "seekTo", value: initialSeekSeconds }, origin);
      }
      target.postMessage({ "x-tiktok-player": true, type: "play" }, origin);
    }
  }, [mediaActive, iframeSrc, initialSeekSeconds, item.id, previewPlayable?.platform, previewPlayable?.youtubeId]);

  useEffect(() => {
    playbackStartedRef.current = false;
    resumeAppliedRef.current = initialSeekSeconds <= 0;
    setReadyMotionSource(null);
    setFailedMotionSource(null);
  }, [motionSource, initialSeekSeconds]);

  useEffect(() => {
    // A Twitch ad or slow stream startup can outlast the generic embed timeout.
    // Keep the visible SDK player alive so it can actually reach PLAYING.
    if (!motionSource || motionReady || twitchSource) return;
    const timeout = window.setTimeout(() => setFailedMotionSource(motionSource), previewPlayable?.platform === "tiktok" ? 20_000 : 10_000);
    return () => window.clearTimeout(timeout);
  }, [motionSource, motionReady, previewPlayable?.platform, twitchSource]);

  useEffect(() => {
    if (!mediaActive || !iframeSrc || (!previewPlayable?.youtubeId && previewPlayable?.platform !== "tiktok")) return;
    // Provider APIs can become ready well after the iframe's load event on a
    // slow connection. Retry while the preview is active so the first play
    // command is not lost during that readiness window.
    const attempts = [250, 800, 1_600, 3_200, 6_000, 10_000, 16_000].map((delay) => (
      window.setTimeout(requestProviderPlayback, delay)
    ));
    return () => {
      for (const timer of attempts) window.clearTimeout(timer);
    };
  }, [mediaActive, iframeSrc, previewPlayable?.platform, previewPlayable?.youtubeId, requestProviderPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoSrc || !video) return;
    if (!mediaActive) {
      video.pause();
      return;
    }
    video.muted = true;
    void video.play().catch(() => {});
  }, [mediaActive, videoSrc]);

  const syncPlaybackSeconds = useCallback((seconds: number, duration = knownDuration) => {
    if (!Number.isFinite(seconds) || scrubbingRef.current) return;
    const bounded = clampPreviewPosition(seconds, duration);
    const pending = pendingSeekRef.current;
    if (pending) {
      const providerReachedSeek = Math.abs(bounded - pending.targetSeconds) <= 2.5;
      if (!providerReachedSeek && Date.now() < pending.expiresAt) return;
      pendingSeekRef.current = null;
    }
    setScrubSeconds((current) => Math.abs(current - bounded) < 0.05 ? current : bounded);
  }, [knownDuration]);

  const onTwitchPlayingChange = useCallback((playing: boolean) => {
    playbackStartedRef.current = playing;
    setReadyMotionSource(playing ? twitchSource : null);
  }, [twitchSource]);

  const onTwitchProgress = useCallback((seconds: number, duration: number) => {
    if (Number.isFinite(duration) && duration > 0) setKnownDuration((current) => Math.max(current, duration));
    syncPlaybackSeconds(seconds, duration);
  }, [syncPlaybackSeconds]);

  useEffect(() => {
    if (!iframeSrc) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== new URL(iframeSrc).origin) return;
      if (isPreviewPlayerReady(event.data)) {
        requestProviderPlayback();
        return;
      }
      const sample = previewPlaybackSample(event.data);
      if (!sample) return;
      if (sample.playing != null) {
        playbackStartedRef.current = sample.playing;
        setReadyMotionSource(sample.playing ? iframeSrc : null);
      }
      if (!playbackStartedRef.current) return;
      const nextDuration = sample.durationSeconds;
      if (nextDuration != null && nextDuration > 0) {
        setKnownDuration((current) => Math.max(current, nextDuration));
      }
      if (sample.positionSeconds != null) {
        if (sample.positionSeconds >= initialSeekSeconds - 2) resumeAppliedRef.current = true;
        syncPlaybackSeconds(sample.positionSeconds, nextDuration ?? knownDuration);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeSrc, initialSeekSeconds, knownDuration, requestProviderPlayback, syncPlaybackSeconds]);

  const live = item.kind === "live" || item.format === "live";
  const supportsSyncedSeek = Boolean(
    videoSrc ||
    (iframeSrc && (previewPlayable?.youtubeId || previewPlayable?.platform === "tiktok")),
  );
  const seekable = Boolean(
    playable &&
    supportsSyncedSeek &&
    motionReady &&
    !live &&
    item.format !== "photo" &&
    knownDuration > 0
  );
  const boundedScrubSeconds = knownDuration > 0 ? Math.min(knownDuration, scrubSeconds) : scrubSeconds;
  const playbackPercent = knownDuration > 0
    ? Math.min(100, Math.max(0, (boundedScrubSeconds / knownDuration) * 100))
    : 0;
  const savedPercent = Math.round((done ? 1 : progress) * 100);

  const seekPreview = useCallback((seconds: number) => {
    const target = clampPreviewPosition(seconds, knownDuration);
    pendingSeekRef.current = { targetSeconds: target, expiresAt: Date.now() + 2_000 };
    const native = videoRef.current;
    if (native && Number.isFinite(native.duration) && native.duration > 0) {
      native.currentTime = Math.min(native.duration, target);
      return;
    }
    const source = frameRef.current?.contentWindow;
    if (!source || !previewPlayable) return;
    if (previewPlayable.youtubeId) {
      source.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [target, true] }), "*");
    } else if (previewPlayable.platform === "tiktok") {
      source.postMessage({ "x-tiktok-player": true, type: "seekTo", value: target }, "*");
    }
  }, [knownDuration, previewPlayable]);

  const playNow = useCallback(() => {
    if (!playable) return;
    setHandedOff(true);
    onPreviewLeave?.();
    const startAtSeconds = seekable || (twitchSource && motionReady && !live) ? boundedScrubSeconds : moment?.seconds;
    if (player.current?.key === playable.key) {
      if (typeof startAtSeconds === "number") player.requestSeek(startAtSeconds);
      player.expand();
      return;
    }
    player.play(item, context, typeof startAtSeconds === "number" ? { startAtSeconds } : undefined);
  }, [boundedScrubSeconds, context, item, live, moment?.seconds, motionReady, onPreviewLeave, playable, player, seekable, twitchSource]);

  const copyPhotoLink = useCallback(async () => {
    if (!isInstagramPhoto || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(fallbackHref);
      setPhotoLinkCopied(true);
    } catch {
      setPhotoLinkCopied(false);
    }
  }, [fallbackHref, isInstagramPhoto]);

  if (!position || typeof document === "undefined") return null;

  // The shared portal root has zero dimensions. Twitch's visibility checks
  // require the player to live under an ancestor with real viewport bounds.
  const portalHost = isTwitchPreview ? document.body : document.getElementById("watch-preview-root") ?? document.body;
  const keyboardInstructionsId = panelId ? `${panelId}-keyboard-instructions` : undefined;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role={keyboardActive ? "dialog" : undefined}
      aria-hidden={preloadOnly ? true : undefined}
      aria-label={keyboardActive ? `Preview ${item.title}` : undefined}
      aria-describedby={keyboardActive ? keyboardInstructionsId : undefined}
      className={`watch-preview watch-preview-portal is-${shape} is-${item.platform} ${item.format === "photo" ? "is-photo" : ""} ${live ? "is-live" : ""} ${active ? "is-active" : "is-closing"} ${motionSource ? "has-motion" : "is-still"} ${twitchSource ? "has-twitch-player" : ""}`}
      data-cursor-native={isTwitchPreview ? "true" : undefined}
      data-preview-state={previewUnavailable ? "unavailable" : motionReady ? "playing" : motionSource ? "loading" : "still"}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.height,
        overflowY: isTwitchPreview ? "visible" : "auto",
        ...(preloadOnly
          ? { opacity: 0, visibility: "hidden" as const, pointerEvents: "none" as const }
          : null),
      }}
      onMouseEnter={onPreviewEnter}
      onMouseLeave={keyboardActive ? undefined : onPreviewLeave}
      onFocusCapture={onPreviewEnter}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreviewLeave?.();
      }}
      onKeyDown={(event) => {
        if (!keyboardActive) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onKeyboardDismiss?.();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE_SELECTOR),
        ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const movingBeforeFirst = event.shiftKey && currentIndex <= 0;
        const movingAfterLast = !event.shiftKey && currentIndex === focusable.length - 1;
        if (!movingBeforeFirst && !movingAfterLast && currentIndex >= 0) return;
        event.preventDefault();
        focusable[movingBeforeFirst ? focusable.length - 1 : 0]?.focus({ preventScroll: true });
      }}
    >
      {keyboardActive && keyboardInstructionsId ? (
        <p id={keyboardInstructionsId} className="sr-only">
          Preview controls. Use Tab to move between controls and press Escape to return to the video card.
        </p>
      ) : null}
      <div className="watch-preview-media">
        <Link
          href={(playable ? "#" : fallbackHref) as never}
          className="watch-preview-media-link"
          tabIndex={keyboardActive ? 0 : -1}
          target={isInstagramPhoto ? "_blank" : undefined}
          rel={isInstagramPhoto ? "noreferrer" : undefined}
          aria-label={isInstagramPhoto
            ? `View ${item.title} on Instagram (opens in a new tab)`
            : `Play ${item.title}`}
          onClick={(event) => {
            if (!playable) return;
            event.preventDefault();
            playNow();
          }}
        >
          <WatchThumb
            youtubeId={youtubeId}
            src={item.backdrop || item.poster}
            className={`watch-preview-still ${motionReady ? "is-hidden" : ""}`}
            focalPoint={item.focalPoint}
            loading="eager"
          />
          {videoSrc && !motionFailed ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className={`watch-preview-video watch-preview-motion ${motionReady ? "is-ready" : ""}`}
              autoPlay={mediaActive}
              muted
              loop
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  setKnownDuration((current) => Math.max(current, duration));
                  if (initialSeekSeconds > 0) {
                    event.currentTarget.currentTime = Math.min(duration, initialSeekSeconds);
                  }
                }
              }}
              onDurationChange={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  setKnownDuration((current) => Math.max(current, duration));
                }
              }}
              onTimeUpdate={(event) => {
                if (!playbackStartedRef.current) return;
                syncPlaybackSeconds(event.currentTarget.currentTime, event.currentTarget.duration);
              }}
              onSeeked={(event) => {
                if (!playbackStartedRef.current) return;
                syncPlaybackSeconds(event.currentTarget.currentTime, event.currentTarget.duration);
              }}
              onPlaying={() => {
                playbackStartedRef.current = true;
                setReadyMotionSource(videoSrc);
              }}
              onPause={() => {
                playbackStartedRef.current = false;
              }}
              onEnded={() => {
                playbackStartedRef.current = false;
              }}
              onError={() => {
                playbackStartedRef.current = false;
                setReadyMotionSource(null);
                setFailedMotionSource(videoSrc);
              }}
              onCanPlay={(event) => {
                event.currentTarget.muted = true;
                if (mediaActive) void event.currentTarget.play().catch(() => {});
              }}
            />
          ) : twitchSource && !motionFailed ? (
            <TwitchHoverMedia
              key={twitchSource}
              channel={twitchChannel}
              video={twitchVideo}
              active={mediaActive}
              title={item.title}
              startSeconds={initialSeekSeconds}
              onPlayingChange={onTwitchPlayingChange}
              onProgress={onTwitchProgress}
              onSelect={playNow}
              onLoadError={() => setFailedMotionSource(twitchSource)}
            />
          ) : iframeSrc && !motionFailed ? (
            <iframe
              ref={frameRef}
              title={isInstagramPhoto ? `${item.title} Instagram post` : `${item.title} preview`}
              src={iframeSrc}
              allow="autoplay; encrypted-media; picture-in-picture"
              className={`watch-preview-frame watch-preview-motion ${motionReady ? "is-ready" : ""}`}
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={-1}
              onLoad={() => {
                requestProviderPlayback();
                // Twitch's clip embed has no playback API. Show its autoplay
                // player, without treating frame load as watch-progress evidence.
                if (previewPlayable?.platform === "twitch") setReadyMotionSource(iframeSrc);
              }}
              onError={() => setFailedMotionSource(iframeSrc)}
            />
          ) : null}
          {!motionSource ? <span className="watch-preview-veil" aria-hidden /> : null}
          {!isPhoto && !motionSource ? <span className="watch-preview-play" aria-hidden /> : null}
          {live && !twitchSource ? (
            <span className="watch-preview-live">Live</span>
          ) : null}
        </Link>
        {previewUnavailable ? (
          <div className="watch-preview-provider-state" role="status">
            <span>Preview unavailable here</span>
            <a href={fallbackHref} target="_blank" rel="noopener noreferrer">Open on {item.platform === "youtube" ? "YouTube" : item.platform === "tiktok" ? "TikTok" : item.platform === "instagram" ? "Instagram" : item.platform === "twitch" ? "Twitch" : item.platform === "x" ? "X" : "source"} ↗</a>
          </div>
        ) : null}
        {!isPhoto && !twitchSource && motionSource && motionReady ? (
          <PreviewAudioControl
            active={mediaActive}
            ready={motionReady}
            native={Boolean(videoSrc)}
            nativeRef={videoRef}
            frameRef={frameRef}
            youtube={Boolean(iframeSrc && previewPlayable?.youtubeId)}
            unavailableReason={`${item.platform} previews always begin muted.`}
            onKeepOpen={onPreviewEnter}
            onClose={keyboardActive ? onKeyboardDismiss : onPreviewLeave}
          />
        ) : null}
        {seekable ? (
          <div className="watch-preview-scrubber">
            <div className="watch-preview-scrubber-copy">
              {done || savedPercent > 0 ? (
                <span>{done ? "Watched" : `${savedPercent}% watched`}</span>
              ) : null}
              <output>{playbackClock(boundedScrubSeconds)} / {playbackClock(knownDuration)}</output>
            </div>
            <input
              type="range"
              min={0}
              max={knownDuration}
              step={0.1}
              value={boundedScrubSeconds}
              aria-label={`Choose where to play ${item.title}`}
              aria-valuetext={`${playbackClock(boundedScrubSeconds)} of ${playbackClock(knownDuration)}`}
              style={{ ["--watch-preview-progress" as string]: `${playbackPercent}%` }}
              onInput={(event) => {
                const nextSeconds = Number(event.currentTarget.value);
                setScrubSeconds(nextSeconds);
                seekPreview(nextSeconds);
              }}
              onPointerDown={(event) => {
                onPreviewEnter?.();
                scrubbingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={() => onPreviewEnter?.()}
              onPointerUp={(event) => {
                onPreviewEnter?.();
                scrubbingRef.current = false;
                seekPreview(Number(event.currentTarget.value));
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                scrubbingRef.current = false;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onLostPointerCapture={() => {
                scrubbingRef.current = false;
              }}
              onBlur={() => {
                scrubbingRef.current = false;
              }}
              onClick={(event) => {
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                if (bounds.width <= 0) return;
                const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
                const nextSeconds = ratio * knownDuration;
                setScrubSeconds(nextSeconds);
                seekPreview(nextSeconds);
              }}
            />
          </div>
        ) : playable && !twitchSource && !live && item.format !== "photo" ? (
          <div
            className="watch-preview-bar"
            role="progressbar"
            aria-label={`${done ? "Watched" : "Watch progress"}: ${savedPercent}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={savedPercent}
          >
            <i style={{ width: `${savedPercent}%` }} />
          </div>
        ) : null}
      </div>
      <Link
        href={(playable ? "#" : fallbackHref) as never}
        className="watch-preview-link watch-preview-meta-link"
        tabIndex={-1}
        target={isInstagramPhoto ? "_blank" : undefined}
        rel={isInstagramPhoto ? "noreferrer" : undefined}
        aria-label={isInstagramPhoto
          ? `View ${item.title} on Instagram (opens in a new tab)`
          : `Play ${item.title}`}
        onClick={(event) => {
          if (!playable) return;
          event.preventDefault();
          playNow();
        }}
      >
        <div className="watch-preview-meta">
          <p className="line-clamp-2 text-sm font-semibold tracking-tight text-[color:var(--ink)]">
            {item.title}
          </p>
          <p className="mt-1 truncate text-xs text-[color:var(--ink-dim)]">
            {watchAttributionLabel(item)}
            {twitchSource ? `${live ? " · Live" : ""} · Muted preview` : ""}
          </p>
          {motionSource && previewMedia.platform !== item.platform ? (
            <p className="mt-1 text-xs text-[color:var(--ink-dim)]">Preview via {previewMedia.platform === "youtube" ? "YouTube" : previewMedia.platform === "tiktok" ? "TikTok" : "Twitch"}</p>
          ) : null}
          {moment ? (
            <p className="watch-preview-moment">Matched moment · {moment.title} · {Math.floor(moment.seconds / 60)}:{String(Math.floor(moment.seconds % 60)).padStart(2, "0")}</p>
          ) : null}
        </div>
      </Link>
      <Tooltip
        title={dvrLoading ? "Loading DVR" : dvrLocked ? "DVR with CORE Membership" : user && dvrSaved ? "Remove from DVR" : "Save"}
        description={dvrLoading
          ? "Checking your saved titles."
          : user
            ? dvrLocked
              ? "Your DVR is included with CORE Membership."
              : dvrSaved
              ? "Remove this title from your DVR."
              : "Add this title to your DVR so you can quickly find it later."
            : "Sign in to add this title to your DVR across your devices."}
        placement="top"
        isDisabled={dvrLoading}
      >
        <button
          type="button"
          tabIndex={keyboardActive ? 0 : -1}
          className="watch-preview-save"
          aria-pressed={Boolean(user && dvrSaved)}
          aria-label={dvrLoading
            ? "Loading DVR"
            : user
              ? dvrLocked
                ? `Save with membership to save ${item.title}`
                : dvrSaved
                ? `Remove ${item.title} from your library`
                : isPhoto ? `Add photo ${item.title} to your library` : `Add ${item.title} to your library`
              : `Add ${item.title} to your library`}
          disabled={dvrLoading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!user) {
              redirectToMyListSignIn();
              return;
            }
            if (!dvrAllowed) {
              window.location.assign(subscription.featureHref("dvr.extended_retention"));
              return;
            }
            toggleMyList(item.id);
          }}
        >
          <span className="watch-preview-save-icon"><PreviewListGlyph saved={dvrSaved} /></span>
          <span className="watch-preview-save-label" aria-hidden>
            {dvrLoading ? "Loading…" : dvrLocked ? "Save with membership" : user && dvrSaved ? "Saved" : "Save"}
          </span>
        </button>
      </Tooltip>
      {isInstagramPhoto ? (
        <div className="watch-preview-feedback watch-preview-photo-actions" role="group" aria-label={`Photo actions for ${item.title}`}>
          <button type="button" tabIndex={keyboardActive ? 0 : -1} onClick={() => void copyPhotoLink()}>
            {photoLinkCopied ? "Link copied" : "Copy link"}
          </button>
          <Link
            href={fallbackHref as never}
            target="_blank"
            rel="noreferrer"
            tabIndex={keyboardActive ? 0 : -1}
            className="is-primary"
            aria-label={`View ${item.title} on Instagram (opens in a new tab)`}
          >
            View on Instagram
          </Link>
        </div>
      ) : !isPhoto && (onFeedback || playable) ? (
        <div
          className={`watch-preview-feedback ${shape === "portrait" ? "is-icon-only" : ""}`}
          role="group"
          aria-label={`Actions for ${item.title}`}
        >
          {onFeedback ? (
            <>
              <Tooltip
                title={feedback === "not_interested" ? "Undo not interested" : "Not interested"}
                description={feedback === "not_interested"
                  ? "Let this title appear in your recommendations again."
                  : "Show fewer recommendations like this title."}
                placement="top"
              >
                <AriaButton
                  type="button"
                  excludeFromTabOrder={!keyboardActive}
                  aria-label={feedback === "not_interested"
                    ? `Undo not interested for ${item.title}`
                    : `Not interested in ${item.title}`}
                  aria-pressed={feedback === "not_interested"}
                  onPress={() => onFeedback(item, feedback === "not_interested" ? null : "not_interested")}
                >
                  <ThumbsDown aria-hidden="true" />
                  <span>{feedback === "not_interested" ? "Undo" : "Not interested"}</span>
                </AriaButton>
              </Tooltip>
              <Tooltip
                title={feedback === "like" ? "Unlike" : "Like"}
                description={feedback === "like"
                  ? "Remove this title from your likes."
                  : "Use this title to improve your recommendations."}
                placement="top"
              >
                <AriaButton
                  type="button"
                  excludeFromTabOrder={!keyboardActive}
                  aria-label={feedback === "like" ? `Unlike ${item.title}` : `Like ${item.title}`}
                  aria-pressed={feedback === "like"}
                  onPress={() => onFeedback(item, feedback === "like" ? null : "like")}
                >
                  <Heart aria-hidden="true" />
                  <span>{feedback === "like" ? "Unlike" : "Like"}</span>
                </AriaButton>
              </Tooltip>
            </>
          ) : null}
          {playable ? (
            <AriaButton
              type="button"
              excludeFromTabOrder={!keyboardActive}
              className="is-primary"
              aria-label={`Play ${item.title} now`}
              onPress={playNow}
            >
              <Play aria-hidden="true" />
              <span>Play now</span>
            </AriaButton>
          ) : null}
        </div>
      ) : null}
    </div>,
    portalHost,
  );
}

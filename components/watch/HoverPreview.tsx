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
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, embedFor, itemToPlayable } from "@/lib/watch/playable";
import { clampPreviewPosition, previewPlaybackSample } from "@/lib/watch/preview-progress";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import type { WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { WatchThumb } from "./WatchThumb";
import { PreviewAudioControl } from "./PreviewAudioControl";
import { XPostHoverPreview } from "./XPostHoverPreview";

type PreviewPosition = {
  left: number;
  top: number;
  width: number;
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
) {
  const gutteredWidth = Math.max(140, viewportWidth - 24);
  if (instagramPhoto) {
    const heightSafeWidth = Math.max(140, (viewportHeight - 150) * (4 / 5));
    return Math.min(336, gutteredWidth, heightSafeWidth);
  }
  if (shape === "portrait") {
    const heightSafeWidth = Math.max(140, (viewportHeight - 180) * (9 / 16));
    return Math.min(224, gutteredWidth, heightSafeWidth);
  }
  if (shape === "square") return Math.min(288, gutteredWidth);
  return Math.min(368, gutteredWidth);
}

function estimatedHeight(shape: ReturnType<typeof contentShape>, width: number, instagramPhoto = false) {
  const media = instagramPhoto
    ? width * (5 / 4)
    : shape === "portrait" ? width * (16 / 9) : shape === "square" ? width : width * (9 / 16);
  return media + 150;
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
  if (props.item.platform === "x" && props.item.kind === "post") {
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
  hoverAutoplay = false,
  moment,
  panelId,
  keyboardActive = false,
  onKeyboardDismiss,
}: HoverPreviewProps) {
  const shape = contentShape(item);
  const isPhoto = item.format === "photo";
  const isInstagramPhoto = isPhoto && item.platform === "instagram";
  const { user, loading: authLoading } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const positionFrame = useRef<number | null>(null);
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [readyMotionSource, setReadyMotionSource] = useState<string | null>(null);
  const [loadedStaticFrameSource, setLoadedStaticFrameSource] = useState<string | null>(null);
  const [photoLinkCopied, setPhotoLinkCopied] = useState(false);
  const [knownDuration, setKnownDuration] = useState(() => Math.max(0, durationSeconds, item.durationSeconds ?? 0));
  const initialSeekSeconds = moment?.seconds ?? (done ? 0 : positionSeconds);
  const [scrubSeconds, setScrubSeconds] = useState(() => Math.max(0, initialSeekSeconds));
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<{ targetSeconds: number; expiresAt: number } | null>(null);
  const playbackStartedRef = useRef(false);
  const keyboardFocusTransferredRef = useRef(false);
  const providerRevealTimerRef = useRef<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  // A Twitch iframe has no useful still-frame playback API once it is shown.
  // Promote it to its muted provider-autoplay path on hover, while retaining
  // the viewer's Data Saver and reduced-motion choices as hard opt-outs.
  const wantsMotion = (player.previewAutoplay || hoverAutoplay || item.platform === "twitch")
    && !player.dataSaver
    && !reducedMotion;
  const sourcePlayable = useMemo(() => itemToPlayable(item), [item]);
  const playable = isPhoto ? null : sourcePlayable;
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

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
  }, []);

  const updatePosition = useCallback(() => {
    if (positionFrame.current != null) return;
    positionFrame.current = window.requestAnimationFrame(() => {
      positionFrame.current = null;
      const anchor = anchorRef.current;
      if (!anchor) return;
      const target = anchor.getBoundingClientRect();
      const gutter = 12;
      const width = previewWidth(shape, window.innerWidth, window.innerHeight, isInstagramPhoto);
      const height = panelRef.current?.offsetHeight || estimatedHeight(shape, width, isInstagramPhoto);
      const maxLeft = Math.max(gutter, window.innerWidth - width - gutter);
      const maxTop = Math.max(gutter, window.innerHeight - height - gutter);
      const centeredLeft = target.left + target.width / 2 - width / 2;
      const centeredTop = target.top + target.height / 2 - height / 2;
      const left = Math.min(maxLeft, Math.max(gutter, centeredLeft));
      const top = Math.min(maxTop, Math.max(gutter, centeredTop));
      setPosition((previous) => {
        if (
          previous &&
          Math.abs(previous.left - left) < 0.5 &&
          Math.abs(previous.top - top) < 0.5 &&
          Math.abs(previous.width - width) < 0.5
        ) {
          return previous;
        }
        return { left, top, width };
      });
    });
  }, [anchorRef, isInstagramPhoto, shape]);

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

  const videoSrc =
    wantsMotion && item.previewStrategy === "video" && item.mediaUrl?.startsWith("https://")
      ? item.mediaUrl
      : null;
  const iframeSrc = useMemo(() => {
    if (videoSrc || !host || !sourcePlayable) return null;
    if (isInstagramPhoto) {
      return embedFor(sourcePlayable, {
        parent: host.parent,
        origin: host.origin,
        muted: true,
        controls: true,
      });
    }
    if (!wantsMotion || !playable || item.embeddable === false) return null;
    if (item.previewStrategy === "external" || item.previewStrategy === "image") return null;
    if (!(["youtube", "twitch", "tiktok", "instagram"] as string[]).includes(item.platform)) return null;
    return embedFor(playable, {
      parent: host.parent,
      origin: host.origin,
      muted: true,
      controls: false,
      // YouTube and TikTok are promoted through postMessage once intent is
      // confirmed. Twitch has no equivalent API on this lightweight surface.
      autoplay: item.platform === "twitch",
      startSeconds: initialSeekSeconds,
    });
  }, [host, initialSeekSeconds, isInstagramPhoto, item.embeddable, item.platform, item.previewStrategy, playable, sourcePlayable, videoSrc, wantsMotion]);
  const motionSource = videoSrc ?? iframeSrc;
  const motionReady = Boolean(
    motionSource && (
      readyMotionSource === motionSource ||
      (isInstagramPhoto && loadedStaticFrameSource === motionSource)
    ),
  );

  const requestProviderPlayback = useCallback(() => {
    if (!active || !iframeSrc || playbackStartedRef.current) return;
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    if (playable?.youtubeId) {
      target.postMessage(JSON.stringify({ event: "listening", id: `core-hover-${item.id}` }), "*");
      target.postMessage(JSON.stringify({ event: "command", func: "mute", args: [] }), "*");
      target.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      return;
    }
    if (playable?.platform === "tiktok") {
      target.postMessage({ "x-tiktok-player": true, type: "mute" }, "*");
      if (initialSeekSeconds > 0) {
        target.postMessage({ "x-tiktok-player": true, type: "seekTo", value: initialSeekSeconds }, "*");
      }
      target.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
    }
  }, [active, iframeSrc, initialSeekSeconds, item.id, playable?.platform, playable?.youtubeId]);

  useEffect(() => {
    if (providerRevealTimerRef.current != null) {
      window.clearTimeout(providerRevealTimerRef.current);
      providerRevealTimerRef.current = null;
    }
    playbackStartedRef.current = false;
    setReadyMotionSource(null);
    setLoadedStaticFrameSource(null);
    return () => {
      if (providerRevealTimerRef.current != null) {
        window.clearTimeout(providerRevealTimerRef.current);
        providerRevealTimerRef.current = null;
      }
    };
  }, [iframeSrc, videoSrc]);

  useEffect(() => {
    if (!active || !iframeSrc || (!playable?.youtubeId && playable?.platform !== "tiktok")) return;
    const attempts = [250, 800, 1_600].map((delay) => (
      window.setTimeout(requestProviderPlayback, delay)
    ));
    return () => {
      for (const timer of attempts) window.clearTimeout(timer);
    };
  }, [iframeSrc, playable?.platform, playable?.youtubeId, requestProviderPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoSrc || !video) return;
    if (!active) {
      video.pause();
      return;
    }
    video.muted = true;
    void video.play().catch(() => {});
  }, [active, videoSrc]);

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

  useEffect(() => {
    if (!iframeSrc) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
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
        syncPlaybackSeconds(sample.positionSeconds, nextDuration ?? knownDuration);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeSrc, knownDuration, syncPlaybackSeconds]);

  const live = item.kind === "live" || item.format === "live";
  const supportsSyncedSeek = Boolean(
    videoSrc ||
    (iframeSrc && (playable?.youtubeId || playable?.platform === "tiktok")),
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
    if (!source || !playable) return;
    if (playable.youtubeId) {
      source.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [target, true] }), "*");
    } else if (playable.platform === "tiktok") {
      source.postMessage({ "x-tiktok-player": true, type: "seekTo", value: target }, "*");
    }
  }, [knownDuration, playable]);

  const playNow = useCallback(() => {
    if (!playable) return;
    onPreviewLeave?.();
    const startAtSeconds = seekable ? boundedScrubSeconds : moment?.seconds;
    if (player.current?.key === playable.key) {
      if (typeof startAtSeconds === "number") player.requestSeek(startAtSeconds);
      player.expand();
      return;
    }
    player.play(item, context, typeof startAtSeconds === "number" ? { startAtSeconds } : undefined);
  }, [boundedScrubSeconds, context, item, moment?.seconds, onPreviewLeave, playable, player, seekable]);

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

  const portalHost = document.getElementById("watch-preview-root") ?? document.body;
  const keyboardInstructionsId = panelId ? `${panelId}-keyboard-instructions` : undefined;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role={keyboardActive ? "dialog" : undefined}
      aria-hidden={preloadOnly ? true : undefined}
      aria-label={keyboardActive ? `Preview ${item.title}` : undefined}
      aria-describedby={keyboardActive ? keyboardInstructionsId : undefined}
      className={`watch-preview watch-preview-portal is-${shape} is-${item.platform} ${item.format === "photo" ? "is-photo" : ""} ${live ? "is-live" : ""} ${active ? "is-active" : "is-closing"} ${iframeSrc || videoSrc ? "has-motion" : "is-still"}`}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
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
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className={`watch-preview-video watch-preview-motion ${motionReady ? "is-ready" : ""}`}
              autoPlay={active}
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
              }}
              onCanPlay={(event) => {
                event.currentTarget.muted = true;
                if (active) void event.currentTarget.play().catch(() => {});
              }}
            />
          ) : iframeSrc ? (
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
                if (isInstagramPhoto) {
                  setLoadedStaticFrameSource(iframeSrc);
                  return;
                }
                requestProviderPlayback();
                if (playable?.platform === "twitch" || playable?.platform === "instagram") {
                  // Twitch handles muted autoplay from its parameters, while
                  // Instagram's official Reel embed exposes no playback event
                  // API. In both cases frame load is the strongest readiness
                  // signal available. Keep the still for one short paint, then
                  // reveal the provider surface without claiming play progress.
                  if (providerRevealTimerRef.current != null) {
                    window.clearTimeout(providerRevealTimerRef.current);
                  }
                  providerRevealTimerRef.current = window.setTimeout(() => {
                    providerRevealTimerRef.current = null;
                    setReadyMotionSource(iframeSrc);
                  }, playable.platform === "instagram" ? 280 : 220);
                }
              }}
            />
          ) : null}
          {!iframeSrc && !videoSrc ? <span className="watch-preview-veil" aria-hidden /> : null}
          {!isPhoto && !iframeSrc && !videoSrc ? <span className="watch-preview-play" aria-hidden /> : null}
          {live ? (
            <span className="watch-preview-live">Live</span>
          ) : null}
        </Link>
        {!isPhoto && motionSource && motionReady ? (
          <PreviewAudioControl
            active={active}
            ready={motionReady}
            native={Boolean(videoSrc)}
            nativeRef={videoRef}
            frameRef={frameRef}
            youtube={Boolean(iframeSrc && playable?.youtubeId)}
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
        ) : playable && !live && item.format !== "photo" ? (
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
          </p>
          {moment ? (
            <p className="watch-preview-moment">Matched moment · {moment.title} · {Math.floor(moment.seconds / 60)}:{String(Math.floor(moment.seconds % 60)).padStart(2, "0")}</p>
          ) : null}
        </div>
      </Link>
      <Tooltip
        title={authLoading ? "Loading DVR" : user && saved ? "Remove from DVR" : "Add to DVR"}
        description={authLoading
          ? "Checking your saved titles."
          : user
            ? saved
              ? "Remove this title from your DVR."
              : "Add this title to your DVR so you can quickly find it later."
            : "Sign in to add this title to your DVR across your devices."}
        placement="top"
        isDisabled={authLoading}
      >
        <button
          type="button"
          tabIndex={keyboardActive ? 0 : -1}
          className="watch-preview-save"
          aria-pressed={Boolean(user && saved)}
          aria-label={authLoading
            ? "Loading DVR"
            : user
              ? saved
                ? `Remove ${item.title} from DVR`
                : isPhoto ? `Add photo ${item.title} to DVR` : `Add ${item.title} to DVR`
              : `Add ${item.title} to DVR`}
          disabled={authLoading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!user) {
              redirectToMyListSignIn();
              return;
            }
            toggleMyList(item.id);
          }}
        >
          <span className="watch-preview-save-icon"><PreviewListGlyph saved={saved} /></span>
          <span className="watch-preview-save-label" aria-hidden>
            {authLoading ? "Loading…" : user && saved ? "In DVR" : "Add to DVR"}
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

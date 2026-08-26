"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { MY_LIST_EVENT, readMyList, redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, embedFor, itemToPlayable } from "@/lib/watch/playable";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import {
  bestWatchProgressMark,
  CONTINUE_WATCHING_MIN_SECONDS,
} from "@/lib/watch/continue-watching";
import type { Playable } from "@/lib/watch/playable";
import { WatchThumb } from "./WatchThumb";

type BillboardTwitchInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  destroy?: () => void;
  play?: () => void;
  setMuted?: (muted: boolean) => void;
  /** Some Twitch builds never emit PLAYING while an ad/interstitial settles. */
  isPaused?: () => boolean;
};

type BillboardTwitchApi = {
  Player: {
    new (id: string, options: Record<string, unknown>): BillboardTwitchInstance;
    READY: string;
    PLAYING: string;
    OFFLINE: string;
    PLAYBACK_BLOCKED: string;
  };
};

let billboardTwitchScript: Promise<BillboardTwitchApi> | null = null;

function formatPlaybackTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function loadBillboardTwitch(): Promise<BillboardTwitchApi> {
  if (billboardTwitchScript) return billboardTwitchScript;

  const pending = new Promise<BillboardTwitchApi>((resolve, reject) => {
    const fromWindow = () => (window as typeof window & { Twitch?: BillboardTwitchApi }).Twitch;
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
    // Another watch surface may have inserted the SDK script first. Polling
    // avoids leaving this promise unresolved if its load event already fired.
    pollTimer = window.setInterval(done, 50);
    timeoutTimer = window.setTimeout(fail, 10_000);
    if (!existing) {
      script.src = "https://player.twitch.tv/js/embed/v1.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  billboardTwitchScript = pending;
  void pending.catch(() => {
    if (billboardTwitchScript === pending) billboardTwitchScript = null;
  });
  return pending;
}

function uniqueBillboards(items: WatchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function BillboardCarousel({ items }: { items: WatchItem[] }) {
  const slides = useMemo(() => uniqueBillboards(items), [items]);
  const [index, setIndex] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const interactionPaused = focusPaused || hoverPaused;

  useEffect(() => {
    setIndex((current) => (slides.length ? current % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || interactionPaused || reducedMotion) return;
    const active = slides[index] ?? slides[0];
    const delay = active?.kind === "live" || active?.format === "live" ? 30_000 : 12_000;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [index, interactionPaused, reducedMotion, slides]);

  if (!slides.length) return null;
  const item = slides[index] ?? slides[0]!;

  return (
    <div
      className="watch-billboard-carousel"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusPaused(false);
        }
      }}
    >
      <div key={item.id} className="watch-billboard-slide">
        <Billboard item={item} />
      </div>

      {slides.length > 1 ? (
        <div className="watch-billboard-controls" aria-label="Featured videos and live channels">
          <Tooltip
            title="Previous feature"
            description="Show the previous featured video or live channel."
            placement="top"
          >
            <button
              type="button"
              className="watch-billboard-arrow"
              aria-label="Previous feature"
              onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
            >
              <span aria-hidden>‹</span>
            </button>
          </Tooltip>
          <div className="watch-billboard-dots" role="tablist" aria-label="Featured rotation">
            {slides.map((slide, slideIndex) => (
              <Tooltip
                key={slide.id}
                title={slide.title}
                description="Jump directly to this featured title."
                placement="top"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={slideIndex === index}
                  aria-label={`Show ${slide.title}`}
                  className="watch-billboard-dot"
                  onClick={() => setIndex(slideIndex)}
                />
              </Tooltip>
            ))}
          </div>
          <Tooltip
            title="Next feature"
            description="Show the next featured video or live channel."
            placement="top"
          >
            <button
              type="button"
              className="watch-billboard-arrow"
              aria-label="Next feature"
              onClick={() => setIndex((current) => (current + 1) % slides.length)}
            >
              <span aria-hidden>›</span>
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

function BillboardLivePlayer({ item, playable, onOpen }: { item: WatchItem; playable: Playable; onOpen: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const twitchMountRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const twitchMountId = `watch-hero-twitch-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [twitchMounted, setTwitchMounted] = useState(false);
  const [twitchPlaying, setTwitchPlaying] = useState(false);
  const [twitchRecovering, setTwitchRecovering] = useState(false);
  const [slotFitsProvider, setSlotFitsProvider] = useState(false);
  const [providerExposed, setProviderExposed] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const {
    current,
    dataSaver,
    ready: playerReady,
  } = usePlayer();

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const updateFit = () => {
      const { width, height } = slot.getBoundingClientRect();
      const fits = item.platform === "twitch"
        ? width >= 400 && height >= 300
        : width >= 200 && height >= 200;
      setSlotFitsProvider(fits);
    };

    updateFit();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateFit);
      observer.observe(slot);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateFit);
    return () => window.removeEventListener("resize", updateFit);
  }, [item.platform]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    let frame = 0;
    const updateExposure = () => {
      frame = 0;
      const rect = slot.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      setProviderExposed(
        rect.width > 0 &&
        rect.height > 0 &&
        // The hero sits above the browse filters, so using the filter rail as
        // a visibility boundary accidentally prevented every carousel live
        // preview from mounting. A mostly visible hero is sufficient for
        // muted provider autoplay and keeps each selected stream active.
        visibleWidth / rect.width >= 0.85 &&
        visibleHeight / rect.height >= 0.85,
      );
    };
    const scheduleExposureUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateExposure);
    };

    updateExposure();
    window.addEventListener("resize", scheduleExposureUpdate);
    window.addEventListener("scroll", scheduleExposureUpdate, { passive: true });
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleExposureUpdate);
    observer?.observe(slot);

    return () => {
      window.removeEventListener("resize", scheduleExposureUpdate);
      window.removeEventListener("scroll", scheduleExposureUpdate);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(document.visibilityState === "visible");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const wantsAutoplay =
    playerReady &&
    // A persistent Theater/mini-player session owns playback across routes.
    // Do not open a second provider iframe in the billboard behind it.
    !current &&
    !dataSaver &&
    slotFitsProvider &&
    providerExposed &&
    pageVisible;
  const isTwitch = item.platform === "twitch";

  // Start fetching the Twitch SDK as soon as the hero is hydrated instead of
  // waiting for the viewport measurement and player preferences to settle.
  // The actual media player still mounts only when the preview is eligible.
  useEffect(() => {
    if (!isTwitch || dataSaver) return;
    void loadBillboardTwitch().catch(() => undefined);
  }, [dataSaver, isTwitch]);

  const frameSrc = useMemo(() => {
    if (!wantsAutoplay || !host || isTwitch) return null;
    return embedFor(playable, {
      parent: host.parent,
      origin: host.origin,
      muted: true,
      controls: false,
      autoplay: true,
      loop: false,
    });
  }, [
    host,
    isTwitch,
    playable,
    wantsAutoplay,
  ]);

  useEffect(() => {
    if (isTwitch || !frameSrc || loadedSrc !== frameSrc) return;
    const frame = slotRef.current?.querySelector<HTMLIFrameElement>(".watch-billboard-live-frame");
    if (!frame?.contentWindow) return;

    const requestPlayback = () => {
      frame.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func: "mute",
        args: [],
      }), "*");
      frame.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func: "playVideo",
        args: [],
      }), "*");
    };
    requestPlayback();
    const retries = [500, 1_500].map((delay) => window.setTimeout(requestPlayback, delay));
    return () => retries.forEach((timer) => window.clearTimeout(timer));
  }, [frameSrc, isTwitch, loadedSrc]);

  useEffect(() => {
    const mount = twitchMountRef.current;
    if (!isTwitch || !wantsAutoplay || !host || !playable.twitchLogin || !mount) {
      setTwitchMounted(false);
      setTwitchPlaying(false);
      return;
    }

    let disposed = false;
    let instance: BillboardTwitchInstance | null = null;
    let providerReady = false;
    let playbackStarted = false;
    let playbackAttempts = 0;
    const maxPlaybackAttempts = 14;
    const retryTimers = new Set<number>();
    let playbackWatchdog = 0;
    let readinessWatchdog = 0;
    let watchdogPasses = 0;
    let gestureRecoveryArmed = false;
    const clearPlaybackRetries = () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      retryTimers.clear();
    };
    const removeGestureRecovery = () => {
      if (!gestureRecoveryArmed) return;
      gestureRecoveryArmed = false;
      document.removeEventListener("click", recoverFromPointer, true);
      document.removeEventListener("keydown", recoverFromKeyboard, true);
    };
    const recoverPlayback = () => {
      if (disposed || !instance || !providerReady) return;
      removeGestureRecovery();
      instance.setMuted?.(true);
      instance.play?.();
    };
    function recoverFromPointer() {
      recoverPlayback();
    }
    function recoverFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      recoverPlayback();
    }
    const armGestureRecovery = () => {
      if (gestureRecoveryArmed || disposed) return;
      gestureRecoveryArmed = true;
      document.addEventListener("click", recoverFromPointer, true);
      document.addEventListener("keydown", recoverFromKeyboard, true);
    };
    const prepareIframe = () => {
      const frame = mount.querySelector("iframe");
      if (!frame || disposed) return false;
      frame.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
      setTwitchMounted(true);
      return true;
    };
    const mountObserver = new MutationObserver(prepareIframe);
    mountObserver.observe(mount, { childList: true, subtree: true });
    const requestPlayback = () => {
      if (disposed || !instance || !providerReady || playbackStarted || playbackAttempts >= maxPlaybackAttempts) return;
      playbackAttempts += 1;
      prepareIframe();
      instance.setMuted?.(true);
      instance.play?.();
    };
    const schedulePlaybackRetries = (delays: number[]) => {
      const available = Math.max(0, maxPlaybackAttempts - playbackAttempts - retryTimers.size);
      delays.slice(0, available).forEach((delay) => {
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer);
          requestPlayback();
        }, delay);
        retryTimers.add(timer);
      });
    };
    setTwitchMounted(false);
    setTwitchPlaying(false);
    setTwitchRecovering(false);
    mount.replaceChildren();

    void loadBillboardTwitch()
      .then((api) => {
        if (disposed) return;
        instance = new api.Player(twitchMountId, {
          width: "100%",
          height: "100%",
          channel: playable.twitchLogin,
          parent: [host.parent],
          autoplay: true,
          muted: true,
        });
        // Twitch requires an unobscured, interactive iframe before autoplay is
        // eligible. The mutation observer marks it mounted only after the SDK
        // has actually inserted that iframe.
        prepareIframe();
        armGestureRecovery();
        instance.addEventListener(api.Player.READY, () => {
          if (disposed) return;
          providerReady = true;
          playbackAttempts = 0;
          clearPlaybackRetries();
          requestPlayback();
          schedulePlaybackRetries([250, 600, 1_200, 2_200, 3_600, 5_200]);

          // PLAYING is occasionally withheld while Twitch transitions through
          // an ad or audience gate even though the SDK reports an active
          // player. Verify that state and continue muted requests instead of
          // leaving the CORE hero permanently in “warming”.
          playbackWatchdog = window.setInterval(() => {
            if (disposed || playbackStarted) return;
            watchdogPasses += 1;
            try {
              if (instance?.isPaused?.() === false) {
                playbackStarted = true;
                clearPlaybackRetries();
                removeGestureRecovery();
                setTwitchMounted(true);
                setTwitchPlaying(true);
                setTwitchRecovering(false);
                return;
              }
            } catch {
              // The player can reject state reads during an interstitial.
            }
            setTwitchRecovering(true);
            // Preserve a finite retry budget per pass, but allow a current
            // stream a few fresh attempts while the provider is transitioning.
            if (playbackAttempts >= maxPlaybackAttempts) playbackAttempts = Math.max(0, maxPlaybackAttempts - 4);
            requestPlayback();
            schedulePlaybackRetries([300, 850, 1_800]);
            if (watchdogPasses >= 4) window.clearInterval(playbackWatchdog);
          }, 4_000);
        });
        instance.addEventListener(api.Player.PLAYING, () => {
          if (disposed) return;
          playbackStarted = true;
          clearPlaybackRetries();
          removeGestureRecovery();
          instance?.setMuted?.(true);
          setTwitchMounted(true);
          setTwitchPlaying(true);
          setTwitchRecovering(false);
        });
        instance.addEventListener(api.Player.OFFLINE, () => {
          if (disposed) return;
          playbackStarted = false;
          providerReady = false;
          clearPlaybackRetries();
          removeGestureRecovery();
          window.clearInterval(playbackWatchdog);
          window.clearTimeout(readinessWatchdog);
          setTwitchMounted(false);
          setTwitchPlaying(false);
          setTwitchRecovering(false);
          instance?.destroy?.();
          mount.replaceChildren();
        });
        instance.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (disposed) return;
          // Keep Twitch's approved player visible so its native Play control
          // can recover when the browser requires a user gesture.
          clearPlaybackRetries();
          prepareIframe();
          setTwitchPlaying(false);
          setTwitchRecovering(true);
          armGestureRecovery();
          // This signal can arrive while Twitch is still resolving a stream,
          // an ad, or a mature-content interstitial. Keep trying muted
          // playback rather than abandoning the preview after one response.
          // A provider block can be transient. Re-open a little retry budget
          // so an earlier failed attempt does not permanently strand the
          // currently selected live hero.
          playbackAttempts = Math.max(0, playbackAttempts - 3);
          schedulePlaybackRetries([350, 900, 1_800, 3_000]);
        });
        readinessWatchdog = window.setTimeout(() => {
          if (disposed || providerReady || playbackStarted) return;
          // The SDK iframe is visible, so keep its native recovery route
          // available and mark the state accurately rather than presenting an
          // endless generic spinner. A real interaction can still recover it.
          prepareIframe();
          setTwitchRecovering(true);
          armGestureRecovery();
        }, 6_000);
      })
      .catch(() => {
        if (disposed) return;
        setTwitchMounted(false);
        setTwitchPlaying(false);
        setTwitchRecovering(false);
        mount.replaceChildren();
      });

    return () => {
      disposed = true;
      clearPlaybackRetries();
      removeGestureRecovery();
      mountObserver.disconnect();
      window.clearInterval(playbackWatchdog);
      window.clearTimeout(readinessWatchdog);
      instance?.destroy?.();
      mount.replaceChildren();
    };
  }, [host, isTwitch, playable.twitchLogin, twitchMountId, wantsAutoplay]);

  const frameReady = isTwitch
    ? twitchPlaying
    : Boolean(frameSrc && loadedSrc === frameSrc);
  const previewState = frameReady
    ? "playing"
    : twitchMounted
      ? twitchRecovering ? "recovering" : "warming"
      : "poster";

  return (
    <div
      ref={slotRef}
      className={`watch-billboard-live-player is-preview ${isTwitch ? "is-twitch" : "is-youtube"} ${twitchMounted ? "is-mounted" : ""} ${frameReady ? "is-ready" : ""} ${twitchPlaying ? "is-playing" : ""}`}
      data-preview-state={previewState}
    >
      <WatchThumb
        youtubeId={playable.youtubeId}
        src={item.backdrop || item.poster}
        className="watch-billboard-live-fallback"
        loading="eager"
        focalPoint={item.focalPoint}
      />
      {isTwitch ? (
        <div
          ref={twitchMountRef}
          id={twitchMountId}
          className="watch-billboard-live-mount"
        />
      ) : frameSrc ? (
        <iframe
          title={`${item.title} live stream`}
          src={frameSrc}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="watch-billboard-live-frame"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoadedSrc(frameSrc)}
          onError={() => setLoadedSrc(null)}
        />
      ) : null}
      <button
        type="button"
        className="watch-billboard-live-core-overlay"
        onClick={onOpen}
        aria-label={`Open ${item.title} in the media player`}
      >
        <span className="watch-billboard-live-core-badge"><i aria-hidden /> Live · CORE</span>
        <span className="watch-billboard-live-core-open"><span aria-hidden>▶</span> Open player</span>
        <span className="watch-billboard-live-core-muted">Muted preview</span>
      </button>
    </div>
  );
}

export function Billboard({ item }: { item: WatchItem }) {
  const [saved, setSaved] = useState(false);
  const { map } = useWatchProgress();
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const youtubeId = item.platform === "youtube" ? youtubeIdFromHref(item.href) : null;
  const mark = bestWatchProgressMark(
    [item.id, youtubeId]
      .filter(Boolean)
      .map((ref) => map[ref as string]),
  );
  const progress = Math.min(1, Math.max(0, mark?.progress ?? 0));
  const live = item.kind === "live" || item.format === "live";
  const shape = contentShape(item);
  const playable = useMemo(() => itemToPlayable(item), [item]);
  const livePlayable = useMemo(() => {
    if (
      !live ||
      item.live?.type === "audio" ||
      item.embeddable === false ||
      item.previewStrategy === "external" ||
      item.previewStrategy === "image" ||
      (item.platform !== "twitch" && item.platform !== "youtube")
    ) {
      return null;
    }
    if (!playable) return null;
    if (item.platform === "twitch" && !playable.twitchLogin) return null;
    if (item.platform === "youtube" && !playable.youtubeId) return null;
    return playable;
  }, [item, live, playable]);
  const fallbackOnly = !playable;
  const fallbackHref = item.sourceUrl || item.href;
  const resumable = !mark?.completed &&
    ((mark?.seconds ?? 0) >= CONTINUE_WATCHING_MIN_SECONDS || progress > 0.03);
  const watchedDuration = Math.max(0, mark?.durationSeconds ?? item.durationSeconds ?? 0);
  const watchedPosition = Math.min(
    watchedDuration || Number.POSITIVE_INFINITY,
    Math.max(0, mark?.positionSeconds ?? (watchedDuration * progress)),
  );
  const playbackTimeLabel = resumable && watchedDuration > 0
    ? `${formatPlaybackTime(watchedPosition)} / ${formatPlaybackTime(watchedDuration)}`
    : null;
  const action = item.format === "photo" ? "View" : live ? "Watch live" : resumable ? "Continue watching" : "Play";
  const titleSizeClass = item.title.length > 88
    ? "is-extra-long"
    : item.title.length > 54
      ? "is-long"
      : "";
  const playInPlayer = () => {
    if (!playable) return;
    player.play(item);
  };

  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<string[]> | undefined)?.detail;
      const ids = Array.isArray(detail) ? detail : readMyList();
      setSaved(ids.includes(item.id));
    };
    sync();
    window.addEventListener(MY_LIST_EVENT, sync);
    return () => window.removeEventListener(MY_LIST_EVENT, sync);
  }, [item.id]);

  return (
    <header
      className={`watch-billboard is-${shape} is-platform-${item.platform} ${livePlayable ? "has-live-player" : ""}`}
      aria-labelledby="watch-billboard-title"
    >
      <div className="watch-billboard-media" aria-hidden>
        <WatchThumb
          youtubeId={youtubeId}
          src={item.backdrop || item.poster}
          className="watch-billboard-backfill"
          loading="eager"
          focalPoint={item.focalPoint}
        />
        <WatchThumb
          youtubeId={youtubeId}
          src={item.backdrop || item.poster}
          className="watch-billboard-primary"
          loading="eager"
          focalPoint={item.focalPoint}
        />
      </div>
      <div className="watch-billboard-veil" aria-hidden />

      {livePlayable ? <BillboardLivePlayer item={item} playable={livePlayable} onOpen={playInPlayer} /> : null}

      {playable && !livePlayable ? (
        <button
          type="button"
          className="watch-billboard-surface-action"
          aria-label={`${action} ${item.title} in the media player`}
          onClick={playInPlayer}
        />
      ) : null}

      <div className="watch-billboard-copy relative z-10 w-full max-w-[56rem] px-5 pb-16 pt-32 md:px-10 md:pb-24">
        <p className="watch-billboard-kicker">
          {live ? <span className="watch-billboard-live">Live</span> : null}
          <span>{watchAttributionLabel(item)}</span>
        </p>
        <h1
          id="watch-billboard-title"
          className={`watch-title ${titleSizeClass} mt-3 max-w-[52rem] break-words text-[color:var(--ink)]`}
        >
          {item.title}
        </h1>

        {progress > 0 && !live ? (
          <div className="watch-billboard-progress-row">
            <div className="watch-billboard-progress" aria-label={`${Math.round(progress * 100)}% watched`}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {playbackTimeLabel ? <span className="watch-billboard-progress-time">{playbackTimeLabel}</span> : null}
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={(fallbackOnly ? fallbackHref : "#") as never}
            target={fallbackOnly && /^https?:\/\//i.test(fallbackHref) ? "_blank" : undefined}
            rel={fallbackOnly && /^https?:\/\//i.test(fallbackHref) ? "noopener noreferrer" : undefined}
            onClick={(event) => {
              if (!playable) return;
              event.preventDefault();
              playInPlayer();
            }}
            className="watch-billboard-play"
          >
            <span className="watch-billboard-play-icon" aria-hidden />
            {action}
          </Link>

          {item.memberSlug ? (
            <Link
              href={`/watch/network/${item.memberSlug}` as never}
              className="watch-billboard-details"
            >
              Details
            </Link>
          ) : null}

          <button
            type="button"
            aria-pressed={Boolean(user && saved)}
            aria-label={authLoading
              ? "Loading DVR"
              : user
                ? saved ? `Remove ${item.title} from DVR` : `Add ${item.title} to DVR`
                : `Add ${item.title} to DVR`}
            aria-busy={authLoading}
            disabled={authLoading}
            onClick={() => {
              if (!user) {
                redirectToMyListSignIn();
                return;
              }
              setSaved(toggleMyList(item.id).includes(item.id));
            }}
            className="watch-billboard-list"
          >
            <span aria-hidden>{saved ? "✓" : "+"}</span>
            {user && saved ? "In DVR" : "Add to DVR"}
          </button>

        </div>
      </div>
    </header>
  );
}

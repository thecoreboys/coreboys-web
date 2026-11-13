"use client";

import { billboardHeadline, compactTitle, readableTitle } from "@/lib/watch/presentation";

import Link from "next/link";
import { ChevronDown, Volume2, VolumeX } from "lucide-react";
import { setTwitchHeroSound } from "@/lib/watch/hero-audio";
import { PREVIEW_AUDIO_CLAIM_EVENT } from "@/lib/watch/preview-audio";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { MY_LIST_EVENT, readMyList, redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useInstagramPlayback } from "@/hooks/useInstagramPlayback";
import { nativeVideoSource } from "@/lib/watch/native-media";
import { isPreviewPlayerReady, previewPlaybackSample } from "@/lib/watch/preview-progress";
import { listenToYouTube } from "@/lib/watch/youtube-player";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useFirstVisitIntroActive } from "@/components/editorial/FirstVisitIntro";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, embedFor, itemToPlayable } from "@/lib/watch/playable";
import type { Playable } from "@/lib/watch/playable";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import {
  bestWatchProgressMark,
  CONTINUE_WATCHING_MIN_SECONDS,
} from "@/lib/watch/continue-watching";
import { WatchThumb } from "./WatchThumb";
import { advancingTwitchPlayback, observedTwitchLivePlayback } from "@/lib/watch/twitch-autoplay";
import { heroLiveIdentity, newlyLiveHero } from "@/lib/watch/hero-live-priority";
import { buildBillboardSlides, isBillboardFeatureActive, type BillboardFeature } from "@/lib/watch/billboard-features";

type BillboardTwitchInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  destroy?: () => void;
  play?: () => void;
  setMuted?: (muted: boolean) => void;
  setVolume?: (volume: number) => void;
  getMuted?: () => boolean;
  /** Some Twitch builds never emit PLAYING while an ad/interstitial settles. */
  isPaused?: () => boolean;
  getCurrentTime?: () => number;
  getPlaybackStats?: () => { fps?: number; playbackRate?: number; bufferSize?: number } | undefined;
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

export function BillboardCarousel({ items, headingLevel = "h1", feature }: { items: WatchItem[]; headingLevel?: "h1" | "h2"; feature?: BillboardFeature<ReactNode> }) {
  const mediaItems = useMemo(() => uniqueBillboards(items), [items]);
  const [featureVisible, setFeatureVisible] = useState(Boolean(feature));
  const slides = useMemo(() => buildBillboardSlides(mediaItems, featureVisible ? feature : undefined), [mediaItems, feature, featureVisible]);
  const [index, setIndex] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [soundPaused, setSoundPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const interactionPaused = focusPaused || hoverPaused || soundPaused;
  const seenLive = useRef(new Set(mediaItems.map(heroLiveIdentity).filter((key): key is string => Boolean(key))));
  const pendingLive = useRef<string | null>(null);
  const previousSlides = useRef(slides);
  const featureId = feature?.id;
  const featureExpiresAt = feature?.expiresAt;

  useEffect(() => {
    if (!featureId || featureExpiresAt === undefined) { setFeatureVisible(false); return; }
    const sync = () => setFeatureVisible(isBillboardFeatureActive(featureExpiresAt, Date.now()));
    sync();
    const timer = window.setTimeout(sync, Math.min(Math.max(0, featureExpiresAt - Date.now()), 2_147_483_647));
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", sync); window.removeEventListener("pageshow", sync); };
  }, [featureId, featureExpiresAt]);

  useEffect(() => {
    const previous = previousSlides.current;
    previousSlides.current = slides;
    setIndex((current) => {
      const nextIndex = slides.findIndex((slide) => slide.id === previous[current]?.id);
      return nextIndex >= 0 ? nextIndex : Math.min(current, Math.max(0, slides.length - 1));
    });
  }, [slides]);

  useEffect(() => {
    const next = newlyLiveHero(seenLive.current, mediaItems);
    if (next) pendingLive.current = next;
    seenLive.current = new Set(mediaItems.map(heroLiveIdentity).filter((key): key is string => Boolean(key)));
    if (interactionPaused || !pendingLive.current) return;
    const target = slides.findIndex((slide) => slide.kind === "media" && heroLiveIdentity(slide.item) === pendingLive.current);
    pendingLive.current = null;
    if (target >= 0) setIndex(target);
  }, [slides, mediaItems, interactionPaused]);

  useEffect(() => {
    if (slides.length < 2 || interactionPaused || reducedMotion) return;
    const active = slides[index] ?? slides[0];
    const delay = active?.kind === "media" && active.item.kind === "live" ? 30_000 : 12_000;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [index, interactionPaused, reducedMotion, slides]);

  if (!slides.length) return null;
  const slide = slides[index] ?? slides[0]!;

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
      <div key={slide.id} className="watch-billboard-slide">
        {slide.kind === "feature" ? slide.content : <Billboard item={slide.item} headingLevel={headingLevel} onSoundChange={setSoundPaused} />}
      </div>

      {slides.length > 1 ? (
        <div className="watch-billboard-navigation"><div className="watch-billboard-controls" aria-label="Featured content">
          <Tooltip
            title="Previous feature"
            description="Show the previous featured item."
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
            description="Show the next featured item."
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
        </div></div>
      ) : null}
    </div>
  );
}

function BillboardHeroPlayer({ item, playable, onSoundChange }: { item: WatchItem; playable: Playable; onSoundChange?: (audible: boolean) => void }) {
  const reducedMotion = useReducedMotion();
  const introActive = useFirstVisitIntroActive();
  const slotRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const twitchMountRef = useRef<HTMLDivElement>(null);
  const twitchPlayerRef = useRef<BillboardTwitchInstance | null>(null);
  const reactId = useId();
  const twitchMountId = `watch-hero-twitch-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [playingFrameSrc, setPlayingFrameSrc] = useState<string | null>(null);
  const frameStartedRef = useRef(false);
  const [twitchMounted, setTwitchMounted] = useState(false);
  const [twitchPlaying, setTwitchPlaying] = useState(false);
  const [twitchRecovering, setTwitchRecovering] = useState(false);
  const [twitchLoadError, setTwitchLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [nativePlaying, setNativePlaying] = useState(false);
  // Preview players always begin muted, which is the only autoplay mode that
  // works consistently across Twitch, YouTube, desktop, and mobile browsers.
  // The sound control below is a real viewer gesture, so it can safely opt
  // into audio after pixels are already playing.
  const mutedRef = useRef(true);
  const soundGestureAt = useRef(0);
  const [muted, setMuted] = useState(true);
  const [slotFitsProvider, setSlotFitsProvider] = useState(false);
  const [providerExposed, setProviderExposed] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const {
    current,
    dataSaver,
    previewAutoplay,
    ready: playerReady,
    claimPreviewAudio,
    releasePreviewAudio,
  } = usePlayer();

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const updateFit = ({ width, height }: { width: number; height: number }) => {
      const fits = item.platform === "twitch"
        ? width >= 400 && height >= 300
        : width >= 200 && height >= 200;
      setSlotFitsProvider(fits);
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) updateFit(entry.contentRect);
      });
      observer.observe(slot);
      return () => observer.disconnect();
    }

    const measureFit = () => updateFit(slot.getBoundingClientRect());
    measureFit();
    window.addEventListener("resize", measureFit);
    return () => window.removeEventListener("resize", measureFit);
  }, [item.platform]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry) setProviderExposed(entry.isIntersecting && entry.intersectionRatio >= 0.5);
      }, { threshold: [0, 0.5] });
      observer.observe(slot);
      return () => observer.disconnect();
    }

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
        // preview from mounting. Require at least half of the actual player
        // area, rather than requiring 85% in both dimensions.
        (visibleWidth * visibleHeight) / (rect.width * rect.height) >= 0.5,
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
    !introActive &&
    // A persistent Theater/mini-player session owns playback across routes.
    // Do not open a second provider iframe in the billboard behind it.
    !current &&
    !dataSaver &&
    previewAutoplay &&
    !reducedMotion &&
    slotFitsProvider &&
    providerExposed &&
    pageVisible;
  const isTwitch = item.platform === "twitch";
  const twitchChannel = playable.kind === "live" ? playable.twitchLogin : null;
  const twitchVideo = playable.vodId;
  const instagramUrl = useInstagramPlayback(playable.platform === "instagram" ? playable.sourceUrl ?? playable.url ?? playable.embedUrl : null,
    wantsAutoplay && !playable.mediaUrl);
  const [failedInstagramUrl, setFailedInstagramUrl] = useState<string | null>(null);
  const nativeVideoUrl = nativeVideoSource(playable, playable.clipSrc) ?? (instagramUrl !== failedInstagramUrl ? instagramUrl : null);

  const setHeroMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
  }, []);

  const requestFramePlayback = useCallback((nextMuted: boolean, requestPlay = false) => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    if (playable.platform === "tiktok") {
      target.postMessage({ "x-tiktok-player": true, type: nextMuted ? "mute" : "unmute" }, "https://www.tiktok.com");
      if (requestPlay) target.postMessage({ "x-tiktok-player": true, type: "play" }, "https://www.tiktok.com");
      return;
    }
    if (!playable.youtubeId) return;
    listenToYouTube(target, `core-billboard-${item.id}`);
    if (!nextMuted) target.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [100] }), "*");
    target.postMessage(JSON.stringify({
      event: "command",
      func: nextMuted ? "mute" : "unMute",
      args: [],
    }), "*");
    if (requestPlay) {
      target.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
    }
  }, [item.id, playable.platform, playable.youtubeId]);

  const toggleHeroMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    soundGestureAt.current = Date.now();
    setHeroMuted(nextMuted);
    try {
      if (isTwitch) {
        setTwitchHeroSound(twitchPlayerRef.current, nextMuted);
      } else if (nativeVideoRef.current) {
        nativeVideoRef.current.muted = nextMuted;
        if (!nextMuted) nativeVideoRef.current.volume = 1;
        void nativeVideoRef.current.play().then(() => setNativePlaying(true)).catch(() => setNativePlaying(false));
      } else {
        requestFramePlayback(nextMuted, true);
      }
    } catch {
      // Provider state may be changing. Its regular muted retry path remains
      // active and the next viewer click can retry the same control.
    }
  }, [isTwitch, requestFramePlayback, setHeroMuted]);

  useEffect(() => {
    const ownerId = `hero-${twitchMountId}`;
    onSoundChange?.(!muted);
    if (!muted) {
      window.dispatchEvent(new CustomEvent(PREVIEW_AUDIO_CLAIM_EVENT, { detail: { ownerId } }));
      claimPreviewAudio(ownerId);
    }
    return () => { onSoundChange?.(false); releasePreviewAudio(ownerId); };
  }, [muted, onSoundChange, claimPreviewAudio, releasePreviewAudio, twitchMountId]);

  useEffect(() => {
    const onClaim = (event: Event) => {
      const ownerId = (event as CustomEvent<{ ownerId: string }>).detail?.ownerId;
      if (!ownerId || ownerId === `hero-${twitchMountId}` || mutedRef.current) return;
      setHeroMuted(true);
      twitchPlayerRef.current?.setMuted?.(true);
      if (nativeVideoRef.current) nativeVideoRef.current.muted = true;
      requestFramePlayback(true);
    };
    window.addEventListener(PREVIEW_AUDIO_CLAIM_EVENT, onClaim);
    return () => window.removeEventListener(PREVIEW_AUDIO_CLAIM_EVENT, onClaim);
  }, [requestFramePlayback, setHeroMuted, twitchMountId]);

  useEffect(() => {
    if (!isTwitch || !twitchMounted) return;
    let previousPosition = -1;
    const timer = window.setInterval(() => {
      try {
        const player = twitchPlayerRef.current;
        const position = player?.getCurrentTime?.() ?? 0;
        const advancing = previousPosition >= 0 && position > previousPosition + .25 && player?.isPaused?.() === false;
        previousPosition = position;
        // Native Play can recover playback even if Twitch withholds PLAYING.
        if (advancing) {
          setTwitchPlaying(true);
          setTwitchRecovering(false);
        }
        // Before playback/interaction, SDK getters can contain default values.
        if ((!advancing && !soundGestureAt.current) || Date.now() - soundGestureAt.current < 1_500) return;
        const actual = player?.getMuted?.();
        if (typeof actual === "boolean" && actual !== mutedRef.current) setHeroMuted(actual);
      } catch { /* Twitch can reject state reads during an interstitial. */ }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [isTwitch, twitchMounted, setHeroMuted]);

  // Start fetching the Twitch SDK as soon as the hero is hydrated instead of
  // waiting for the viewport measurement and player preferences to settle.
  // The actual media player still mounts only when the preview is eligible.
  useEffect(() => {
    if (!isTwitch || dataSaver || reducedMotion || !previewAutoplay) return;
    void loadBillboardTwitch().catch(() => undefined);
  }, [dataSaver, isTwitch, previewAutoplay, reducedMotion]);

  const frameSrc = useMemo(() => {
    if (!wantsAutoplay || !host || isTwitch || nativeVideoUrl || playable.platform === "instagram") return null;
    return embedFor(playable, {
      parent: host.parent,
      origin: host.origin,
      muted: true,
      controls: true,
      autoplay: true,
      loop: false,
    });
  }, [
    host,
    isTwitch,
    nativeVideoUrl,
    playable,
    wantsAutoplay,
  ]);

  useEffect(() => {
    if (isTwitch || !frameSrc || loadedSrc !== frameSrc) return;
    const requestPlayback = () => { if (!frameStartedRef.current) requestFramePlayback(mutedRef.current, true); };
    requestPlayback();
    let attempts = 0;
    const retry = window.setInterval(() => { if (++attempts <= 24) requestPlayback(); }, 700);
    return () => window.clearInterval(retry);
  }, [frameSrc, isTwitch, loadedSrc, requestFramePlayback]);

  useEffect(() => {
    frameStartedRef.current = false;
    if (!frameSrc) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== new URL(frameSrc).origin) return;
      if (isPreviewPlayerReady(event.data)) { requestFramePlayback(mutedRef.current, true); return; }
      const sample = previewPlaybackSample(event.data);
      if (sample?.playing != null) {
        if (sample.playing) frameStartedRef.current = true;
        setPlayingFrameSrc(sample.playing ? frameSrc : null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameSrc, requestFramePlayback]);

  // First-party/direct programming uses a real media element instead of an
  // opaque iframe. Give it the same browser-safe muted retry path as YouTube
  // so a homepage hero is already moving when the viewer sees it.
  useEffect(() => {
    if (!nativeVideoUrl || !wantsAutoplay) {
      setNativePlaying(false);
      return;
    }
    const video = nativeVideoRef.current;
    if (!video) return;
    let disposed = false;
    const requestPlayback = () => {
      if (disposed) return;
      video.muted = mutedRef.current;
      void video.play().then(() => {
        if (!disposed) setNativePlaying(true);
      }).catch(() => {
        if (!disposed) setNativePlaying(false);
      });
    };
    requestPlayback();
    const retries = [180, 650, 1_400].map((delay) => window.setTimeout(requestPlayback, delay));
    return () => {
      disposed = true;
      retries.forEach((timer) => window.clearTimeout(timer));
    };
  }, [nativeVideoUrl, wantsAutoplay]);

  useEffect(() => {
    const mount = twitchMountRef.current;
    if (!isTwitch || !wantsAutoplay || !host || !mount || (!twitchChannel && !twitchVideo)) {
      setTwitchMounted(false);
      setTwitchPlaying(false);
      twitchPlayerRef.current = null;
      return;
    }

    let disposed = false;
    let instance: BillboardTwitchInstance | null = null;
    let providerReady = false;
    let playbackStarted = false;
    let providerPlaying = false;
    let playbackAttempts = 0;
    const maxPlaybackAttempts = 14;
    const retryTimers = new Set<number>();
    let playbackWatchdog = 0;
    let readinessWatchdog = 0;
    let lastObservedPosition = -1;
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
      instance.setMuted?.(mutedRef.current);
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
      instance.setMuted?.(mutedRef.current);
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
    setTwitchLoadError(false);
    mount.replaceChildren();

    void loadBillboardTwitch()
      .then((api) => {
        if (disposed) return;
        const options: Record<string, unknown> = {
          width: "100%",
          height: "100%",
          parent: [host.parent],
          autoplay: true,
          muted: true,
        };
        if (twitchChannel) options.channel = twitchChannel;
        else if (twitchVideo) options.video = twitchVideo.startsWith("v") ? twitchVideo : `v${twitchVideo}`;
        instance = new api.Player(twitchMountId, options);
        twitchPlayerRef.current = instance;
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
            try {
              const position = instance?.getCurrentTime?.() ?? 0;
              const paused = instance?.isPaused?.();
              const advanced = twitchChannel
                ? observedTwitchLivePlayback(providerPlaying, paused, instance?.getPlaybackStats?.()) || advancingTwitchPlayback(lastObservedPosition, position, paused)
                : advancingTwitchPlayback(lastObservedPosition, position, paused);
              lastObservedPosition = position;
              if (advanced) {
                playbackStarted = true;
                window.clearInterval(playbackWatchdog);
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
            // Keep attempts bounded while the provider initializes.
            requestPlayback();
            if (playbackAttempts >= maxPlaybackAttempts) {
              armGestureRecovery();
            }
          }, 1_000);
        });
        instance.addEventListener(api.Player.PLAYING, () => {
          if (disposed) return;
          // Twitch can emit PLAYING before an ad or the first frame advances.
          // The watchdog confirms playback before ending startup recovery.
          providerPlaying = true;
          setTwitchMounted(true);
        });
        instance.addEventListener(api.Player.OFFLINE, () => {
          if (disposed) return;
          playbackStarted = false;
          providerPlaying = false;
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
          playbackStarted = false;
          providerPlaying = false;
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
        setTwitchLoadError(true);
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
      if (twitchPlayerRef.current === instance) twitchPlayerRef.current = null;
      mount.replaceChildren();
    };
  }, [host, isTwitch, retryToken, twitchChannel, twitchMountId, twitchVideo, wantsAutoplay]);

  const frameReady = isTwitch
    ? twitchPlaying
    : nativeVideoUrl
      ? nativePlaying
      : Boolean(frameSrc && loadedSrc === frameSrc);
  const soundControlReady = isTwitch ? twitchMounted : (nativeVideoUrl
      ? wantsAutoplay
      : Boolean(frameSrc && loadedSrc === frameSrc));
  const previewState = frameSrc && loadedSrc === frameSrc
    ? playingFrameSrc === frameSrc ? "playing" : "warming"
    : frameReady
    ? "playing"
    : twitchMounted
      ? twitchRecovering ? "recovering" : "warming"
      : "poster";

  return (
    <div
      ref={slotRef}
      className={`watch-billboard-live-player is-preview ${isTwitch ? "is-twitch" : nativeVideoUrl ? "is-native" : playable.platform === "tiktok" ? "is-tiktok" : "is-youtube"} ${twitchMounted ? "is-mounted" : ""} ${frameReady ? "is-ready" : ""} ${twitchPlaying ? "is-playing" : ""}`}
      data-preview-state={previewState}
      data-cursor-native={isTwitch ? "true" : undefined}
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
      ) : nativeVideoUrl && wantsAutoplay ? (
        <video
          ref={nativeVideoRef}
          src={nativeVideoUrl}
          className="watch-billboard-live-frame"
          autoPlay
          muted={muted}
          playsInline
          preload="auto"
          onCanPlay={(event) => {
            event.currentTarget.muted = mutedRef.current;
            void event.currentTarget.play().then(() => setNativePlaying(true)).catch(() => setNativePlaying(false));
          }}
          onPlaying={() => setNativePlaying(true)}
          onPause={() => setNativePlaying(false)}
          onError={() => { setNativePlaying(false); if (nativeVideoUrl === instagramUrl) setFailedInstagramUrl(instagramUrl); }}
        />
      ) : frameSrc ? (
        <iframe
          title={`${item.title} muted preview`}
          src={frameSrc}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          ref={frameRef}
          className="watch-billboard-live-frame"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoadedSrc(frameSrc)}
          onError={() => setLoadedSrc(null)}
        />
      ) : null}
      {isTwitch && twitchLoadError ? <div className="watch-billboard-provider-error" role="status">
        <span>Couldn’t load Twitch</span>
        <button type="button" onClick={() => setRetryToken((value) => value + 1)}>Try again</button>
        <a href={twitchChannel ? `https://www.twitch.tv/${encodeURIComponent(twitchChannel)}` : `https://www.twitch.tv/videos/${encodeURIComponent(twitchVideo ?? "")}`} target="_blank" rel="noopener noreferrer">Open on Twitch</a>
      </div> : null}
      <div className="watch-billboard-provider-status">
      {soundControlReady ? (
        <button
          type="button"
          className="watch-billboard-live-sound"
          aria-pressed={!muted}
          aria-label={muted ? `Turn sound on for ${item.title}` : `Mute ${item.title}`}
          onClick={toggleHeroMute}
        >
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
          {muted ? "Turn sound on" : "Mute stream"}
        </button>
      ) : null}
      </div>
    </div>
  );
}

export function Billboard({ item, headingLevel: Heading = "h1", onSoundChange }: { item: WatchItem; headingLevel?: "h1" | "h2"; onSoundChange?: (audible: boolean) => void }) {
  const [saved, setSaved] = useState(false);
  const { map } = useWatchProgress();
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const dvrLoading = authLoading || subscription.loading;
  const dvrAllowed = subscription.hasFeature("dvr.extended_retention");
  const dvrSaved = dvrAllowed && saved;
  const playable = useMemo(() => itemToPlayable(item), [item]);
  const youtubeId = playable?.youtubeId ?? (item.platform === "youtube" ? youtubeIdFromHref(item.href) : null);
  const mark = bestWatchProgressMark(
    [item.id, youtubeId]
      .filter(Boolean)
      .map((ref) => map[ref as string]),
  );
  const progress = Math.min(1, Math.max(0, mark?.progress ?? 0));
  const live = item.kind === "live" || item.format === "live";
  const shape = contentShape(item);
  const heroPlayable = useMemo(() => {
    const hasDirectVideo = Boolean(playable && nativeVideoSource(playable, playable.clipSrc));
    if (
      item.live?.type === "audio" ||
      item.embeddable === false ||
      item.previewStrategy === "external" ||
      item.previewStrategy === "image" ||
      (item.platform !== "twitch" && item.platform !== "tiktok" && item.platform !== "instagram" && !playable?.youtubeId && !hasDirectVideo)
    ) {
      return null;
    }
    if (!playable) return null;
    // Twitch live channels and past broadcasts share the same SDK path. It
    // lets both start muted and retry from a provider-ready player instead of
    // showing an iframe that appears permanently stalled in the hero.
    if (item.platform === "twitch" && !((live && playable.twitchLogin) || playable.vodId)) return null;
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
  const mobileHeadline = billboardHeadline(item.title);
  const hasFullTitle = mobileHeadline !== readableTitle(item.title);
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
      className={`watch-billboard is-${shape} is-platform-${item.platform} ${heroPlayable ? "has-live-player" : ""}`}
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

      {heroPlayable ? <BillboardHeroPlayer item={item} playable={heroPlayable} onSoundChange={onSoundChange} /> : null}

      {playable && !heroPlayable ? (
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
        <Heading
          id="watch-billboard-title"
          title={item.title}
          className={`watch-title ${titleSizeClass} mt-3 max-w-[52rem] break-words text-[color:var(--ink)]`}
        >
          <span className="watch-billboard-desktop-title">{compactTitle(item.title, 84)}</span>
          <span className="watch-billboard-mobile-title">{mobileHeadline}</span>
        </Heading>
        {hasFullTitle ? <details className="watch-billboard-title-details">
          <summary>{live ? "Full stream title" : "Full title"}<ChevronDown size={14} aria-hidden /></summary>
          <p>{item.title}</p>
        </details> : null}

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
            aria-pressed={Boolean(user && dvrSaved)}
            aria-label={dvrLoading
              ? "Loading DVR"
              : user
                ? dvrSaved ? `Remove ${item.title} from DVR` : `Save ${item.title} to DVR`
                : `Save ${item.title} to DVR`}
            aria-busy={dvrLoading}
            disabled={dvrLoading}
            onClick={() => {
              if (!user) {
                redirectToMyListSignIn();
                return;
              }
              if (!dvrAllowed) {
                window.location.assign(subscription.featureHref("dvr.extended_retention"));
                return;
              }
              setSaved(toggleMyList(item.id).includes(item.id));
            }}
            className="watch-billboard-list"
          >
            <span aria-hidden>{dvrSaved ? "✓" : "+"}</span>
            {dvrLoading ? "Loading…" : user && dvrSaved ? "Saved to DVR" : "Save to DVR"}
          </button>

        </div>
      </div>
    </header>
  );
}

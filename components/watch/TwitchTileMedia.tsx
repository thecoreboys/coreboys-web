"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadTwitchPlayer, type TwitchPlayerInstance } from "@/lib/watch/twitch-player";
import { advancingTwitchPlayback, createTwitchAutoplayBudget, createTwitchLivePlaybackClock, observedTwitchLivePlayback } from "@/lib/watch/twitch-autoplay";
import { withTwitchAutoplayPermissions } from "@/lib/watch/player-autoplay";

export function TwitchTileMedia({ channel, video, muted, volume, startSeconds, onPlaying, onPaused, onProgress, onEnded }: {
  channel?: string | null;
  video?: string | null;
  muted: boolean;
  volume: number;
  startSeconds: number;
  onPlaying: () => void;
  onPaused: () => void;
  onProgress: (position: number, duration: number) => void;
  onEnded: () => void;
}) {
  const id = `core-room-twitch-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const current = useRef({ muted, volume, startSeconds, onPlaying, onPaused, onProgress, onEnded });
  current.current = { muted, volume, startSeconds, onPlaying, onPaused, onProgress, onEnded };
  const [failed, setFailed] = useState(false);
  const [startRequired, setStartRequired] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let instance: TwitchPlayerInstance | null = null;
    let poll = 0;
    let playing = false;
    let ready = false;
    let inView = false;
    let previousPosition = -1;
    let providerPlaying = false;
    const budget = createTwitchAutoplayBudget(12);
    const liveClock = createTwitchLivePlaybackClock();
    const mount = mountRef.current;
    setFailed(false);
    setStartRequired(false);
    const prepareFrame = () => {
      const frame = mount?.querySelector("iframe");
      if (frame) frame.setAttribute("allow", withTwitchAutoplayPermissions(frame.getAttribute("allow")));
    };
    const observer = new MutationObserver(prepareFrame);
    if (mount) observer.observe(mount, { childList: true, subtree: true });
    const setPlaying = (next: boolean) => {
      if (next === playing) return;
      playing = next;
      if (next) current.current.onPlaying();
      else current.current.onPaused();
    };
    const requestStart = () => {
      if (disposed || !ready || !instance || !budget.takeAttempt()) return;
      prepareFrame();
      try {
        instance.setMuted?.(true);
        instance.play?.();
      } catch { /* Retry within the visible activation's remaining budget. */ }
    };
    const updateVisibility = () => {
      const wasVisible = budget.visible;
      budget.setVisible(inView && document.visibilityState === "visible");
      if (!budget.visible) liveClock.sample(performance.now(), false);
      if (!wasVisible && budget.visible && !budget.started) {
        previousPosition = -1;
        setStartRequired(false);
        requestStart();
      }
    };
    const visibilityObserver = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      updateVisibility();
    }, { threshold: [0, 0.5] });
    if (mount) visibilityObserver.observe(mount);
    document.addEventListener("visibilitychange", updateVisibility);
    retryRef.current = () => {
      if (!ready) { setAttempt((value) => value + 1); return; }
      budget.restart();
      previousPosition = -1;
      setStartRequired(false);
      requestStart();
    };
    const readinessTimeout = window.setTimeout(() => {
      if (!disposed && !budget.started) setStartRequired(true);
    }, 18_000);
    void loadTwitchPlayer().then((api) => {
      if (disposed) return;
      instance = new api.Player(id, {
        width: "100%", height: "100%", parent: [window.location.hostname],
        autoplay: true, muted: true,
        ...(channel ? { channel } : { video: video?.startsWith("v") ? video : `v${video}` }),
      });
      playerRef.current = instance;
      prepareFrame();
      instance.addEventListener(api.Player.READY, () => {
        if (disposed || !instance || ready) return;
        ready = true;
        window.clearTimeout(readinessTimeout);
        instance.setMuted?.(current.current.muted);
        instance.setVolume?.(current.current.volume);
        if (video && current.current.startSeconds > 0) instance.seek?.(current.current.startSeconds);
        requestStart();
        poll = window.setInterval(() => {
          if (disposed || !instance) return;
          try {
            const paused = instance.isPaused?.();
            const livePlaying = channel && observedTwitchLivePlayback(providerPlaying, paused, instance.getPlaybackStats?.());
            const position = channel
              ? liveClock.sample(performance.now(), Boolean(livePlaying && budget.visible))
              : instance.getCurrentTime();
            current.current.onProgress(position, channel ? 0 : instance.getDuration());
            // PLAYING and isPaused=false can precede a stalled 00:00 player.
            // Only advancing media retires autoplay recovery or credits time.
            if (channel ? livePlaying : advancingTwitchPlayback(previousPosition, position, paused)) {
              budget.confirmPlayback();
              setStartRequired(false);
              setPlaying(true);
            } else if (paused === true) setPlaying(false);
            previousPosition = position;
            if (budget.visible && !budget.started) {
              if (budget.exhausted) setStartRequired(true);
              else requestStart();
            }
          } catch { /* Provider state is temporarily unavailable. */ }
        }, 1_000);
      });
      instance.addEventListener(api.Player.PLAYING, () => {
        // The next advancing playhead sample confirms actual playback.
        if (!disposed) { providerPlaying = true; setStartRequired(false); }
      });
      instance.addEventListener(api.Player.PAUSE, () => {
        if (disposed) return;
        providerPlaying = false;
        liveClock.sample(performance.now(), false);
        budget.pause();
        setPlaying(false);
      });
      instance.addEventListener(api.Player.ENDED, () => { if (!disposed) current.current.onEnded(); });
      instance.addEventListener(api.Player.OFFLINE, () => {
        providerPlaying = false;
        liveClock.sample(performance.now(), false);
        if (!disposed) setPlaying(false);
      });
      instance.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
        if (disposed) return;
        providerPlaying = false;
        liveClock.sample(performance.now(), false);
        setPlaying(false);
        // The visible polling loop retries without recursively spending its
        // entire budget on synchronous provider block notifications.
        if (budget.exhausted) setStartRequired(true);
      });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      observer.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      window.clearInterval(poll);
      window.clearTimeout(readinessTimeout);
      retryRef.current = null;
      playerRef.current = null;
      try { instance?.pause?.(); instance?.destroy?.(); } catch { /* Already detached. */ }
      mount?.replaceChildren();
    };
  }, [attempt, channel, id, video]);

  useEffect(() => {
    try {
      playerRef.current?.setMuted?.(muted);
      playerRef.current?.setVolume?.(volume);
    } catch { /* READY applies the latest volume once the SDK settles. */ }
  }, [muted, volume]);

  useEffect(() => {
    if (!video) return;
    try { playerRef.current?.seek?.(startSeconds); } catch { /* Wait for READY. */ }
  }, [startSeconds, video]);

  return <>
    <div ref={mountRef} id={id} className="absolute inset-0" />
    {startRequired && !failed ? <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 rounded-lg bg-black/90 px-3 py-2 text-xs text-white" role="status">
      <span>Press Play in the Twitch player.</span>
      <button type="button" className="pointer-events-auto min-h-10 rounded-lg bg-white px-3 font-semibold text-black" onClick={(event) => { event.stopPropagation(); retryRef.current?.(); }}>Retry playback</button>
    </div> : null}
    {failed ? <div className="absolute inset-0 grid place-content-center gap-3 bg-[#101014] p-5 text-center text-sm">
      <p>Twitch could not load.</p>
      <button type="button" className="rounded-lg border border-white/20 px-4 py-2" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
    </div> : null}
  </>;
}

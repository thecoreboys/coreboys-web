"use client";

import { useEffect, useId, useRef } from "react";
import { loadTwitchPlayer, type TwitchPlayerInstance } from "@/lib/watch/twitch-player";
import { advancingTwitchPlayback, createTwitchAutoplayBudget, observedTwitchLivePlayback } from "@/lib/watch/twitch-autoplay";
import { withTwitchAutoplayPermissions } from "@/lib/watch/player-autoplay";

/** A muted preview that hands a provider-frame click to Theater. */
export function TwitchHoverMedia({ channel, video, active, title, startSeconds, onPlayingChange, onProgress, onSelect }: {
  channel: string | null;
  video: string | null;
  active: boolean;
  title: string;
  startSeconds: number;
  onPlayingChange: (playing: boolean) => void;
  onProgress: (position: number, duration: number) => void;
  onSelect: () => void;
}) {
  const id = `core-hover-twitch-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const mountRef = useRef<HTMLDivElement>(null);
  const syncActiveRef = useRef<(() => void) | null>(null);
  const current = useRef({ active, title, startSeconds, onPlayingChange, onProgress, onSelect });
  current.current = { active, title, startSeconds, onPlayingChange, onProgress, onSelect };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || (!channel && !video)) return;
    mount.dataset.previewState = "loading";
    let disposed = false;
    let instance: TwitchPlayerInstance | null = null;
    let ready = false;
    let inView = false;
    let providerPlaying = false;
    let playing = false;
    let previousPosition = -1;
    let selectTimer = 0;
    const budget = createTwitchAutoplayBudget();
    const setPlaying = (next: boolean) => {
      if (disposed || next === playing) return;
      playing = next;
      mount.dataset.previewState = next ? "playing" : "paused";
      current.current.onPlayingChange(next);
    };
    const prepareFrame = () => {
      const frame = mount.querySelector("iframe");
      if (!frame) return;
      frame.setAttribute("allow", withTwitchAutoplayPermissions(frame.getAttribute("allow")));
      frame.title = `${current.current.title} muted preview`;
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
    };
    const requestPlayback = () => {
      if (disposed || !ready || !instance || !budget.takeAttempt()) return;
      mount.dataset.previewState = "starting";
      prepareFrame();
      try {
        instance.setMuted?.(true);
        instance.play?.();
      } catch { /* Retry after Twitch finishes becoming ready. */ }
    };
    const syncActive = () => {
      const wasVisible = budget.visible;
      const visible = current.current.active && inView && document.visibilityState === "visible";
      mount.dataset.previewVisible = String(visible);
      budget.setVisible(visible);
      if (!visible) {
        providerPlaying = false;
        previousPosition = -1;
        setPlaying(false);
        try { instance?.pause?.(); } catch { /* The iframe may still be loading. */ }
      } else if (!wasVisible) {
        budget.restart();
        requestPlayback();
      }
    };
    syncActiveRef.current = syncActive;
    const frameObserver = new MutationObserver(prepareFrame);
    frameObserver.observe(mount, { childList: true, subtree: true });
    const visibilityObserver = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      syncActive();
    }, { threshold: [0, 0.5] });
    visibilityObserver.observe(mount);
    document.addEventListener("visibilitychange", syncActive);
    const selectFrame = () => {
      window.clearTimeout(selectTimer);
      // Cross-origin iframe clicks do not bubble. Clicking its visible player
      // moves focus into the frame; observe that handoff without a click shield.
      selectTimer = window.setTimeout(() => {
        if (!disposed && current.current.active && document.activeElement === mount.querySelector("iframe")) {
          current.current.onSelect();
        }
      }, 0);
    };
    window.addEventListener("blur", selectFrame);

    void loadTwitchPlayer().then((api) => {
      if (disposed) return;
      instance = new api.Player(id, {
        width: "100%", height: "100%", parent: [window.location.hostname],
        // Active hover windows request autoplay immediately. Intent-only
        // mounts remain paused until their visibility observer promotes them.
        autoplay: current.current.active, muted: true,
        ...(channel ? { channel } : { video: video?.startsWith("v") ? video : `v${video}` }),
      });
      prepareFrame();
      instance.addEventListener(api.Player.READY, () => {
        if (disposed || !instance) return;
        ready = true;
        mount.dataset.previewState = "ready";
        instance.setMuted?.(true);
        if (video && current.current.startSeconds > 0) instance.seek?.(current.current.startSeconds);
        requestPlayback();
      });
      instance.addEventListener(api.Player.PLAYING, () => {
        if (disposed) return;
        providerPlaying = true;
        // A late event must not revive a closed preview or compete with Theater.
        if (!budget.visible) syncActive();
      });
      const stopped = () => {
        if (disposed) return;
        providerPlaying = false;
        setPlaying(false);
      };
      instance.addEventListener(api.Player.PAUSE, stopped);
      instance.addEventListener(api.Player.PLAYBACK_BLOCKED, stopped);
      instance.addEventListener(api.Player.OFFLINE, stopped);
      instance.addEventListener(api.Player.ENDED, stopped);
    }).catch(() => { setPlaying(false); });

    const poll = window.setInterval(() => {
      if (disposed || !ready || !instance || !budget.visible) return;
      try {
        const paused = instance.isPaused?.();
        const position = channel ? 0 : instance.getCurrentTime();
        const verified = channel
          ? observedTwitchLivePlayback(providerPlaying, paused, instance.getPlaybackStats?.())
          : advancingTwitchPlayback(previousPosition, position, paused);
        if (verified) {
          budget.confirmPlayback();
          setPlaying(true);
          if (video) current.current.onProgress(position, instance.getDuration());
        } else if (paused === true) {
          if (playing) budget.restart();
          setPlaying(false);
        }
        previousPosition = position;
      } catch { /* Twitch can withhold state while loading an ad or stream. */ }
      requestPlayback();
    }, 750);

    return () => {
      disposed = true;
      syncActiveRef.current = null;
      window.clearInterval(poll);
      window.clearTimeout(selectTimer);
      frameObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", syncActive);
      window.removeEventListener("blur", selectFrame);
      try { instance?.pause?.(); instance?.destroy?.(); } catch { /* Already detached. */ }
      mount.replaceChildren();
    };
  }, [channel, id, video]);

  useEffect(() => { syncActiveRef.current?.(); }, [active]);

  // Keep the SDK surface visible from mount: fading an iframe in only after
  // PLAYING deadlocks Twitch's visibility-gated autoplay.
  return <div ref={mountRef} id={id} className="watch-preview-twitch" aria-hidden="true" />;
}

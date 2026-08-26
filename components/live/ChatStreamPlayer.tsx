"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Captions,
  ExternalLink,
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ChatChannel } from "@/components/live/ChatHub";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { chatLiveMediaHref } from "@/lib/chat-layouts";

type TwitchQuality = string | { group?: string; name?: string };

type TwitchPlayerInstance = {
  addEventListener: (name: string, callback: () => void) => void;
  play: () => void;
  pause: () => void;
  isPaused: () => boolean;
  getMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  getQuality: () => string;
  getQualities: () => TwitchQuality[];
  setQuality: (quality: string) => void;
  enableCaptions?: () => void;
  disableCaptions?: () => void;
  destroy?: () => void;
};

type TwitchPlayerApi = {
  Player: {
    new (id: string, options: Record<string, unknown>): TwitchPlayerInstance;
    READY: string;
    PLAYING: string;
    PAUSE: string;
    OFFLINE: string;
    ONLINE: string;
    PLAYBACK_BLOCKED: string;
  };
};

type QualityOption = { value: string; label: string };

let twitchPlayerScript: Promise<TwitchPlayerApi> | null = null;

function loadTwitchPlayer(): Promise<TwitchPlayerApi> {
  if (twitchPlayerScript) return twitchPlayerScript;
  const pending = new Promise<TwitchPlayerApi>((resolve, reject) => {
    const known = (window as typeof window & { Twitch?: TwitchPlayerApi }).Twitch;
    if (known?.Player) {
      resolve(known);
      return;
    }

    const source = "https://player.twitch.tv/js/embed/v1.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${source}"]`);
    const script = existing ?? document.createElement("script");
    const fail = () => {
      if (!existing) script.remove();
      reject(new Error("twitch_player_unavailable"));
    };
    const done = () => {
      const api = (window as typeof window & { Twitch?: TwitchPlayerApi }).Twitch;
      if (api?.Player) resolve(api);
      else fail();
    };

    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = source;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  twitchPlayerScript = pending;
  void pending.catch(() => {
    if (twitchPlayerScript === pending) twitchPlayerScript = null;
  });
  return pending;
}

function qualityOptions(values: TwitchQuality[]): QualityOption[] {
  const seen = new Set<string>();
  const options: QualityOption[] = [];
  for (const quality of values) {
    const value = typeof quality === "string" ? quality : quality.group ?? quality.name ?? "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label = typeof quality === "string" ? quality : quality.name ?? quality.group ?? value;
    options.push({ value, label: value === "auto" ? "Auto" : label });
  }
  if (!seen.has("auto")) options.unshift({ value: "auto", label: "Auto" });
  return options;
}

const controlClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40";

export function ChatStreamPlayer({ channel, parent }: { channel: ChatChannel; parent: string }) {
  const reactId = useId();
  const mountId = `core-chat-stream-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [requireClickToPlay, setRequireClickToPlay] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState("auto");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const settingsId = `${mountId}-settings`;
  const mediaHref = useMemo(
    () => chatLiveMediaHref(channel.login, channel.slug),
    [channel.login, channel.slug],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let instance: TwitchPlayerInstance | null = null;
    let observer: MutationObserver | null = null;
    let playbackStarted = false;
    let streamOffline = false;
    let blockedFallbackTimer = 0;
    let playbackAttempts = 0;
    const retryTimers = new Set<number>();
    const clearPlaybackRetries = () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      retryTimers.clear();
    };
    const makeProviderInert = () => {
      const iframe = mount.querySelector("iframe");
      if (!iframe) return;
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.pointerEvents = "none";
    };
    const requestPlayback = () => {
      if (disposed || !instance || playbackAttempts >= 3) return;
      playbackAttempts += 1;
      try {
        instance.setMuted(true);
        setRequireClickToPlay(false);
        instance.play();
      } catch {
        setBlocked(true);
        setRequireClickToPlay(true);
      }
    };
    const schedulePlaybackRetries = () => {
      [0, 600, 1_800].forEach((delay) => {
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer);
          requestPlayback();
        }, delay);
        retryTimers.add(timer);
      });
      window.clearTimeout(blockedFallbackTimer);
      blockedFallbackTimer = window.setTimeout(() => {
        if (!disposed && !playbackStarted && !streamOffline) {
          setBlocked(true);
          setRequireClickToPlay(true);
        }
      }, 4_000);
    };

    void loadTwitchPlayer()
      .then((api) => {
        if (disposed) return;
        instance = new api.Player(mountId, {
          width: "100%",
          height: "100%",
          channel: channel.login,
          parent: [parent],
          autoplay: true,
          muted: true,
        });
        playerRef.current = instance;
        observer = new MutationObserver(makeProviderInert);
        observer.observe(mount, { childList: true, subtree: true });
        makeProviderInert();

        instance.addEventListener(api.Player.READY, () => {
          if (disposed || !instance) return;
          setReady(true);
          setFailed(false);
          setOffline(false);
          try {
            instance.setMuted(true);
            instance.setVolume(0.5);
            setMuted(true);
            setVolume(0.5);
            setRequireClickToPlay(false);
            schedulePlaybackRetries();
            try {
              const nextQualities = qualityOptions(instance.getQualities?.() ?? []);
              setQualities(nextQualities);
              const currentQuality = instance.getQuality?.() || nextQualities[0]?.value || "auto";
              setQuality(currentQuality);
            } catch {
              setQualities([{ value: "auto", label: "Auto" }]);
              setQuality("auto");
            }
          } catch {
            setBlocked(true);
            setRequireClickToPlay(true);
          }
          makeProviderInert();
        });
        instance.addEventListener(api.Player.PLAYING, () => {
          if (disposed) return;
          playbackStarted = true;
          clearPlaybackRetries();
          window.clearTimeout(blockedFallbackTimer);
          setPlaying(true);
          setBlocked(false);
          setRequireClickToPlay(false);
          setOffline(false);
        });
        instance.addEventListener(api.Player.PAUSE, () => {
          if (!disposed) setPlaying(false);
        });
        instance.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (disposed) return;
          clearPlaybackRetries();
          setPlaying(false);
          setBlocked(true);
          setRequireClickToPlay(true);
        });
        instance.addEventListener(api.Player.OFFLINE, () => {
          if (disposed) return;
          streamOffline = true;
          clearPlaybackRetries();
          window.clearTimeout(blockedFallbackTimer);
          setPlaying(false);
          setOffline(true);
        });
        instance.addEventListener(api.Player.ONLINE, () => {
          if (disposed) return;
          streamOffline = false;
          setOffline(false);
          try {
            instance?.play();
          } catch {
            setBlocked(true);
          }
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      clearPlaybackRetries();
      window.clearTimeout(blockedFallbackTimer);
      observer?.disconnect();
      playerRef.current = null;
      try {
        instance?.pause();
        instance?.destroy?.();
      } catch {
        // Twitch owns the injected iframe lifecycle.
      }
      mount.replaceChildren();
    };
  }, [channel.login, mountId, parent]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  const togglePlayback = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (player.isPaused?.() || !playing) {
        setBlocked(false);
        setRequireClickToPlay(false);
        player.play();
        window.setTimeout(() => {
          if (playerRef.current !== player) return;
          try {
            if (player.isPaused()) setBlocked(true);
          } catch {
            setBlocked(true);
          }
        }, 2_000);
      } else {
        player.pause();
      }
    } catch {
      setBlocked(true);
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    const next = !muted;
    try {
      player.setMuted(next);
      setMuted(next);
      if (!next && !playing) {
        setRequireClickToPlay(true);
        setBlocked(true);
      }
    } catch {
      // The player may be transitioning between online states.
    }
  };

  const updateVolume = (next: number) => {
    const player = playerRef.current;
    setVolume(next);
    if (!player) return;
    try {
      player.setVolume(next);
      if (next > 0 && muted) {
        player.setMuted(false);
        setMuted(false);
      }
    } catch {
      // Keep the local control responsive while Twitch recovers.
    }
  };

  const updateQuality = (next: string) => {
    setQuality(next);
    try {
      playerRef.current?.setQuality(next);
    } catch {
      // Quality availability can change during a live broadcast.
    }
  };

  const toggleCaptions = () => {
    const next = !captionsEnabled;
    try {
      if (next) playerRef.current?.enableCaptions?.();
      else playerRef.current?.disableCaptions?.();
      setCaptionsEnabled(next);
    } catch {
      // Some live titles do not carry a caption track.
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const status = failed
    ? "Stream unavailable"
    : offline
      ? "Channel offline"
      : blocked
        ? requireClickToPlay
          ? "Tap to start this stream"
          : "Stream blocked"
        : !ready
          ? "Loading stream…"
          : null;

  return (
    <div
      ref={rootRef}
      data-chat-stream-player
      className={`chat-stream-player group/player relative overflow-hidden bg-black ${settingsOpen ? "is-controls-open" : ""}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      <div ref={mountRef} id={mountId} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      <div
        aria-hidden="true"
        data-chat-stream-shield
        className="absolute inset-0 z-10 cursor-default"
        onDoubleClick={toggleFullscreen}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") rootRef.current?.classList.add("is-controls-open");
        }}
      />

      {status ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/20 p-4 text-center">
          <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
            {status}
          </span>
        </div>
      ) : null}

      {blocked && !offline && !failed ? (
        <button
          type="button"
          onClick={togglePlayback}
          className="absolute left-1/2 top-1/2 z-30 inline-flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]"
        >
          <Play className="size-4" fill="currentColor" aria-hidden="true" />
          Play stream
        </button>
      ) : null}

      {settingsOpen ? (
        <div
          id={settingsId}
          className="absolute bottom-14 right-2 z-40 w-[min(18rem,calc(100%-1rem))] rounded-xl border border-white/15 bg-[#111114]/95 p-3 text-white shadow-2xl backdrop-blur-xl"
          aria-label={`${channel.displayName} playback settings`}
        >
          <label className="block text-xs font-semibold text-white/70">
            Volume · {Math.round(volume * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(event) => updateVolume(Number(event.target.value) / 100)}
              className="mt-2 block w-full cursor-pointer accent-[color:var(--core)]"
              aria-label={`${channel.displayName} volume`}
            />
          </label>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-white/70">Quality</p>
            <WatchSelect
              compact
              ariaLabel={`${channel.displayName} stream quality`}
              value={quality}
              onChange={updateQuality}
              options={qualities.length
                ? qualities.map((option) => ({ id: option.value, label: option.label }))
                : [{ id: quality, label: quality === "auto" ? "Auto" : quality }]}
              className="[&_button]:rounded-lg [&_button]:bg-black/45 [&_button]:ring-white/15 [&_button:hover]:bg-white/10"
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={captionsEnabled}
            onClick={toggleCaptions}
            className="mt-3 flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="inline-flex items-center gap-2"><Captions className="size-4" aria-hidden="true" /> Captions</span>
            <span aria-hidden="true" className={`h-5 w-9 rounded-full p-0.5 transition ${captionsEnabled ? "bg-[color:var(--core)]" : "bg-white/20"}`}>
              <span className={`block size-4 rounded-full bg-white transition-transform ${captionsEnabled ? "translate-x-4" : ""}`} />
            </span>
          </button>
        </div>
      ) : null}

      <div
        className="chat-stream-controls absolute inset-x-2 bottom-2 z-50 flex items-center gap-1 rounded-xl border border-white/10 bg-black/80 p-1 shadow-xl backdrop-blur-md"
        role="group"
        aria-label={`${channel.displayName} stream controls`}
      >
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!ready || offline || failed}
          className={controlClass}
          aria-label={`${playing ? "Pause" : "Play"} ${channel.displayName}`}
        >
          {playing ? <Pause className="size-4" fill="currentColor" aria-hidden="true" /> : <Play className="size-4" fill="currentColor" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          disabled={!ready || offline || failed}
          className={controlClass}
          aria-label={`${muted ? "Unmute" : "Mute"} ${channel.displayName}`}
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold text-white/70">
          {playing ? "Live" : offline ? "Offline" : "Paused"}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          className={controlClass}
          aria-label={`${settingsOpen ? "Close" : "Open"} ${channel.displayName} playback settings`}
        >
          <Settings2 className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className={controlClass}
          aria-label={`${fullscreen ? "Exit fullscreen" : "Fullscreen"} ${channel.displayName}`}
        >
          {fullscreen ? <Minimize className="size-4" aria-hidden="true" /> : <Maximize className="size-4" aria-hidden="true" />}
        </button>
        <Link
          href={mediaHref as never}
          className={controlClass}
          aria-label={`Open ${channel.displayName} in the CORE media player`}
          title="Open media player"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { embedFor, itemToPlayable } from "@/lib/watch/playable";
import { previewPlaybackSample } from "@/lib/watch/preview-progress";
import { listenToYouTube } from "@/lib/watch/youtube-player";
import { nativeCardPreviewUrl } from "@/lib/watch/card-preview";
import type { WatchItem } from "@/lib/watch/types";
import { TwitchHoverMedia } from "./TwitchHoverMedia";

/** One muted player inside the existing poster. No popup, controls, or iframe clicks. */
export function CardMotionPreview({ item, active, startSeconds = 0 }: { item: WatchItem; active: boolean; startSeconds?: number }) {
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const playable = useMemo(() => itemToPlayable(item), [item]);
  const allowed = active && visible && player.previewAutoplay && !player.dataSaver && !reducedMotion && item.format !== "photo" && !failed;
  const native = nativeCardPreviewUrl(item, playable?.clipSrc);
  const twitch = !native && playable?.platform === "twitch" && (playable.twitchLogin || playable.vodId);
  const src = useMemo(() => {
    if (!allowed || native || twitch || !host || !playable || item.embeddable === false || item.previewStrategy === "external" || item.previewStrategy === "image" || item.platform === "instagram") return null;
    return embedFor(playable, { ...host, muted: true, controls: false, autoplay: true, startSeconds });
  }, [allowed, native, twitch, host, playable, item.embeddable, item.previewStrategy, item.platform, startSeconds]);
  const markPlaying = useCallback((value: boolean) => { playing.current = value; setReady(value); }, []);
  const requestPlayback = useCallback(() => {
    const target = frame.current?.contentWindow;
    if (!target || !src) return;
    const origin = new URL(src).origin;
    if (playable?.youtubeId) {
      listenToYouTube(target, `card-${item.id}`);
      for (const func of ["mute", "playVideo"]) target.postMessage(JSON.stringify({ event: "command", func, args: [] }), origin);
    } else if (playable?.platform === "tiktok") {
      target.postMessage({ "x-tiktok-player": true, type: "mute" }, origin);
      target.postMessage({ "x-tiktok-player": true, type: "play" }, origin);
    }
  }, [src, playable, item.id]);
  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    if (!allowed) return;
    const timeout = window.setTimeout(() => { if (!playing.current) setFailed(true); }, 12_000);
    return () => window.clearTimeout(timeout);
  }, [allowed]);
  useEffect(() => {
    if (!src) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== new URL(src).origin) return;
      const sample = previewPlaybackSample(event.data);
      if (sample?.playing != null) markPlaying(sample.playing);
    };
    window.addEventListener("message", onMessage);
    let attempts = 0;
    const retry = window.setInterval(() => { if (++attempts <= 12 && !playing.current) requestPlayback(); }, 700);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(retry); };
  }, [src, markPlaying, requestPlayback]);
  if (!allowed || (!native && !twitch && !src)) return null;
  return <span className={`watch-card-motion${ready || twitch ? " is-visible" : ""}`} aria-hidden="true" data-preview-state={ready ? "playing" : "loading"}>
    {native ? <video ref={video} src={native} autoPlay muted loop playsInline preload="auto" onLoadedMetadata={(event) => { const media = event.currentTarget; if (startSeconds > 0) media.currentTime = Math.min(startSeconds, Number.isFinite(media.duration) ? Math.max(0, media.duration - .25) : startSeconds); }} onPlaying={() => markPlaying(true)} onError={() => setFailed(true)} onCanPlay={(event) => { event.currentTarget.muted = true; void event.currentTarget.play().catch(() => {}); }} />
      : twitch ? <TwitchHoverMedia channel={playable?.kind === "live" ? playable.twitchLogin : null} video={playable?.vodId ?? null} active={allowed} title={item.title} startSeconds={startSeconds} onPlayingChange={markPlaying} onProgress={() => {}} onSelect={() => {}} />
      : <iframe ref={frame} src={src!} title={`${item.memberLabel} muted preview`} tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture" onLoad={requestPlayback} onError={() => setFailed(true)} />}
  </span>;
}

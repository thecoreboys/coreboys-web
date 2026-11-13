"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { embedFor } from "@/lib/watch/playable";
import { isPreviewPlayerReady, previewPlaybackSample } from "@/lib/watch/preview-progress";
import { listenToYouTube } from "@/lib/watch/youtube-player";
import { resolveHoverPreviewMedia } from "@/lib/watch/card-preview";
import { useInstagramPlayback } from "@/hooks/useInstagramPlayback";
import type { WatchItem } from "@/lib/watch/types";
import { TwitchHoverMedia } from "./TwitchHoverMedia";

/** One muted player inside the existing poster. No popup, controls, or iframe clicks. */
export function CardMotionPreview({ item, active, startSeconds = 0 }: { item: WatchItem; active: boolean; startSeconds?: number }) {
  const player = usePlayer();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const allowed = active && visible && player.previewAutoplay && !player.dataSaver && !reducedMotion && item.format !== "photo";
  const instagramUrl = useInstagramPlayback(item.platform === "instagram" ? item.sourceUrl ?? item.embedUrl : null, allowed && !item.mediaUrl);
  if (!allowed) return null;
  const previewItem = instagramUrl ? { ...item, mediaUrl: instagramUrl, previewStrategy: "video" as const } : item;
  // Leaving/re-entering starts a fresh attempt, even after a provider timeout.
  return <CardMotionSession key={`${item.id}:${item.href}:${previewItem.mediaUrl ?? ""}:${startSeconds}`} item={previewItem} startSeconds={startSeconds} />;
}

function CardMotionSession({ item, startSeconds }: { item: WatchItem; startSeconds: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const { nativeUrl: native, playable } = useMemo(() => resolveHoverPreviewMedia(item), [item]);
  const twitch = !native && playable?.platform === "twitch" && (playable.twitchLogin || playable.vodId);
  const src = useMemo(() => {
    if (failed || native || twitch || !host || !playable) return null;
    return embedFor(playable, { ...host, muted: true, controls: false, autoplay: true, startSeconds });
  }, [failed, native, twitch, host, playable, startSeconds]);
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
  }, []);
  useEffect(() => {
    if (!native && !twitch && !src) return;
    const timeout = window.setTimeout(() => { if (!playing.current) setFailed(true); }, playable?.platform === "tiktok" ? 20_000 : 12_000);
    return () => window.clearTimeout(timeout);
  }, [native, twitch, src, playable?.platform]);
  useEffect(() => {
    if (!src) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== new URL(src).origin) return;
      if (isPreviewPlayerReady(event.data)) { requestPlayback(); return; }
      const sample = previewPlaybackSample(event.data);
      if (sample?.playing != null) markPlaying(sample.playing);
    };
    window.addEventListener("message", onMessage);
    let attempts = 0;
    const retry = window.setInterval(() => { if (++attempts <= 24 && !playing.current) requestPlayback(); }, 700);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(retry); };
  }, [src, markPlaying, requestPlayback]);
  if (failed || (!native && !twitch && !src)) return null;
  return <span className={`watch-card-motion${ready || twitch || src ? " is-visible" : ""}`} aria-hidden="true" data-preview-state={ready ? "playing" : "loading"}>
    {native ? <video ref={video} src={native} autoPlay muted loop playsInline preload="auto" onLoadedMetadata={(event) => { const media = event.currentTarget; if (startSeconds > 0) media.currentTime = Math.min(startSeconds, Number.isFinite(media.duration) ? Math.max(0, media.duration - .25) : startSeconds); }} onPlaying={() => markPlaying(true)} onError={() => setFailed(true)} onCanPlay={(event) => { event.currentTarget.muted = true; void event.currentTarget.play().catch(() => {}); }} />
      : twitch ? <TwitchHoverMedia channel={playable?.kind === "live" ? playable.twitchLogin : null} video={playable?.vodId ?? null} active title={item.title} startSeconds={startSeconds} onPlayingChange={markPlaying} onProgress={() => {}} onSelect={() => {}} />
      : <iframe ref={frame} src={src!} title={`${item.memberLabel} muted preview`} tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture" onLoad={requestPlayback} onError={() => setFailed(true)} />}
  </span>;
}

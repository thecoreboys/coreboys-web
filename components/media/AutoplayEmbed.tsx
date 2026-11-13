"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInstagramPlayback } from "@/hooks/useInstagramPlayback";
import { embedFor, playableFromUrl } from "@/lib/watch/playable";
import { nativeVideoSource, safeMediaUrl } from "@/lib/watch/native-media";
import { isPreviewPlayerReady, previewPlaybackSample } from "@/lib/watch/preview-progress";
import { listenToYouTube } from "@/lib/watch/youtube-player";

/** Inline players share the same muted, inline startup as Watch and Theater. */
export function AutoplayEmbed({ sourceUrl, embedUrl, title, controls = true, loop = false }: {
  sourceUrl: string; embedUrl?: string; title: string; controls?: boolean; loop?: boolean;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const nativeAttempted = useRef<HTMLVideoElement | null>(null);
  const [host, setHost] = useState<{ parent: string; origin: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [playingSource, setPlayingSource] = useState<string | null>(null);
  const [failedNative, setFailedNative] = useState<string | null>(null);
  const playable = useMemo(() => playableFromUrl(sourceUrl) ?? playableFromUrl(embedUrl ?? ""), [embedUrl, sourceUrl]);
  const active = visible && pageVisible;
  const instagramUrl = useInstagramPlayback(playable?.platform === "instagram" ? sourceUrl : null, active);
  const native = (playable && nativeVideoSource(playable)) ?? instagramUrl;
  const nativeUrl = native !== failedNative ? native : null;
  const src = active && host && !nativeUrl
    ? (playable ? embedFor(playable, { ...host, muted: true, autoplay: true, controls, loop }) : safeMediaUrl(embedUrl) ? embedUrl : null)
    : null;

  useEffect(() => {
    setHost({ parent: window.location.hostname, origin: window.location.origin });
    const sync = () => setPageVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: .1 });
    if (slot.current) observer.observe(slot.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);

  useEffect(() => {
    if (!src) return;
    const origin = new URL(src).origin;
    let started = false;
    setPlayingSource(null);
    const requestPlayback = () => {
      const target = frame.current?.contentWindow;
      if (!target || started) return;
      if (playable?.youtubeId) {
        listenToYouTube(target, `inline-${playable.key}`);
        for (const func of ["mute", "playVideo"]) target.postMessage(JSON.stringify({ event: "command", func, args: [] }), origin);
      } else if (playable?.platform === "tiktok") {
        for (const type of ["mute", "play"]) target.postMessage({ "x-tiktok-player": true, type }, origin);
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (isPreviewPlayerReady(event.data)) { requestPlayback(); return; }
      const sample = previewPlaybackSample(event.data);
      if (sample?.playing != null) {
        if (sample.playing) started = true;
        setPlayingSource(sample.playing ? src : null);
      }
    };
    const element = frame.current;
    element?.addEventListener("load", requestPlayback);
    window.addEventListener("message", onMessage);
    requestPlayback();
    let attempts = 0;
    const retry = window.setInterval(() => { if (++attempts <= 24) requestPlayback(); }, 700);
    return () => {
      window.clearInterval(retry);
      element?.removeEventListener("load", requestPlayback);
      window.removeEventListener("message", onMessage);
    };
  }, [playable, src]);

  return <div ref={slot} className="absolute inset-0 h-full w-full" data-playback-state={active && playingSource === (nativeUrl ?? src) ? "playing" : "ready"}>
    {active && nativeUrl ? <video key={nativeUrl} src={nativeUrl} autoPlay muted playsInline controls={controls} loop={loop} className="absolute inset-0 h-full w-full object-contain"
      onPlaying={() => setPlayingSource(nativeUrl)} onPause={() => setPlayingSource(null)}
      onCanPlay={(event) => { const media = event.currentTarget; if (nativeAttempted.current === media) return; nativeAttempted.current = media; void media.play().catch(() => {}); }}
      onError={() => setFailedNative(nativeUrl)} /> : src ? <iframe ref={frame} src={src} title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
        className="absolute inset-0 h-full w-full" referrerPolicy="strict-origin-when-cross-origin" /> : null}
  </div>;
}

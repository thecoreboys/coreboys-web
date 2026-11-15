"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

type AmbientStyle = CSSProperties & {
  "--player-ambient-accent": string;
};

export function PlayerAmbientBloom({
  source,
  accent = "var(--core)",
  frame = false,
  videoRef,
}: {
  source?: string | null;
  accent?: string | null;
  frame?: boolean;
  /** Native media can be sampled; protected provider iframes remain artwork-backed. */
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const bloomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bloom = bloomRef.current;
    if (!bloom || !videoRef) return;
    const canvas = document.createElement("canvas");
    canvas.width = 18;
    canvas.height = 10;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    let disposed = false;
    let blocked = false;
    const sampleFrame = () => {
      if (disposed || blocked || document.visibilityState !== "visible") return;
      const video = videoRef.current;
      if (!video || video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let totalWeight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index] ?? 0;
          const g = pixels[index + 1] ?? 0;
          const b = pixels[index + 2] ?? 0;
          const lightness = (r + g + b) / 3;
          if (lightness < 18 || lightness > 248) continue;
          // Favor colored midtones: they make the glow feel tied to the shot
          // without letting white UI, black bars, or bright subtitles take over.
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          const weight = 0.35 + Math.min(1, saturation / 120) * 0.65;
          red += r * weight;
          green += g * weight;
          blue += b * weight;
          totalWeight += weight;
        }
        if (totalWeight < 1) return;
        const color = `rgb(${Math.round(red / totalWeight)} ${Math.round(green / totalWeight)} ${Math.round(blue / totalWeight)})`;
        bloom.style.setProperty("--player-ambient-frame-color", color);
        bloom.dataset.frameSampled = "true";
      } catch {
        // Cross-origin provider media is intentionally not made CORS-enabled
        // just for lighting; keep the safe poster/accent treatment instead.
        blocked = true;
        bloom.dataset.frameSampled = "unavailable";
      }
    };

    sampleFrame();
    const interval = window.setInterval(sampleFrame, 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      bloom.style.removeProperty("--player-ambient-frame-color");
      delete bloom.dataset.frameSampled;
    };
  }, [videoRef, source]);

  if (!source && !accent) return null;

  return (
    <div
      ref={bloomRef}
      className={`watch-player-ambient ${frame ? "watch-player-ambient--frame" : ""}`.trim()}
      style={{ "--player-ambient-accent": accent || "var(--core)" } as AmbientStyle}
      aria-hidden="true"
    >
      {source ? (
        // Runtime artwork comes from several connected media providers and
        // cannot use the static Next Image allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={source}
          src={source}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="low"
          className="watch-player-ambient__art"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <span className="watch-player-ambient__accent" />
      <span className="watch-player-ambient__veil" />
    </div>
  );
}

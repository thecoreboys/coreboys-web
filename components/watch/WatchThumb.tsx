"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { isTinyYoutubeStub, youtubeThumbCandidates } from "@/lib/watch/thumbs";

function percent(value: number) {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function WatchThumb({
  youtubeId,
  src,
  alt = "",
  className,
  loading = "lazy",
  focalPoint,
  style,
}: {
  youtubeId?: string | null;
  src: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  focalPoint?: { x: number; y: number };
  style?: CSSProperties;
}) {
  const chain = useMemo(() => {
    const fromYt = youtubeId ? youtubeThumbCandidates(youtubeId) : [];
    return [...fromYt, src].filter(Boolean);
  }, [youtubeId, src]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const url = chain[Math.min(index, chain.length - 1)] ?? src;

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [youtubeId, src]);

  if (failed || !url) {
    return (
      <span
        className={className}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        style={{
          ...style,
          display: "block",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--bg-elev, #19191d) 92%, #000), var(--bg, #09090b))",
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      style={{
        ...style,
        ...(focalPoint
          ? { objectPosition: `${percent(focalPoint.x)} ${percent(focalPoint.y)}` }
          : null),
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (isTinyYoutubeStub(img.naturalWidth, img.naturalHeight) && index < chain.length - 1) {
          setIndex((n) => n + 1);
        }
      }}
      onError={() => {
        if (index < chain.length - 1) setIndex((n) => n + 1);
        else setFailed(true);
      }}
    />
  );
}

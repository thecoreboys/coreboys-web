"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { isTinyYoutubeStub, isYoutubePlaceholderPixels, watchThumbCandidates } from "@/lib/watch/thumbs";

// Repeated cards share failed-image knowledge for this browser session.
const failedImages = new Map<string, number>();
function markFailed(url: string) {
  failedImages.set(url, Date.now() + 30_000);
  if (failedImages.size > 500) failedImages.delete(failedImages.keys().next().value!);
}

function percent(value: number) {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function isYoutubePlaceholder(img: HTMLImageElement) {
  if (!img.naturalWidth || !img.naturalHeight) return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return isYoutubePlaceholderPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
  } catch {
    // If the provider changes its CORS policy, keep the thumbnail usable.
    return false;
  }
}

export function WatchThumb({
  youtubeId,
  src,
  alt = "",
  className,
  loading = "lazy",
  focalPoint,
  style,
  fallback,
}: {
  youtubeId?: string | null;
  src: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  focalPoint?: { x: number; y: number };
  style?: CSSProperties;
  fallback?: ReactNode;
}) {
  const chain = useMemo(() => {
    return watchThumbCandidates(src, youtubeId, loading === "eager")
      .filter((url) => (failedImages.get(url) ?? 0) < Date.now());
  }, [youtubeId, src, loading]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const url = chain[index] ?? ((failedImages.get(src) ?? 0) >= Date.now() ? "" : src);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [youtubeId, src]);

  if (failed || !url) {
    if (fallback) return fallback;
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
      crossOrigin={/^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(url) ? "anonymous" : undefined}
      src={url}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={loading === "eager" ? "high" : "low"}
      decoding="async"
      style={{
        ...style,
        ...(focalPoint
          ? { objectPosition: `${percent(focalPoint.x)} ${percent(focalPoint.y)}` }
          : null),
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        const isYoutube = /^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(url);
        const isUnavailableYoutubeImage = isYoutube && (
          isTinyYoutubeStub(img.naturalWidth, img.naturalHeight) || isYoutubePlaceholder(img)
        );
        if (isUnavailableYoutubeImage && index < chain.length - 1) {
          markFailed(url);
          setIndex((n) => n + 1);
        } else if (isUnavailableYoutubeImage) {
          markFailed(url);
          setFailed(true);
        }
      }}
      onError={() => {
        markFailed(url);
        if (index < chain.length - 1) setIndex((n) => n + 1);
        else setFailed(true);
      }}
    />
  );
}

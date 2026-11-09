"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getImageProps } from "next/image";
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

export function WatchThumb(props: Parameters<typeof WatchThumbImage>[0]) {
  // Reset synchronously when a card is reused for a different post or quality.
  // An effect reset allowed the previous post's failed/loaded state to flash.
  return <WatchThumbImage key={JSON.stringify([props.src, props.youtubeId, props.tiktokSourceUrl, props.instagramSourceUrl, props.preferTikTokSource, props.preferInstagramSource, props.loading])} {...props} />;
}

function WatchThumbImage({
  youtubeId,
  src,
  tiktokSourceUrl,
  preferTikTokSource = false,
  instagramSourceUrl,
  preferInstagramSource = false,
  alt = "",
  className,
  loading = "lazy",
  focalPoint,
  style,
  fallback,
  placeholder,
  sizes,
  referrerPolicy,
}: {
  youtubeId?: string | null;
  src: string;
  /** Canonical TikTok post URL used to recover an expired/missing cover via TikTok oEmbed. */
  tiktokSourceUrl?: string;
  /** Put TikTok's own cover ahead of a known generic portrait fallback. */
  preferTikTokSource?: boolean;
  /** Canonical Instagram post/Reel URL used to recover its cover via oEmbed. */
  instagramSourceUrl?: string;
  /** Put Instagram's own cover ahead of a known generic portrait fallback. */
  preferInstagramSource?: boolean;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  focalPoint?: { x: number; y: number };
  style?: CSSProperties;
  fallback?: ReactNode;
  /** Render a designed underlay while a social poster is still downloading. */
  placeholder?: ReactNode;
  /** Compact surfaces can request an image sized for their actual slot. */
  sizes?: string;
  referrerPolicy?: ReferrerPolicy;
}) {
  const chain = useMemo(() => {
    const candidates = watchThumbCandidates(src, youtubeId, loading === "eager");
    if (tiktokSourceUrl) {
      const tiktokCandidate = `/api/watch/tiktok-thumbnail?url=${encodeURIComponent(tiktokSourceUrl)}`;
      if (preferTikTokSource) candidates.unshift(tiktokCandidate);
      else candidates.push(tiktokCandidate);
    }
    if (instagramSourceUrl) {
      const instagramCandidate = `/api/watch/instagram-thumbnail?url=${encodeURIComponent(instagramSourceUrl)}`;
      if (preferInstagramSource) candidates.unshift(instagramCandidate);
      else candidates.push(instagramCandidate);
    }
    return [...new Set(candidates)]
      .filter((url) => (failedImages.get(url) ?? 0) < Date.now());
  }, [youtubeId, src, loading, tiktokSourceUrl, preferTikTokSource, instagramSourceUrl, preferInstagramSource]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const handledSource = useRef("");
  const url = chain[index] ?? ((failedImages.get(src) ?? 0) >= Date.now() ? "" : src);
  const optimize = !useOriginal && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/api/") && !/\.svg(?:\?|$)/i.test(url);
  const responsive = optimize ? getImageProps({ src: url, alt, width: loading === "eager" ? 1280 : 480, height: loading === "eager" ? 720 : 270, sizes: sizes ?? (loading === "eager" ? "100vw" : "(max-width: 640px) 76vw, 336px") }).props : null;

  const handleLoaded = useCallback((img: HTMLImageElement) => {
    const completion = `${index}:${optimize}:${img.currentSrc || url}`;
    if (handledSource.current === completion) return;
    handledSource.current = completion;
    const isYoutube = /^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(url);
    const unavailable = isYoutube && (isTinyYoutubeStub(img.naturalWidth, img.naturalHeight) || isYoutubePlaceholder(img));
    if (unavailable && index < chain.length - 1) {
      markFailed(url);
      setLoaded(false);
      setIndex((n) => n + 1);
    } else if (unavailable) {
      markFailed(url);
      setFailed(true);
    } else {
      setLoaded(true);
    }
  }, [url, index, chain.length, optimize]);
  const handleFailed = useCallback(() => {
    const completion = `${index}:${optimize}:${imageRef.current?.currentSrc || url}`;
    if (handledSource.current === completion) return;
    handledSource.current = completion;
    if (optimize) { setUseOriginal(true); return; }
    markFailed(url);
    setLoaded(false);
    if (index < chain.length - 1) setIndex((n) => n + 1);
    else setFailed(true);
  }, [optimize, url, index, chain.length]);

  useEffect(() => {
    // Cached images can complete before hydration attaches onLoad/onError.
    // Read their actual state once per source instead of leaving them hidden.
    const img = imageRef.current;
    if (!img?.complete || !img.currentSrc) return;
    if (img.naturalWidth > 0) handleLoaded(img);
    else handleFailed();
  }, [handleLoaded, handleFailed]);

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

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      key={url}
      crossOrigin={/^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(url) ? "anonymous" : undefined}
      src={responsive?.src ?? url}
      srcSet={responsive?.srcSet}
      sizes={responsive?.sizes}
      alt={alt}
      className={[className, placeholder ? "watch-thumb-image" : "", placeholder && loaded ? "is-loaded" : ""].filter(Boolean).join(" ")}
      loading={loading}
      fetchPriority={loading === "eager" ? "high" : "low"}
      decoding="async"
      referrerPolicy={referrerPolicy}
      style={{
        ...style,
        ...(focalPoint
          ? { objectPosition: `${percent(focalPoint.x)} ${percent(focalPoint.y)}` }
          : null),
      }}
      onLoad={(event) => handleLoaded(event.currentTarget)}
      onError={handleFailed}
    />
  );

  if (!placeholder) return image;
  return (
    <span className="watch-thumb-shell" style={{ ...style, display: "block", width: "100%", height: "100%" }}>
      {!loaded ? <span className="watch-thumb-placeholder" aria-hidden="true">{placeholder}</span> : null}
      {image}
    </span>
  );
}

"use client";

import { useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import type { Clip } from "@/lib/clips";
import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";

const PLATFORM_LABEL: Record<Clip["source"], string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

/**
 * Click-to-load embed for a single clip. We hold the embed iframe
 * behind a thumbnail + play button so the page doesn't fire 50+
 * cross-origin requests on first paint. Clicking the cover swaps in
 * the platform's official iframe.
 */
export function ClipEmbed({ clip }: { clip: Clip }) {
  const [loaded, setLoaded] = useState(false);
  const brand = PLATFORM_BRAND[clip.source];

  const aspectClass =
    clip.aspect === "vertical" ? "aspect-[9/16]" : "aspect-video";
  return (
    <div className={`relative ${aspectClass} w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black media-tone`}>
      {!loaded ? (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="group absolute inset-0 flex items-center justify-center"
          aria-label={`Play ${clip.title}`}
        >
          {clip.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clip.thumbnailUrl}
              alt={clip.title}
              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `radial-gradient(60% 60% at 50% 50%, ${brand}66, transparent 70%), #08080a`,
              }}
            />
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 60%, rgba(8,8,10,0.85) 100%)",
            }}
          />
          <PlayCircle
            size={64}
            className="absolute text-white opacity-90 transition-transform group-hover:scale-110"
            style={{ filter: `drop-shadow(0 8px 24px ${brand}88)` }}
          />
          {/* Platform watermark — logo only, accent-tinted, in a glass plate. */}
          <span
            className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border bg-[rgba(8,8,10,0.78)] backdrop-blur"
            style={{ borderColor: `${brand}88`, color: brand }}
            title={PLATFORM_LABEL[clip.source]}
          >
            <PlatformLogo platform={clip.source} size={14} />
          </span>
        </button>
      ) : (
        <ClipIframe clip={clip} />
      )}
    </div>
  );
}

function ClipIframe({ clip }: { clip: Clip }) {
  const parent = typeof window !== "undefined" ? window.location.hostname : "thecoreboys.com";
  switch (clip.source) {
    case "twitch":
      return (
        <iframe
          title={clip.title}
          src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip.externalId)}&parent=${parent}&autoplay=true`}
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      );
    case "youtube":
      return (
        <iframe
          title={clip.title}
          src={`https://www.youtube.com/embed/${encodeURIComponent(clip.externalId)}?autoplay=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      );
    case "tiktok":
      return (
        <iframe
          title={clip.title}
          src={`https://www.tiktok.com/embed/v2/${encodeURIComponent(clip.externalId)}`}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      );
    case "instagram":
      return (
        <iframe
          title={clip.title}
          src={`https://www.instagram.com/reel/${encodeURIComponent(clip.externalId)}/embed`}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      );
    default:
      return null;
  }
}

export function ClipPlatformBadge({ source }: { source: Clip["source"] }) {
  const brand = PLATFORM_BRAND[source];
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border"
      style={{ borderColor: `${brand}88`, color: brand, background: `${brand}14` }}
      title={PLATFORM_LABEL[source]}
    >
      <PlatformLogo platform={source} size={12} />
    </span>
  );
}

export function ExternalClipLink({ clip }: { clip: Clip }) {
  return (
    <a
      href={clip.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
    >
      Open <ExternalLink size={11} />
    </a>
  );
}

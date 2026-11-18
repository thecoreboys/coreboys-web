"use client";

import { useState } from "react";
import { LinkExternal01, PlayCircle } from "@untitledui/icons";
import type { Clip } from "@/lib/clips";
import { PlatformLogo, PLATFORM_BRAND } from "@/components/clips/PlatformLogo";
import { AutoplayEmbed } from "@/components/media/AutoplayEmbed";
import { useHoverAutoplay } from "@/hooks/useHoverAutoplay";

const PLATFORM_LABEL: Record<Clip["source"], string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

/** Load a muted preview on hover; clicks open the shared player or inline controls. */
export function ClipEmbed({ clip, onPlay }: { clip: Clip; onPlay?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const preview = useHoverAutoplay();
  const brand = PLATFORM_BRAND[clip.source];

  const aspectClass =
    clip.aspect === "vertical" ? "aspect-[9/16]" : "aspect-video";
  return (
    <div className={`relative ${aspectClass} w-full overflow-hidden rounded-xl bg-black ring-1 ring-inset ring-secondary media-tone`}
      onMouseEnter={() => preview.start(clip.id)} onMouseLeave={preview.stop}
      onFocus={() => preview.start(clip.id)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) preview.stop(); }}>
      {!loaded ? (
        <button
          type="button"
          onClick={() => { preview.stop(); if (onPlay) onPlay(); else setLoaded(true); }}
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
          {preview.activeId !== clip.id ? <PlayCircle
            className="absolute size-16 text-white opacity-90 transition-transform group-hover:scale-110"
            style={{ filter: `drop-shadow(0 8px 24px ${brand}88)` }}
          /> : null}
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
      {!loaded && preview.activeId === clip.id ? <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-hover-preview>
        <ClipIframe clip={clip} preview />
      </div> : null}
    </div>
  );
}

function ClipIframe({ clip, preview = false }: { clip: Clip; preview?: boolean }) {
  const id = encodeURIComponent(clip.externalId);
  const sourceUrl = {
    twitch: `https://clips.twitch.tv/${id}`,
    youtube: `https://www.youtube.com/watch?v=${id}`,
    tiktok: `https://www.tiktok.com/@_/video/${id}`,
    instagram: `https://www.instagram.com/reel/${id}/`,
  }[clip.source];
  return <AutoplayEmbed sourceUrl={sourceUrl} title={clip.title} controls={!preview} loop={preview} />;
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
      className="inline-flex items-center gap-1 text-xs font-medium text-tertiary hover:text-primary"
    >
      Open <LinkExternal01 className="size-3" />
    </a>
  );
}

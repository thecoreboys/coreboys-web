"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Lazy-loading video embed. Renders a thumbnail with a play button until
 * clicked — once played, swaps in the iframe. YouTube uses the standard
 * embed (lite-youtube-embed approach without the extra dependency); the
 * other platforms iframe their canonical embed URL.
 */
export function VideoEmbed({
  platform,
  embedUrl,
  sourceUrl,
  thumbnailUrl,
}: {
  platform: string;
  embedUrl: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
}) {
  const [played, setPlayed] = useState(false);

  // YouTube auto-play on click via &autoplay=1.
  const finalUrl =
    platform === "youtube" && played
      ? embedUrl + (embedUrl.includes("?") ? "&" : "?") + "autoplay=1&rel=0"
      : embedUrl;

  return (
    <figure className="overflow-hidden rounded-[8px] border border-[color:var(--rule)] bg-black">
      {!played && thumbnailUrl ? (
        <button
          type="button"
          onClick={() => setPlayed(true)}
          className="group relative block aspect-video w-full"
          aria-label={`Play ${platform} video`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            loading="lazy"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--core)] text-black shadow-2xl transition-transform group-hover:scale-105">
              <Play size={20} fill="black" />
            </span>
          </span>
          <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white backdrop-blur-sm">
            {platform}
          </span>
        </button>
      ) : (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={finalUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            referrerPolicy="no-referrer-when-downgrade"
            title={`${platform} embed`}
            loading="lazy"
          />
        </div>
      )}
      <figcaption className="sr-only">
        Embedded {platform} video. Source:{" "}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          {sourceUrl}
        </a>
      </figcaption>
    </figure>
  );
}

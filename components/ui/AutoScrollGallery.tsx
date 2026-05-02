"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { PhotoLightbox, type LightboxPerson } from "@/components/media/PhotoLightbox";

export type AutoScrollGalleryProps = {
  /** All gallery image URLs. */
  photos: readonly string[];
  /** Alt text prefix; "{prefix} — gallery" rendered per tile. */
  alt: string;
  /** Per-row scroll speed in seconds (full loop). Lower = faster. */
  speed?: number;
  /** People tagged in every photo this gallery shows — used by the
   *  lightbox sidebar. */
  people?: LightboxPerson[];
};

/**
 * Infinite marquee. If the gallery has enough photos, splits into two
 * rows scrolling opposite directions (row 1 ←, row 2 →). Otherwise
 * collapses to a single-row marquee. Photos retain natural aspect
 * ratio. Hovering pauses; edge gradients fade in/out.
 *
 * The full list is rendered twice per row for a seamless −50% loop.
 */
export function AutoScrollGallery({ photos, alt, speed = 65, people = [] }: AutoScrollGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  const MIN_TILES = 24;
  const cycle = (pool: readonly string[]): string[] => {
    if (pool.length === 0) return [];
    const out: string[] = [];
    let cursor = 0;
    while (out.length < Math.max(MIN_TILES, pool.length)) {
      out.push(pool[cursor % pool.length]!);
      cursor++;
    }
    return out;
  };

  // Two rows when there's enough photos to balance them; otherwise one.
  const useTwoRows = photos.length >= 6;
  const evens = useTwoRows ? photos.filter((_, i) => i % 2 === 0) : photos;
  const odds = useTwoRows ? photos.filter((_, i) => i % 2 === 1) : [];
  const r1Pool = cycle(evens);
  const r2Pool = cycle(odds);
  const r1 = [...r1Pool, ...r1Pool];
  const r2 = [...r2Pool, ...r2Pool];

  if (photos.length === 0) return null;

  return (
    <>
      <div className="relative flex flex-col gap-3 overflow-hidden">
        <Row
          photos={r1}
          alt={alt}
          direction="left"
          speed={speed}
          onOpen={(src) => setLightbox(src)}
        />
        {useTwoRows ? (
          <Row
            photos={r2}
            alt={alt}
            direction="right"
            speed={speed * 1.18}
            onOpen={(src) => setLightbox(src)}
          />
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[color:var(--bg)] to-transparent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[color:var(--bg)] to-transparent"
        />
      </div>

      {lightbox ? (
        <PhotoLightbox
          src={lightbox}
          alt={alt}
          people={people}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

function Row({
  photos,
  alt,
  direction,
  speed,
  onOpen,
}: {
  photos: readonly string[];
  alt: string;
  direction: "left" | "right";
  speed: number;
  onOpen: (src: string) => void;
}) {
  return (
    <ul
      className={`ag-row ${direction === "left" ? "ag-row-left" : "ag-row-right"}`}
      style={{ ["--ag-speed" as string]: `${speed}s` }}
    >
      {photos.map((p, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={`${p}-${i}`} className="shrink-0">
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="group relative block h-[300px] w-auto overflow-hidden rounded-lg border border-[color:var(--rule)] bg-black cursor-pointer"
            aria-label="Open photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p}
              alt={`${alt} — gallery`}
              className="block h-full w-auto object-contain transition group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
            <span className="pointer-events-none absolute inset-x-3 bottom-3 inline-flex items-center justify-end gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-on-image opacity-0 transition group-hover:opacity-100">
              <Maximize2 size={11} /> Expand
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

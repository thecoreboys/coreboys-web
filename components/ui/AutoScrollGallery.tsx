"use client";

import { useState } from "react";
import Image from "@/components/ui/SiteImage";
import { PhotoLightbox, type LightboxPerson } from "@/components/media/PhotoLightbox";

export type AutoScrollGalleryProps = {
  photos: readonly string[];
  alt: string;
  speed?: number;
  people?: LightboxPerson[];
};

/** A manual photo gallery: one image per photo, with more available on request. */
export function AutoScrollGallery({ photos, alt, people = [] }: AutoScrollGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const unique = [...new Set(photos)];
  if (!unique.length) return null;
  return <>
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {unique.slice(0, limit).map((src, index) => <li key={src}><button type="button" onClick={() => setLightbox(src)} className="relative block aspect-[4/5] w-full overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)]" aria-label={`Open ${alt} photo ${index + 1}`}><Image src={src} alt={`${alt} photo ${index + 1}`} fill sizes="(max-width: 767px) 45vw, (max-width: 1023px) 30vw, 23vw" className="object-cover" loading="lazy" /></button></li>)}
    </ul>
    {unique.length > limit ? <button type="button" className="mt-5 min-h-11 rounded-lg border border-[color:var(--rule)] px-5 text-sm font-semibold" onClick={() => setLimit((value) => value + 24)}>Show 24 more photos</button> : null}
    {lightbox ? <PhotoLightbox src={lightbox} alt={alt} people={people} onClose={() => setLightbox(null)} /> : null}
  </>;
}

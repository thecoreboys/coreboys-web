/** Highest-quality YouTube stills first. maxres/sd 404 as a 120×90 stub. */
export function youtubeThumbCandidates(id: string, quality: "card" | "hero" = "hero"): string[] {
  if (quality === "card") return [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  ];
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

export function watchThumbCandidates(src: string, youtubeId?: string | null, eager = false): string[] {
  const id = youtubeId || /^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\/vi(?:_webp)?\/([^/]+)/.exec(src)?.[1];
  const candidates = id ? youtubeThumbCandidates(id, eager ? "hero" : "card") : [];
  // Keep curated artwork ahead of generated YouTube stills. The latter are
  // sized for the use case so a rail never probes missing maxres/sd images.
  const custom = src && !/^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(src);
  // A failed provider image should collapse to the card's quiet artwork
  // state, not turn into the same generic CORE thumbnail on every TikTok,
  // Instagram, or X item. YouTube retains its own known-good candidate chain.
  return [...new Set([...(custom ? [src] : []), ...candidates, src].filter(Boolean))];
}

/** Silent looping hover clip YouTube serves on its own site. No embed, no Error 153. */
export function youtubePreviewSources(id: string): string[] {
  return [
    `https://i.ytimg.com/an_webp/${id}/maxresdefault_6s.webp`,
    `https://i.ytimg.com/an_webp/${id}/mqdefault_6s.webp`,
  ];
}

export function isTinyYoutubeStub(width: number, height: number): boolean {
  return width > 0 && width <= 120 && height > 0 && height <= 90;
}

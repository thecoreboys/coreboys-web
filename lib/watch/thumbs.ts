/** Highest-quality YouTube stills first. maxres/sd 404 as a 120×90 stub. */
export function youtubeThumbCandidates(id: string): string[] {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
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

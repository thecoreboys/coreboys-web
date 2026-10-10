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

/**
 * YouTube sometimes answers missing thumbnail URLs with a normal-sized gray
 * image containing its generic video glyph. Dimensions alone cannot separate
 * that image from a real 4:3 poster, so inspect a small, downscaled pixel map.
 */
export function isYoutubePlaceholderPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): boolean {
  if (width < 8 || height < 8 || pixels.length < width * height * 4) return false;

  const luminance = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const saturation = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    return Math.max(red, green, blue) - Math.min(red, green, blue);
  };

  let borderLuminance = 0;
  let borderSquared = 0;
  let borderSaturation = 0;
  let borderCount = 0;
  let centerDark = 0;
  let centerBright = 0;
  let centerCount = 0;
  let centerContrast = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const light = luminance(x, y);
      const sat = saturation(x, y);
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      if (nx < 0.16 || nx > 0.84 || ny < 0.14 || ny > 0.86) {
        borderLuminance += light;
        borderSquared += light * light;
        borderSaturation += sat;
        borderCount += 1;
      }
      if (nx > 0.24 && nx < 0.76 && ny > 0.24 && ny < 0.76) {
        centerCount += 1;
        if (light < 135) centerDark += 1;
        if (light > 205) centerBright += 1;
        if (light < 135 || light > 205) centerContrast += 1;
      }
    }
  }

  if (!borderCount || !centerCount) return false;
  const borderMean = borderLuminance / borderCount;
  const borderVariance = Math.max(0, borderSquared / borderCount - borderMean ** 2);
  return borderMean > 165 &&
    Math.sqrt(borderVariance) < 24 &&
    borderSaturation / borderCount < 14 &&
    centerDark / centerCount > 0.12 &&
    centerBright / centerCount > 0.015 &&
    centerContrast / centerCount > 0.2;
}

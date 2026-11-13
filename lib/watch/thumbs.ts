/** Resolve a real TikTok post permalink, including links stored inside player URLs. */
export function tiktokPostThumbnailSource(item: { platform: string; sourceUrl?: string | null; href?: string | null }): string | undefined {
  if (item.platform !== "tiktok") return undefined;
  const candidates = [item.sourceUrl, item.href];
  try {
    const url = new URL(item.href ?? "", "https://core.local");
    candidates.push(url.searchParams.get("url"));
  } catch { /* Ignore malformed stored player links. */ }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || url.username || url.password || !["tiktok.com", "www.tiktok.com"].includes(url.hostname.toLowerCase())) continue;
      const match = /^\/@([a-zA-Z0-9._]{1,50})\/video\/(\d{12,24})\/?$/.exec(url.pathname);
      if (match) return `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
    } catch { /* Try the next stored source. */ }
  }
  return undefined;
}

/**
 * Instagram's CDN serves photos at full camera resolution (often 3000px+ and
 * several MB). These hosts are allowed in next.config's remotePatterns so the
 * image optimizer can resize them to the card instead.
 */
export function isInstagramCdnImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:"
      && (host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") || host === "fbcdn.net" || host.endsWith(".fbcdn.net"));
  } catch {
    return false;
  }
}

/**
 * Instagram CDN links are signed and carry their expiry as a hex Unix time in
 * `oe`. Past it the CDN answers 403, so a known-dead link is skipped instead
 * of costing a failed optimizer request and a failed original request.
 */
export function isExpiredInstagramCdnImage(url: string, now = Date.now()): boolean {
  if (!isInstagramCdnImage(url)) return false;
  const hex = new URL(url).searchParams.get("oe");
  if (!hex || !/^[\da-f]{8,12}$/i.test(hex)) return false;
  return Number.parseInt(hex, 16) * 1_000 <= now;
}

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

/**
 * WatchThumb props for a compact card, using the same source preference as
 * PosterCard: provider covers win over placeholder or member-portrait posters.
 */
export function cardThumbSource(
  item: { platform: string; poster?: string; sourceUrl?: string | null; href?: string | null },
  memberPortrait: string | undefined,
  youtubeId: string | null,
) {
  const generic = !item.poster || item.poster === memberPortrait || item.poster === "/embed-preview.png";
  const tiktokSourceUrl = tiktokPostThumbnailSource(item);
  const preferTikTokSource = Boolean(tiktokSourceUrl) && (generic || /\.hei[cf](?:[?#]|$)/i.test(item.poster ?? ""));
  const instagramSourceUrl = item.platform === "instagram" && item.sourceUrl ? item.sourceUrl : undefined;
  const preferInstagramSource = Boolean(instagramSourceUrl) && generic;
  const preferYouTube = item.platform === "youtube" && Boolean(youtubeId) && generic;
  return {
    youtubeId,
    src: preferYouTube || preferTikTokSource || preferInstagramSource ? "" : item.poster ?? "",
    tiktokSourceUrl,
    preferTikTokSource,
    instagramSourceUrl,
    preferInstagramSource,
  };
}

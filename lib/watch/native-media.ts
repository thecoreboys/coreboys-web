type NativeMediaItem = {
  format?: string;
  previewStrategy?: string;
  mediaUrl?: string | null;
  sourceUrl?: string | null;
  embedUrl?: string | null;
  href?: string | null;
  url?: string | null;
};

export function safeMediaUrl(value?: string | null): value is string {
  if (!value || value.includes("\\")) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

/** Signed/opaque URLs need explicit video metadata; permalinks are never video files. */
export function nativeVideoSource(item: NativeMediaItem, clipSrc?: string | null): string | null {
  if (item.format === "photo") return null;
  if (item.previewStrategy === "video" && safeMediaUrl(item.mediaUrl)) return item.mediaUrl;
  let linkedMedia: string | null = null;
  if (item.href) {
    try {
      const href = new URL(item.href, "https://core.local");
      linkedMedia = href.searchParams.get("media") ?? href.searchParams.get("url");
    } catch { /* Invalid legacy links have no native source. */ }
  }
  return [clipSrc, item.mediaUrl, item.url, linkedMedia, item.sourceUrl, item.embedUrl, item.href]
    .find((value): value is string => safeMediaUrl(value) && /\.(?:mp4|webm)$/i.test(new URL(value, "https://core.local").pathname)) ?? null;
}

/** Retry only a browser autoplay rejection, preserving network/codec failures. */
export async function playWithMutedFallback(
  media: Pick<HTMLMediaElement, "play" | "muted">,
  stillActive: () => boolean = () => true,
): Promise<void> {
  try { await media.play(); }
  catch (error) {
    if (!stillActive() || media.muted || !(error instanceof Error) || error.name !== "NotAllowedError") throw error;
    media.muted = true;
    await media.play();
  }
}

import { itemToPlayable, playableFromUrl, type Playable } from "./playable";
import type { WatchItem } from "./types";
import { nativeVideoSource } from "./native-media";

/** Provider names in legacy `src` parameters are not native video URLs. */
export const nativeCardPreviewUrl = nativeVideoSource;
/** Only use supplied media or a matching catalog cross-post; never scrape a provider. */
export function resolveHoverPreviewMedia(item: WatchItem): { nativeUrl: string | null; playable: Playable | null; platform: WatchItem["platform"] | null } {
  if (item.format === "photo") return { nativeUrl: null, playable: null, platform: null };
  const original = itemToPlayable(item);
  const nativeUrl = nativeCardPreviewUrl(item, original?.clipSrc);
  if (nativeUrl) return { nativeUrl, playable: original, platform: item.platform };
  const supportsMotion = (playable: Playable | null): playable is Playable => Boolean(playable && ["youtube", "twitch", "tiktok"].includes(playable.platform));
  if (item.embeddable !== false && item.previewStrategy !== "external" && item.previewStrategy !== "image" && supportsMotion(original)) {
    return { nativeUrl: null, playable: original, platform: original.platform };
  }
  for (const source of item.alternateSources ?? []) {
    const playable = playableFromUrl(source.href);
    if (supportsMotion(playable)) return { nativeUrl: null, playable, platform: playable.platform };
  }
  return { nativeUrl: null, playable: null, platform: null };
}


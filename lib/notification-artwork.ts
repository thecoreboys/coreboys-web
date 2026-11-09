import { notificationProviderForUrl, type NotificationProvider } from "./notification-target";
import { playableFromUrl, youtubeIdFromHref } from "./watch/playable";

export function notificationArtworkSource(input: { href: string; imageUrl?: string | null; avatarUrl?: string | null; provider?: NotificationProvider; orientation?: "landscape" | "portrait" | "square" | null }) {
  const playable = playableFromUrl(input.href);
  const provider = input.provider ?? playable?.platform ?? notificationProviderForUrl(input.href);
  const source = playable?.sourceUrl || playable?.url || input.href;
  const sourceProvider = notificationProviderForUrl(source);
  const orientation = input.orientation ?? playable?.orientation ?? (provider === "tiktok" || /instagram\.com\/reels?\//i.test(source) ? "portrait" : "landscape");
  // An avatar is an identity fallback, never a replacement content thumbnail.
  const src = input.imageUrl && input.imageUrl !== input.avatarUrl ? input.imageUrl : "";
  return {
    provider,
    orientation,
    src,
    youtubeId: provider === "youtube" ? youtubeIdFromHref(input.href) : null,
    tiktokSourceUrl: provider === "tiktok" && sourceProvider === "tiktok" ? source : undefined,
    instagramSourceUrl: provider === "instagram" && sourceProvider === "instagram" ? source : undefined,
  };
}

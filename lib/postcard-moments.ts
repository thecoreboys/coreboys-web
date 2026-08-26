import "server-only";

import { createHash } from "node:crypto";
import { getWatchCatalog } from "@/lib/watch/catalog";
import type { WatchItem } from "@/lib/watch/types";

export type AuthorizedPostcardMoment = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string | null;
  platform: "instagram" | "twitch" | "youtube" | "core";
  attribution: string;
  memberSlug: string | null;
};

function momentId(item: WatchItem): string {
  const digest = createHash("sha256")
    .update(`${item.platform}:${item.id}:${item.poster}`)
    .digest("hex")
    .slice(0, 24);
  return `moment-${digest}`;
}

function platformFor(item: WatchItem): AuthorizedPostcardMoment["platform"] | null {
  if (item.platform === "instagram" || item.platform === "twitch" || item.platform === "youtube") {
    return item.platform;
  }
  if (item.platform === "house") return "core";
  return null;
}

function safeImageUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Server-owned media allowlist for the postcard moment picker. The client gets
 * opaque IDs and previews; checkout must resolve the ID through this function
 * again rather than trusting the submitted image/source URLs.
 */
export async function getAuthorizedPostcardMoments(): Promise<AuthorizedPostcardMoment[]> {
  const catalog = await getWatchCatalog();
  const candidates = [
    ...catalog.photos,
    ...catalog.clips,
    ...catalog.live,
    ...catalog.videos,
    ...catalog.broadcasts,
  ];
  const seen = new Set<string>();
  const moments: AuthorizedPostcardMoment[] = [];
  for (const item of candidates) {
    const platform = platformFor(item);
    if (!platform || !item.poster || !safeImageUrl(item.poster)) continue;
    const id = momentId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    moments.push({
      id,
      title: item.title.slice(0, 160),
      imageUrl: item.poster,
      sourceUrl: item.sourceUrl && safeImageUrl(item.sourceUrl) ? item.sourceUrl : null,
      platform,
      attribution: (item.accountLabel ?? item.memberLabel ?? "CORE").slice(0, 160),
      memberSlug: item.memberSlug,
    });
    if (moments.length >= 60) break;
  }
  return moments;
}

export async function resolveAuthorizedPostcardMoment(id: string): Promise<AuthorizedPostcardMoment | null> {
  if (!/^moment-[0-9a-f]{24}$/.test(id)) return null;
  const moments = await getAuthorizedPostcardMoments();
  return moments.find((moment) => moment.id === id) ?? null;
}

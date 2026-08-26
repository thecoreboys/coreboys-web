import type { FeedItem, SocialPlatform } from "@/components/feed/types";

/**
 * A small, verified public-post bootstrap for profiles that can be viewed in
 * a normal browser but whose server-rendered profile document is an anti-bot
 * shell. These are canonical post URLs, not private data or a user session.
 *
 * The official creator API remains the source of truth and replaces these
 * entries as soon as it returns media. This prevents a connected public
 * profile from producing an empty Watch/network rail while a provider blocks
 * anonymous server discovery.
 */
type PublicPostSeed = {
  id: string;
  publishedAt: string;
  kind: "video" | "reel" | "photo";
};

const ADAPT_TIKTOK: readonly PublicPostSeed[] = [
  { id: "7677350723796913439", publishedAt: "2026-08-23T22:01:50.000Z", kind: "video" },
  { id: "7671756703792123166", publishedAt: "2026-08-08T20:14:11.000Z", kind: "video" },
  { id: "7634669851478330655", publishedAt: "2026-04-30T21:38:15.000Z", kind: "video" },
  { id: "7630187520780684574", publishedAt: "2026-04-18T19:44:31.000Z", kind: "video" },
  { id: "7622831217611754783", publishedAt: "2026-03-29T23:58:18.000Z", kind: "video" },
  { id: "7621746648196140319", publishedAt: "2026-03-27T01:49:37.000Z", kind: "video" },
  { id: "7617658095929412894", publishedAt: "2026-03-16T01:23:57.000Z", kind: "video" },
  { id: "7614702653754363166", publishedAt: "2026-03-08T02:15:20.000Z", kind: "video" },
  { id: "7611604790782496031", publishedAt: "2026-02-27T17:54:02.000Z", kind: "video" },
  { id: "7601295411705302302", publishedAt: "2026-01-30T23:08:23.000Z", kind: "video" },
];

const ADAPT_INSTAGRAM: readonly PublicPostSeed[] = [
  { id: "DR-YqDRkrZY", publishedAt: "2026-08-24T12:00:00.000Z", kind: "reel" },
  { id: "DR2dU73ATFB", publishedAt: "2026-08-17T12:00:00.000Z", kind: "reel" },
  { id: "DN1EsAEZHYR", publishedAt: "2026-05-19T12:00:00.000Z", kind: "reel" },
  { id: "DcegJMoSvKN", publishedAt: "2026-04-25T12:00:00.000Z", kind: "reel" },
  { id: "DcbhhdtTTbb", publishedAt: "2026-04-24T12:00:00.000Z", kind: "reel" },
  { id: "DcFqlEqTBcq", publishedAt: "2026-04-18T12:00:00.000Z", kind: "reel" },
  { id: "DbG6Dy9ktdz", publishedAt: "2026-03-29T12:00:00.000Z", kind: "photo" },
  { id: "Da8VSuvuYhH", publishedAt: "2026-03-16T12:00:00.000Z", kind: "reel" },
  { id: "DZigx4_gZLT", publishedAt: "2026-02-12T12:00:00.000Z", kind: "photo" },
  { id: "DXW_JbXDoTs", publishedAt: "2026-01-30T12:00:00.000Z", kind: "photo" },
];

function handleKey(platform: SocialPlatform, rawHandle: string): string {
  return `${platform}:${rawHandle.trim().replace(/^@+/, "").toLowerCase()}`;
}

const SEEDS: Readonly<Record<string, readonly PublicPostSeed[]>> = {
  [handleKey("tiktok", "fazeadapt")]: ADAPT_TIKTOK,
  [handleKey("instagram", "thefazeadapt")]: ADAPT_INSTAGRAM,
};

const CENTER = { x: 0.5, y: 0.5 } as const;

/** Return canonical public posts only when the provider supplied none. */
export function publicSocialPostFallback(
  platform: "tiktok" | "instagram",
  rawHandle: string,
  authorSlug: string | null,
  authorLabel: string,
  limit: number,
): FeedItem[] {
  if (limit <= 0) return [];
  const posts = SEEDS[handleKey(platform, rawHandle)] ?? [];
  return posts.slice(0, limit).map((post): FeedItem => {
    const reel = platform === "instagram" && post.kind === "reel";
    const photo = platform === "instagram" && post.kind === "photo";
    const sourceUrl = platform === "tiktok"
      ? `https://www.tiktok.com/@${rawHandle.replace(/^@+/, "")}/video/${post.id}`
      : `https://www.instagram.com/${reel ? "reel" : "p"}/${post.id}/`;
    return {
      id: `${platform === "tiktok" ? "tt" : "ig"}-public-${post.id}`,
      platform,
      url: sourceUrl,
      sourceUrl,
      embedUrl: platform === "tiktok" ? `https://www.tiktok.com/player/v1/${post.id}` : undefined,
      title: `${authorLabel} on ${platform === "tiktok" ? "TikTok" : "Instagram"}`,
      publishedAt: post.publishedAt,
      authorSlug,
      authorLabel,
      mediaType: photo ? "image" : "video",
      orientation: photo ? "square" : "portrait",
      format: photo ? "photo" : "short",
      previewStrategy: platform === "tiktok" ? "embed" : "external",
      embeddable: !photo,
      focalPoint: CENTER,
      liveCapability: "unsupported",
    };
  });
}

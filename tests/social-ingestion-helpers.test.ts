import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FeedItem } from "../components/feed/types";
import {
  collectTikTokCursorPages,
  isInstagramFieldSelectionError,
} from "../lib/social-ingestion-helpers";
import {
  applyYouTubeMetadataToFeedItems,
  isLikelyYouTubeShort,
  youtubeVideoIdForFeedItem,
} from "../lib/youtube-classification";

test("TikTok cursor collection fills a window beyond the 20-video page cap", async () => {
  const calls: Array<{ cursor: string | number | undefined; pageSize: number }> = [];
  const first = Array.from({ length: 20 }, (_, index) => ({ id: String(index + 1) }));
  const second = [
    { id: "19" },
    { id: "20" },
    { id: "21" },
    { id: "22" },
    { id: "23" },
    { id: "24" },
    { id: "25" },
  ];

  const result = await collectTikTokCursorPages(24, async (cursor, pageSize) => {
    calls.push({ cursor, pageSize });
    return cursor == null
      ? { items: first, cursor: 1_000, hasMore: true }
      : { items: second, cursor: 900, hasMore: true };
  });

  assert.deepEqual(calls, [
    { cursor: undefined, pageSize: 20 },
    { cursor: 1_000, pageSize: 4 },
  ]);
  assert.equal(result.pages, 2);
  assert.deepEqual(result.items.map((item) => item.id), Array.from({ length: 24 }, (_, index) => String(index + 1)));
});

test("TikTok cursor collection stops loops and preserves a usable partial page", async () => {
  let calls = 0;
  const looped = await collectTikTokCursorPages(10, async () => {
    calls += 1;
    return { items: [{ id: String(calls) }], cursor: "same", hasMore: true };
  });
  assert.equal(calls, 2);
  assert.deepEqual(looped.items.map((item) => item.id), ["1", "2"]);

  const partial = await collectTikTokCursorPages(10, async (cursor) => {
    if (cursor != null) throw new Error("rate limited");
    return { items: [{ id: "newest" }], cursor: 123, hasMore: true };
  });
  assert.deepEqual(partial.items, [{ id: "newest" }]);
  assert.equal(partial.pages, 1);
  assert.match(String(partial.error), /rate limited/);
});

test("Instagram retries only Graph field-selection failures", () => {
  assert.equal(isInstagramFieldSelectionError(400, {
    error: { code: 100, message: "Tried accessing nonexisting field (permalink) on node type (Media)" },
  }), true);
  assert.equal(isInstagramFieldSelectionError(400, {
    error: { code: 190, message: "Invalid OAuth access token" },
  }), false);
  assert.equal(isInstagramFieldSelectionError(429, {
    error: { code: 100, message: "Unsupported field children" },
  }), false);
});

test("YouTube notification classification uses duration with a labelled three-minute fallback", () => {
  assert.equal(isLikelyYouTubeShort({ durationSeconds: 59, title: "ordinary upload" }), true);
  assert.equal(isLikelyYouTubeShort({ durationSeconds: 150, title: "vertical #Shorts" }), true);
  assert.equal(isLikelyYouTubeShort({ durationSeconds: 150, description: "made for #Shorts" }), true);
  assert.equal(isLikelyYouTubeShort({ durationSeconds: 150, title: "ordinary upload" }), false);
  assert.equal(isLikelyYouTubeShort({ durationSeconds: 181, title: "#Shorts" }), false);
  assert.equal(isLikelyYouTubeShort({ title: "new #short" }), true);
});

test("YouTube reconciliation metadata corrects an RSS video guess before event normalization", () => {
  const rssItem: FeedItem = {
    id: "yt-abc123def45",
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=abc123def45",
    sourceUrl: "https://www.youtube.com/watch?v=abc123def45",
    title: "An unlabelled vertical upload",
    publishedAt: "2026-08-28T12:00:00.000Z",
    authorSlug: "creator",
    authorLabel: "Creator",
    mediaType: "video",
    format: "long",
    orientation: "landscape",
  };
  assert.equal(youtubeVideoIdForFeedItem(rssItem), "abc123def45");
  const [enriched] = applyYouTubeMetadataToFeedItems([rssItem], {
    abc123def45: {
      duration: "0:42",
      durationSeconds: 42,
      isShort: true,
      liveBroadcastContent: "none",
    },
  });
  assert.equal(enriched?.canonicalProviderId, "abc123def45");
  assert.equal(enriched?.format, "short");
  assert.equal(enriched?.orientation, "portrait");
  assert.equal(enriched?.sourceUrl, "https://www.youtube.com/shorts/abc123def45");
  assert.equal(enriched?.durationSeconds, 42);
});

test("provider feed invalidation reaches inner caches and webhook metadata reads are fresh", () => {
  const feed = readFileSync(resolve(process.cwd(), "lib/social-feed.ts"), "utf8");
  const youtubeWebhook = readFileSync(
    resolve(process.cwd(), "app/api/social/webhooks/youtube/route.ts"),
    "utf8",
  );
  const reconcile = readFileSync(
    resolve(process.cwd(), "app/api/social/reconcile/route.ts"),
    "utf8",
  );
  const cacheOptions = [...feed.matchAll(/next:\s*\{\s*revalidate:\s*[^,}]+,\s*tags:\s*\[SOCIAL_FEED_CACHE_TAG\]\s*\}/g)];

  assert.equal(cacheOptions.length, 5);
  assert.match(feed, /minimalChildrenFields = `\$\{baseFields\},children\{id,media_type,media_url,thumbnail_url\}`/);
  assert.match(feed, /isInstagramFieldSelectionError/);
  const publicTikTokEntry = feed.slice(
    feed.indexOf("export async function fetchTikTokFeed("),
    feed.indexOf("export async function fetchSocialFetchTikTokFeed("),
  );
  assert.match(publicTikTokEntry, /options\.publicFallback/);
  assert.match(publicTikTokEntry, /fetchSocialFetchTikTokFeed/);
  assert.doesNotMatch(publicTikTokEntry, /fetchPublicTikTokProfileFeed/);
  assert.match(youtubeWebhook, /fetchYouTubeMetadata\([\s\S]{0,180}\{ fresh: true \}/);
  assert.match(youtubeWebhook, /metadata\?\.isShort \?\? isLikelyYouTubeShort/);
  assert.match(reconcile, /fetchYouTubeMetadata\(videoIds, titles, \{ fresh: true \}\)/);
  assert.ok(
    reconcile.indexOf("const normalizedEvents = await enrichFreshYouTubeItems")
      < reconcile.indexOf("for (const item of normalizedEvents)"),
  );
});

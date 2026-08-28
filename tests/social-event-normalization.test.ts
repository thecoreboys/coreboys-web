import assert from "node:assert/strict";
import test from "node:test";
import type { FeedItem } from "../components/feed/types";
import {
  canonicalSocialEventId,
  DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS,
  isFreshSocialEvent,
  socialContentTypeForFeedItem,
  socialNotificationMaxAgeMs,
} from "../lib/social-event-normalization";

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "yt-video-123",
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=video-123",
    sourceUrl: "https://www.youtube.com/watch?v=video-123",
    title: "A new upload",
    publishedAt: "2026-08-28T12:00:00.000Z",
    authorSlug: "creator",
    authorLabel: "Creator",
    ...overrides,
  };
}

test("YouTube polling and WebSub use the same durable event identity", () => {
  const fromRss = canonicalSocialEventId(feedItem());
  assert.equal(fromRss, "youtube:video-123");
  assert.equal(fromRss, `youtube:${new URL(feedItem().url).searchParams.get("v")}`);

  const short = canonicalSocialEventId(feedItem({
    id: "yt-short-456",
    url: "https://www.youtube.com/shorts/short-456",
    sourceUrl: "https://www.youtube.com/shorts/short-456",
    format: "short",
  }));
  assert.equal(short, "youtube:short-456");
});

test("one X status stays one post even when rendered as multiple media cards", () => {
  const first = feedItem({
    id: "x-123456789-photo-a",
    platform: "x",
    url: "https://x.com/core/status/123456789/photo/1",
    sourceUrl: "https://x.com/core/status/123456789/photo/1",
    mediaType: "image",
    format: "photo",
  });
  const second = { ...first, id: "x-123456789-photo-b", sourceUrl: "https://x.com/core/status/123456789/photo/2" };
  assert.equal(canonicalSocialEventId(first), "x:123456789");
  assert.equal(canonicalSocialEventId(second), "x:123456789");
  assert.equal(socialContentTypeForFeedItem(first), "post");
});

test("TikTok and Instagram feed prefixes do not leak into canonical ids", () => {
  assert.equal(canonicalSocialEventId(feedItem({
    id: "tt-987654",
    platform: "tiktok",
    url: "https://www.tiktok.com/@creator/video/987654",
    sourceUrl: "https://www.tiktok.com/@creator/video/987654",
    format: "short",
  })), "tiktok:987654");
  assert.equal(canonicalSocialEventId(feedItem({
    id: "ig-media-42",
    platform: "instagram",
    url: "https://www.instagram.com/reel/example/",
    sourceUrl: "https://www.instagram.com/reel/example/",
    format: "short",
  })), "instagram:media-42");
});

test("Instagram carousel cards share the parent post event identity", () => {
  const first = feedItem({
    id: "ig-child-1",
    canonicalProviderId: "parent-42",
    platform: "instagram",
    url: "https://www.instagram.com/p/carousel/",
    sourceUrl: "https://www.instagram.com/p/carousel/?img_index=1",
    format: "photo",
  });
  const second = {
    ...first,
    id: "ig-child-2",
    sourceUrl: "https://www.instagram.com/p/carousel/?img_index=2",
  };
  assert.equal(canonicalSocialEventId(first), "instagram:parent-42");
  assert.equal(canonicalSocialEventId(second), "instagram:parent-42");
});

test("TikTok API ids remain canonical when a share URL is rewritten", () => {
  assert.equal(canonicalSocialEventId(feedItem({
    id: "tt-987654",
    canonicalProviderId: "987654",
    platform: "tiktok",
    url: "https://www.tiktok.com/@creator/video/rewritten-id",
    sourceUrl: "https://www.tiktok.com/@creator/video/rewritten-id",
    format: "short",
  })), "tiktok:987654");
});

test("notification freshness accepts current posts but rejects reconciliation backfill", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1_000;
  assert.equal(isFreshSocialEvent("2026-08-28T11:55:00.000Z", now, day), true);
  assert.equal(isFreshSocialEvent("2026-08-27T11:59:59.999Z", now, day), false);
  assert.equal(isFreshSocialEvent("2026-08-28T12:04:00.000Z", now, day), true);
  assert.equal(isFreshSocialEvent("2026-08-29T12:00:00.000Z", now, day), false);
  assert.equal(isFreshSocialEvent("not-a-date", now, day), false);
  assert.equal(DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS, 3 * 60 * 60 * 1_000);
  assert.equal(socialNotificationMaxAgeMs("2.5"), 2.5 * 60 * 60 * 1_000);
  assert.equal(socialNotificationMaxAgeMs("invalid"), DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS);
  assert.equal(socialNotificationMaxAgeMs(999), 7 * 24 * 60 * 60 * 1_000);
});

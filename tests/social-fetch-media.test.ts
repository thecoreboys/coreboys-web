import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  fetchSocialFetchInstagramPosts,
  fetchSocialFetchInstagramReels,
  fetchSocialFetchTikTokVideos,
  setSocialFetchBudgetAdapterForTests,
  SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS,
  SOCIAL_FETCH_REELS_REVALIDATE_SECONDS,
} from "../lib/social-fetch-media";

let reservationSequence = 0;
setSocialFetchBudgetAdapterForTests({
  reserve: async () => ({
    ok: true,
    reservationId: `test-reservation-${++reservationSequence}`,
    reservedCredits: 1,
    monthCreditsAfterReservation: reservationSequence,
    monthlyCreditCap: 10_000,
  }),
  settle: async () => undefined,
});

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("paid public media polling keeps every surface on the two-hour budget window", () => {
  assert.equal(SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS, 2 * 60 * 60);
  assert.equal(SOCIAL_FETCH_REELS_REVALIDATE_SECONDS, 2 * 60 * 60);
});

test("TikTok public media is cached, coalesced, and normalized to provider URLs", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  const requests: Array<{ url: string; init?: NextFetchInit }> = [];
  globalThis.fetch = (async (input, init?: NextFetchInit) => {
    requests.push({ url: String(input), init });
    return Response.json({
      data: {
        videos: [{
          id: "7610123456789012345",
          caption: "Latest CORE clip",
          createdAt: "2026-08-28T10:00:00Z",
          url: "https://untrusted.example/video.mp4",
          thumbnailUrl: "https://cdn.example/cover.webp",
          durationMs: 12_500,
          media: { video: { width: 1080, height: 1920, url: "https://cdn.example/temporary.mp4" } },
        }],
      },
    });
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      fetchSocialFetchTikTokVideos("@OfficialCoreBoys", 12),
      fetchSocialFetchTikTokVideos("officialcoreboys", 12),
    ]);

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]?.url,
      "https://api.socialfetch.dev/v1/tiktok/profiles/officialcoreboys/videos",
    );
    assert.equal(new Headers(requests[0]?.init?.headers).get("x-api-key"), "test-social-fetch-key");
    assert.equal(
      requests[0]?.init?.next?.revalidate,
      SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS,
    );
    assert.deepEqual(second, first);
    assert.deepEqual(first, {
      status: "ok",
      lookupStatus: null,
      items: [{
        id: "7610123456789012345",
        caption: "Latest CORE clip",
        createdAt: "2026-08-28T10:00:00.000Z",
        sourceUrl: "https://www.tiktok.com/@officialcoreboys/video/7610123456789012345",
        thumbnailUrl: "https://cdn.example/cover.webp",
        durationSeconds: 12.5,
        dimensions: { width: 1080, height: 1920 },
      }],
    });
    assert.equal("mediaUrl" in first.items[0]!, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("Instagram photos and Reels retain media shape but only expose official embeds", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  const requests: Array<{ url: string; init?: NextFetchInit }> = [];
  globalThis.fetch = (async (input, init?: NextFetchInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/posts")) {
      return Response.json({
        data: {
          lookupStatus: "found",
          posts: [{
            id: "18001234567890123",
            shortcode: "CorePhoto1",
            mediaType: "sidecar",
            caption: "Photo carousel",
            createdAt: "2026-08-27T09:30:00Z",
            url: "https://www.instagram.com/p/CorePhoto1/?utm_source=test",
            displayUrl: "https://cdninstagram.example/photo.jpg",
            videoUrl: "https://cdninstagram.example/temporary.mp4",
            dimensions: { width: 1440, height: 1080 },
          }],
        },
      });
    }
    return Response.json({
      data: {
        lookupStatus: "found",
        reels: [{
          id: "18009876543210987",
          shortcode: "CoreReel1",
          mediaType: "video",
          caption: null,
          createdAt: "2026-08-28T11:45:00Z",
          url: "https://www.instagram.com/reel/CoreReel1/",
          thumbnailUrl: "https://cdninstagram.example/reel.jpg",
          videoUrl: "https://cdninstagram.example/temporary-reel.mp4",
          dimensions: { width: 1080, height: 1920 },
        }],
      },
    });
  }) as typeof fetch;

  try {
    const [posts, reels] = await Promise.all([
      fetchSocialFetchInstagramPosts("@createownruneverything", 12),
      fetchSocialFetchInstagramReels("createownruneverything", 12),
    ]);

    assert.equal(requests.length, 2);
    const postRequest = requests.find((request) => request.url.endsWith("/posts"));
    const reelRequest = requests.find((request) => request.url.endsWith("/reels"));
    assert.equal(postRequest?.init?.next?.revalidate, SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS);
    assert.equal(reelRequest?.init?.next?.revalidate, SOCIAL_FETCH_REELS_REVALIDATE_SECONDS);
    assert.deepEqual(posts.items[0], {
      id: "18001234567890123",
      shortcode: "CorePhoto1",
      mediaType: "sidecar",
      caption: "Photo carousel",
      createdAt: "2026-08-27T09:30:00.000Z",
      sourceUrl: "https://www.instagram.com/p/CorePhoto1/",
      embedUrl: "https://www.instagram.com/p/CorePhoto1/embed",
      thumbnailUrl: "https://cdninstagram.example/photo.jpg",
      dimensions: { width: 1440, height: 1080 },
      surface: "post",
    });
    assert.deepEqual(reels.items[0], {
      id: "18009876543210987",
      shortcode: "CoreReel1",
      mediaType: "video",
      caption: null,
      createdAt: "2026-08-28T11:45:00.000Z",
      sourceUrl: "https://www.instagram.com/reel/CoreReel1/",
      embedUrl: "https://www.instagram.com/reel/CoreReel1/embed",
      thumbnailUrl: "https://cdninstagram.example/reel.jpg",
      dimensions: { width: 1080, height: 1920 },
      surface: "reel",
    });
    assert.equal("videoUrl" in posts.items[0]!, false);
    assert.equal("videoUrl" in reels.items[0]!, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("missing credentials and exhausted credits fail closed without throwing", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "Insufficient credits" }), { status: 402 });
  }) as typeof fetch;

  try {
    delete process.env.SOCIAL_FETCH_API_KEY;
    const unconfigured = await fetchSocialFetchTikTokVideos("coreboys");
    assert.equal(unconfigured.status, "not_configured");
    assert.equal(calls, 0);

    process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
    const exhausted = await fetchSocialFetchInstagramPosts("coreboys");
    assert.deepEqual(exhausted, {
      status: "credits_exhausted",
      items: [],
      lookupStatus: null,
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("social-feed keeps official rows authoritative and disables public HTML scraping", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/social-feed.ts"), "utf8");
  const tiktokEntry = source.slice(
    source.indexOf("export async function fetchTikTokFeed("),
    source.indexOf("export async function fetchSocialFetchTikTokFeed("),
  );
  const tiktokOfficial = tiktokEntry.indexOf("fetchTikTokFeedResult(rawHandle");
  const tiktokSocialFetch = tiktokEntry.indexOf("fetchSocialFetchTikTokFeed(", tiktokOfficial);
  assert.ok(tiktokOfficial >= 0 && tiktokSocialFetch > tiktokOfficial);
  assert.doesNotMatch(tiktokEntry, /fetchPublicTikTokProfileFeed/);
  assert.match(source, /mergeFeedWindows\(authorized\.items, socialFetchItems, limit\)/);
  assert.match(source, /fetchSocialFetchInstagramPosts[\s\S]{0,500}fetchSocialFetchInstagramReels/);
  assert.match(source, /embedUrl: media\.embedUrl/);
  assert.doesNotMatch(source, /mediaUrl: media\.(?:videoUrl|displayUrl)/);
});

test("paid media refresh is cron-only, durable, and cross-replica gated", () => {
  const feed = readFileSync(resolve(process.cwd(), "lib/social-feed.ts"), "utf8");
  const reconcile = readFileSync(resolve(process.cwd(), "app/api/social/reconcile/route.ts"), "utf8");
  const profileMetrics = readFileSync(resolve(process.cwd(), "lib/profile-social-metrics.ts"), "utf8");
  const migration = readFileSync(
    resolve(process.cwd(), "scripts/migrations/042_social_fetch_media_refresh.sql"),
    "utf8",
  );
  const runner = readFileSync(resolve(process.cwd(), "scripts/apply-web-migrations.mjs"), "utf8");

  assert.match(feed, /getPersistedPublicSocialFeed\(\s*"house"/);
  assert.match(feed, /getPersistedPublicSocialFeed\(\s*"core"/);
  assert.doesNotMatch(profileMetrics, /fetchSocialCountFromApi/);
  assert.match(profileMetrics, /viewer loading a profile must never spend provider credits/);
  assert.match(feed, /refreshHouseFeed[\s\S]{0,400}loadHouseFeed\(fallbacks\)/);
  assert.match(feed, /refreshCoreFeed[\s\S]{0,400}loadCoreFeed\(fallbacks\)/);
  assert.match(reconcile, /acquireSocialFetchRefreshLease\("profile_media"\)/);
  assert.match(reconcile, /acquireSocialFetchRefreshLease\("instagram_reels"\)/);
  assert.match(reconcile, /refreshHouseFeed\(512,/);
  assert.match(reconcile, /refreshCoreFeed\(128,/);
  assert.doesNotMatch(reconcile, /refresh(?:House|Core)Feed\(100,/);
  assert.match(reconcile, /onDiagnostic: \(diagnostic\) => publicDiagnostics\.push\(diagnostic\)/);
  assert.match(reconcile, /social_fetch_\$\{diagnostic\.surface\}_\$\{diagnostic\.status\}/);
  assert.match(reconcile, /publicMedia:\s*\{[\s\S]{0,300}diagnostics:/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_fetch_media_refresh_state/);
  assert.match(runner, /042_social_fetch_media_refresh\.sql/);
});

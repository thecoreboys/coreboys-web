import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  fetchSocialFetchTikTokVideos,
  setSocialFetchBudgetAdapterForTests,
  socialFetchBudgetDenialMediaStatus,
} from "../lib/social-fetch-media";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildCuratedChannelRails } from "../lib/watch/creator-platform-rails.ts";
import type { WatchItem } from "../lib/watch/types";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function savedItem(
  id: string,
  platform: "tiktok" | "instagram",
  sourceUrl: string,
  format: "short" | "photo",
): WatchItem {
  return {
    id,
    kind: format === "photo" ? "post" : "clip",
    platform,
    title: `${platform} saved post`,
    poster: `/fixtures/${id}.jpg`,
    backdrop: `/fixtures/${id}.jpg`,
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accountLabel: `Adapt · ${platform === "tiktok" ? "TikTok" : "Instagram"}`,
    accent: "#ef4444",
    href: `/theater?id=${encodeURIComponent(id)}`,
    sourceUrl,
    publishedAt: "2026-08-28T12:00:00.000Z",
    format,
    orientation: format === "photo" ? "square" : "portrait",
    embeddable: true,
  };
}

test("budget denials collapse to a neutral empty media window", () => {
  for (const reason of ["paused", "monthly_cap_reached", "unavailable"] as const) {
    assert.equal(socialFetchBudgetDenialMediaStatus(reason), "ok");
  }
});

test("paused and capped refreshes spend no provider credits and return a silent empty result", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json({ data: { videos: [] } });
  }) as typeof fetch;

  try {
    for (const [reason, handle] of [
      ["paused", "silentpaused"],
      ["monthly_cap_reached", "silentcap"],
    ] as const) {
      setSocialFetchBudgetAdapterForTests({
        reserve: async () => ({ ok: false, reason }),
        settle: async () => undefined,
      });
      assert.deepEqual(
        await fetchSocialFetchTikTokVideos(handle),
        { status: "ok", items: [], lookupStatus: null },
      );
    }
    assert.equal(providerCalls, 0);
  } finally {
    setSocialFetchBudgetAdapterForTests(null);
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.SOCIAL_FETCH_API_KEY;
    else process.env.SOCIAL_FETCH_API_KEY = previousKey;
  }
});

test("public channel surfaces cannot expose Social Fetch billing or cutoff diagnostics", () => {
  const publicSources = [
    "app/channels/[slug]/page.tsx",
    "components/watch/NetworkChannelPage.tsx",
    "components/watch/CreatorPlatformRails.tsx",
    "components/watch/OfficialSocialEmbedFallback.tsx",
  ].map(source).join("\n");
  const fallback = source("components/watch/OfficialSocialEmbedFallback.tsx");
  const rails = source("components/watch/CreatorPlatformRails.tsx");

  assert.doesNotMatch(
    publicSources,
    /credits_exhausted|monthly_cap_reached|cap[_ -]reached|payment[_ -]required|social[_ -]fetch|credit budget|credit cutoff|billing cutoff/i,
  );
  assert.doesNotMatch(fallback, /\{\s*diagnostic\s*\}/);
  assert.doesNotMatch(fallback, /diagnostic\s*:\s*string/);
  assert.doesNotMatch(rails, /<OfficialSocialEmbedFallback[^>]*diagnostic=/);
  assert.match(fallback, /Showing TikTok&apos;s official public Creator Profile Embed/);
  assert.match(fallback, /Showing Instagram&apos;s official public embed/);
});

test("saved posts remain visible when paid discovery is paused or capped", () => {
  const savedTikTok = savedItem(
    "tt-saved",
    "tiktok",
    "https://www.tiktok.com/@fazeadapt/video/7610123456789012345",
    "short",
  );
  const savedInstagram = savedItem(
    "ig-saved",
    "instagram",
    "https://www.instagram.com/p/SavedPost1/",
    "photo",
  );
  const rails = buildCuratedChannelRails([savedTikTok, savedInstagram], {
    sources: [
      {
        platform: "tiktok",
        label: "Adapt · TikTok",
        handle: "@fazeadapt",
        href: "https://www.tiktok.com/@fazeadapt",
        ingestState: "not_configured",
      },
      {
        platform: "instagram",
        label: "Adapt · Instagram",
        handle: "@thefazeadapt",
        href: "https://www.instagram.com/thefazeadapt/",
        ingestState: "not_configured",
      },
    ],
  });

  assert.deepEqual(
    rails.map((rail) => ({ platform: rail.platform, ids: rail.items.map((item) => item.id) })),
    [
      { platform: "tiktok", ids: ["tt-saved"] },
      { platform: "instagram", ids: ["ig-saved"] },
    ],
  );

  const component = source("components/watch/CreatorPlatformRails.tsx");
  assert.match(component, /function shouldUseOfficialEmbedFallback[\s\S]{0,250}return rail\.items\.length === 0/);
  assert.match(component, /usesOfficialEmbedFallback \?[\s\S]{0,200}<OfficialSocialEmbedFallback[\s\S]{0,200}: \([\s\S]{0,100}<MediaSourceRail/);
});

test("public reads retain durable snapshots and neutral official embeds as fallbacks", () => {
  const feed = source("lib/social-feed.ts");
  const houseRead = feed.slice(
    feed.indexOf("export async function getHouseFeed("),
    feed.indexOf("export async function refreshHouseFeed("),
  );
  const coreRead = feed.slice(
    feed.indexOf("export async function getCoreFeed("),
    feed.indexOf("export async function refreshCoreFeed("),
  );
  const embedFallback = source("components/watch/OfficialSocialEmbedFallback.tsx");

  for (const publicRead of [houseRead, coreRead]) {
    assert.match(publicRead, /getPersistedPublicSocialFeed\(/);
    assert.match(publicRead, /\.\.\.persistedItems/);
    assert.doesNotMatch(publicRead, /fetchSocialFetch(?:TikTok|Instagram)/);
  }
  assert.match(embedFallback, /tiktokCreatorEmbed\(rail\.handle\)/);
  assert.match(embedFallback, /instagramPublicEmbeds\(/);
  assert.match(embedFallback, /TIKTOK_EMBED_SCRIPT_SRC/);
  assert.match(embedFallback, /INSTAGRAM_EMBED_SCRIPT_SRC/);
});

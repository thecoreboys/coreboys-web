import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { configuredInstagramEmbedUrls, instagramPublicEmbed, instagramPublicEmbeds, tiktokCreatorEmbed } from "../lib/watch/public-social-embeds.ts";

test("builds TikTok's documented Creator Profile Embed identity from configured public handles", () => {
  assert.deepEqual(tiktokCreatorEmbed("@Scout2015"), {
    handle: "scout2015",
    profileUrl: "https://www.tiktok.com/@scout2015",
    referUrl: "https://www.tiktok.com/@scout2015?refer=creator_embed",
  });
  assert.equal(
    tiktokCreatorEmbed("https://www.tiktok.com/@officialcoreboys/")?.handle,
    "officialcoreboys",
  );
  assert.equal(tiktokCreatorEmbed("https://www.tiktok.com/@officialcoreboys/video/123"), null);
  assert.equal(tiktokCreatorEmbed("https://not-tiktok.example/@officialcoreboys"), null);
});

test("accepts only Meta's documented public Instagram profile, post, and Reel URL formats", () => {
  assert.deepEqual(instagramPublicEmbed("@CreateOwnRunEverything"), {
    key: "profile:createownruneverything",
    kind: "profile",
    permalink: "https://www.instagram.com/createownruneverything/",
    label: "View @createownruneverything on Instagram",
  });
  assert.equal(
    instagramPublicEmbed("https://www.instagram.com/p/Public_Post-1/?utm_source=share")?.permalink,
    "https://www.instagram.com/p/Public_Post-1/",
  );
  assert.equal(
    instagramPublicEmbed("https://instagram.com/reel/Public_Reel-2/")?.kind,
    "reel",
  );
  assert.equal(instagramPublicEmbed("https://www.instagram.com/stories/core/123/"), null);
  assert.equal(instagramPublicEmbed("https://cdn.instagram.com/p/not-public/"), null);
  assert.equal(instagramPublicEmbed("https://www.instagram.com/core/p/not-documented/"), null);
});

test("deduplicates and bounds public Instagram embeds without discovery requests", () => {
  const embeds = instagramPublicEmbeds([
    "@core",
    "https://www.instagram.com/core/",
    "https://www.instagram.com/p/POST_1/",
    "https://www.instagram.com/p/POST_1/?utm_source=copy",
    "https://www.instagram.com/reel/REEL_2/",
  ], 2);
  assert.deepEqual(embeds.map((embed) => embed.kind), ["profile", "post"]);
});

test("uses only explicit Watch Programming Instagram picks as post embed configuration", () => {
  const urls = configuredInstagramEmbedUrls([
    {
      platform: "instagram",
      sourceUrl: "https://www.instagram.com/p/CONFIGURED_1/",
      programming: {
        community: true,
        sourceId: "ig-source",
        curatedItemId: "ig-item",
        routes: [],
      },
    },
    {
      platform: "instagram",
      sourceUrl: "https://www.instagram.com/reel/DISCOVERED_2/",
      programming: {
        community: true,
        sourceId: "ig-source",
        routes: [],
      },
    },
    {
      platform: "instagram",
      sourceUrl: "https://www.instagram.com/p/API_FEED_3/",
      programming: undefined,
    },
    {
      platform: "tiktok",
      sourceUrl: "https://www.instagram.com/p/WRONG_PLATFORM_4/",
      programming: {
        community: true,
        sourceId: "tt-source",
        curatedItemId: "tt-item",
        routes: [],
      },
    },
  ]);
  assert.deepEqual(urls, ["https://www.instagram.com/p/CONFIGURED_1/"]);
});

test("renders official embed.js markup and honest notification limitations", () => {
  const component = readFileSync(
    resolve(process.cwd(), "components/watch/OfficialSocialEmbedFallback.tsx"),
    "utf8",
  );
  assert.match(component, /data-embed-type="creator"/);
  assert.match(component, /data-embed-from="oembed"/);
  assert.match(component, /TIKTOK_EMBED_SCRIPT_SRC/);
  assert.match(component, /data-instgrm-permalink=\{embed\.permalink\}/);
  assert.match(component, /INSTAGRAM_EMBED_SCRIPT_SRC/);
  assert.match(component, /instgrm\?\.Embeds\?\.process/);
  assert.match(component, /up to 10 recent public videos/);
  assert.match(component, /profile embed is the live public fallback/);
  assert.match(component, /monitor indexes individual posts and Reels/);
  assert.match(component, /This public profile view updates from the platform/);
  assert.match(component, /Creator alerts use CORE&apos;s public-feed monitor when available/);
  assert.match(component, /document\.createElement\("script"\)/);
  assert.match(component, /script\.src = TIKTOK_EMBED_SCRIPT_SRC/);
  assert.match(component, /coreTikTokCreatorEmbeds = signature/);
  assert.doesNotMatch(component, /fetch\s*\(/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});

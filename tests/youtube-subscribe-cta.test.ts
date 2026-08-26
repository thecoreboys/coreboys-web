import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseYouTubeSubscriptionResponse,
  youtubeSubscribeHref,
} from "../lib/youtube-subscription";

test("YouTube subscription confirmation links accept only roster-safe identifiers", () => {
  assert.equal(
    youtubeSubscribeHref({ channelId: "UC6H8_DvqnEp1tYEp10GzH0g" }),
    "https://www.youtube.com/channel/UC6H8_DvqnEp1tYEp10GzH0g?sub_confirmation=1",
  );
  assert.equal(
    youtubeSubscribeHref({ handle: " @JasonTheWeenie " }),
    "https://www.youtube.com/@JasonTheWeenie?sub_confirmation=1",
  );
  assert.equal(youtubeSubscribeHref({ handle: "../../billing" }), null);
  assert.equal(youtubeSubscribeHref({ channelId: "not-a-channel", handle: "bad/path" }), null);
});

test("only a successful empty YouTube subscription response means not subscribed", () => {
  assert.deepEqual(parseYouTubeSubscriptionResponse(200, { items: [] }), { status: "not_subscribed" });
  assert.deepEqual(parseYouTubeSubscriptionResponse(200, { items: [{ id: "sub" }] }), { status: "subscribed" });
  assert.deepEqual(parseYouTubeSubscriptionResponse(401, { items: [] }), { status: "unknown", reason: "youtube_401" });
  assert.deepEqual(parseYouTubeSubscriptionResponse(403, { items: [] }), { status: "unknown", reason: "youtube_403" });
  assert.deepEqual(parseYouTubeSubscriptionResponse(429, { items: [] }), { status: "unknown", reason: "youtube_429" });
  assert.deepEqual(parseYouTubeSubscriptionResponse(200, {}), { status: "unknown", reason: "youtube_malformed" });
});

test("the free YouTube CTA lives in custom controls and uses cached sync only", () => {
  const player = readFileSync(new URL("../components/watch/PersistentPlayer.tsx", import.meta.url), "utf8");
  const cta = readFileSync(new URL("../components/watch/YouTubeSubscribeCta.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/watch/watch.css", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/youtube/subscription-status/route.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/oauth/sync.ts", import.meta.url), "utf8");

  assert.match(player, /current\.platform === "youtube" && current\.youtubeId/);
  assert.match(player, /current\.memberLabel\.trim\(\)\.toLowerCase\(\) === "core"/);
  assert.match(player, /memberSlug=\{current\.memberSlug \?\? "house"\}/);
  assert.match(cta, /state\.status === "loading" \|\| state\.status === "subscribed"/);
  assert.match(cta, /Free on YouTube/);
  assert.match(cta, /\[authLoading, cacheKey, user\?\.id\]/);
  assert.match(cta, /target="_blank"/);
  assert.match(css, /\.watch-youtube-subscribe::before/);
  assert.match(css, /\.watch-youtube-subscribe:hover/);
  assert.match(route, /allTargets\(\)\.find/);
  assert.match(route, /await listLoyalty\(userId\)/);
  assert.doesNotMatch(route, /googleapis\.com|accessTokenFor|fetch\(/);
  assert.match(sync, /verification\.status === "unknown"[\s\S]*youtube subscription check/);
  assert.doesNotMatch(sync, /if \(!res\.ok\) return false/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTwitchLogin,
  parseTwitchSubscriptionResponse,
  twitchTierOnePriceLabel,
  twitchSubscribeHref,
} from "../lib/twitch-subscription";

test("Twitch subscription links accept only canonical channel logins", () => {
  assert.equal(normalizeTwitchLogin(" @StableRonaldo "), "stableronaldo");
  assert.equal(twitchSubscribeHref("StableRonaldo"), "https://www.twitch.tv/subs/stableronaldo");
  assert.equal(twitchSubscribeHref("../../billing"), null);
  assert.equal(twitchSubscribeHref("a".repeat(26)), null);
});

test("only Twitch's documented 404 is treated as not subscribed", () => {
  assert.deepEqual(parseTwitchSubscriptionResponse(404, null), { status: "not_subscribed" });
  assert.deepEqual(parseTwitchSubscriptionResponse(401, null), { status: "unknown", reason: "helix_401" });
  assert.deepEqual(parseTwitchSubscriptionResponse(429, null), { status: "unknown", reason: "helix_429" });
  assert.deepEqual(parseTwitchSubscriptionResponse(200, { data: [] }), { status: "unknown", reason: "helix_empty" });
});

test("active Twitch subscriptions preserve tier and gift metadata", () => {
  assert.deepEqual(
    parseTwitchSubscriptionResponse(200, { data: [{ tier: "1000", is_gift: true }] }),
    { status: "subscribed", tier: "1000", gift: true },
  );
});

test("Tier 1 price copy is configurable and defaults to a localized reference", () => {
  assert.equal(twitchTierOnePriceLabel(" CA $7.99 "), "CA $7.99");
  assert.equal(twitchTierOnePriceLabel(""), "US $5.99");
});

test("the hover CTA is mounted only for Twitch live playback controls", () => {
  const player = readFileSync(new URL("../components/watch/PersistentPlayer.tsx", import.meta.url), "utf8");
  const cta = readFileSync(new URL("../components/watch/TwitchSubscribeCta.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/watch/watch.css", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/twitch/subscription-status/route.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/oauth/sync.ts", import.meta.url), "utf8");
  assert.match(player, /<TwitchSubscribeCta login=\{current\.twitchLogin\}/);
  assert.match(cta, /state\.status === "loading" \|\| state\.status === "subscribed"/);
  assert.match(cta, /\[authLoading, cacheKey, user\?\.id\]/);
  assert.match(cta, /target="_blank"/);
  assert.match(css, /\.watch-twitch-subscribe:hover::before/);
  assert.match(css, /@keyframes watch-twitch-subscribe-shift/);
  assert.match(route, /await listLoyalty\(userId\)/);
  assert.doesNotMatch(route, /api\.twitch\.tv|accessTokenFor|fetch\(/);
  assert.match(sync, /verification\.status === "unknown"[\s\S]*Keep the last persisted value/);
  assert.doesNotMatch(sync, /treat non-200 as not-subbed/);
});

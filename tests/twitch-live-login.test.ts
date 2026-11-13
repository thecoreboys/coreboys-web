import assert from "node:assert/strict";
import test from "node:test";
import { itemToPlayable, twitchLiveLogin } from "../lib/watch/playable";
import type { WatchItem } from "../lib/watch/types";

function live(overrides: Partial<WatchItem>): WatchItem {
  return {
    id: "live-jason", kind: "live", platform: "twitch", format: "live", title: "Jason live",
    poster: "/p.jpg", backdrop: "/p.jpg", memberSlug: "jason", memberLabel: "JasonTheWeen", accent: "#fff",
    href: "/theater", ...overrides,
  } as WatchItem;
}

test("a live Twitch item finds its channel even without an explicit login", () => {
  assert.equal(twitchLiveLogin(live({ href: "/watch/live/adapt" })), "adapt");
  assert.equal(twitchLiveLogin(live({ live: { login: "lacy" } })), "lacy");
  assert.equal(twitchLiveLogin(live({ sourceUrl: "https://www.twitch.tv/JasonTheWeen" })), "jasontheween");
  assert.equal(twitchLiveLogin(live({ embedUrl: "https://player.twitch.tv/?channel=silky&parent=x" })), "silky");
  // A videos/settings path is not a channel; fall back to the creator's channel.
  assert.equal(twitchLiveLogin(live({ sourceUrl: "https://www.twitch.tv/videos/123" })), "jasontheween");
  // Other platforms never borrow a Twitch login.
  assert.equal(twitchLiveLogin(live({ platform: "youtube", sourceUrl: "https://www.twitch.tv/x" })), null);
});

test("the player gets a Twitch login for a live hero/guide item, so the embed can autoplay", () => {
  const playable = itemToPlayable(live({ href: "https://www.twitch.tv/jasontheween", sourceUrl: "https://www.twitch.tv/jasontheween" }));
  assert.equal(playable?.kind, "live");
  assert.equal(playable?.twitchLogin, "jasontheween");
});

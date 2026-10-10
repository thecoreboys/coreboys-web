import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { YouTubeLiveChat, youtubeLiveChatUrl } from "../components/live/YouTubeLiveChat";
import { itemToPlayable, playableFromUrl, youtubeIdFromHref } from "../lib/watch/playable";
import {
  liveChatAvailable,
  youtubeLiveChatVideoId,
} from "../lib/watch/player-companion";
import type { WatchItem } from "../lib/watch/types";

test("YouTube live URLs remain live playables", () => {
  assert.equal(youtubeIdFromHref("https://www.youtube.com/live/abcDEF_123"), "abcDEF_123");
  const direct = playableFromUrl("https://www.youtube.com/live/abcDEF_123");
  assert.equal(direct?.kind, "live");
  assert.equal(direct?.platform, "youtube");
  assert.equal(direct?.youtubeId, "abcDEF_123");
  assert.equal(direct?.format, "live");
});

test("catalog live state wins over a legacy YouTube kind query", () => {
  const item = {
    id: "yt-abcDEF_123",
    kind: "live",
    platform: "youtube",
    title: "Live broadcast",
    poster: "",
    backdrop: "",
    memberSlug: null,
    memberLabel: "YouTube",
    accent: "#db0368",
    href: "/theater?kind=youtube&src=youtube&id=abcDEF_123",
    sourceUrl: "https://www.youtube.com/watch?v=abcDEF_123",
    format: "live",
  } satisfies WatchItem;
  const playable = itemToPlayable(item);
  assert.equal(playable?.kind, "live");
  assert.equal(playable?.platform, "youtube");
  assert.equal(playable?.youtubeId, "abcDEF_123");
});

test("YouTube live chat is available to the player companion", () => {
  const live = { kind: "live", platform: "youtube", youtubeId: "abcDEF_123" };
  assert.equal(youtubeLiveChatVideoId(live), "abcDEF_123");
  assert.equal(liveChatAvailable(live), true);
  assert.equal(liveChatAvailable({ kind: "youtube", platform: "youtube", youtubeId: "abcDEF_123" }), false);

  const src = youtubeLiveChatUrl("abcDEF_123", "localhost");
  assert.ok(src);
  const parsed = new URL(src);
  assert.equal(parsed.origin, "https://www.youtube.com");
  assert.equal(parsed.pathname, "/live_chat");
  assert.equal(parsed.searchParams.get("v"), "abcDEF_123");
  assert.equal(parsed.searchParams.get("embed_domain"), "localhost");
  assert.equal(parsed.searchParams.get("dark_theme"), "1");
  assert.equal(typeof YouTubeLiveChat, "function");
});

test("multiview keeps catalog YouTube broadcasts in the live counter and clock path", () => {
  const multiview = readFileSync("components/watch/MultiPlayerStage.tsx", "utf8");
  const player = readFileSync("components/watch/PersistentPlayer.tsx", "utf8");
  assert.match(multiview, /if \(item\.platform === "youtube"\) return Boolean\(item\.youtubeId\)/);
  assert.match(player, /currentTimeLabel\(current, uiPosition, scrubberDuration, twitchDvrActive\)/);
  assert.match(player, /Number\.isFinite\(details\.currentTime\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  isCoreControlledTwitchLivePlayback,
  isGuideLiveTwitchPlayback,
  movePlayerCompanionView,
  normalizePlayerCompanionView,
  playerCompanionViews,
  twitchLiveChatLogin,
} from "../lib/watch/player-companion";

test("the player companion exposes chat only for a supported live channel", () => {
  assert.deepEqual(playerCompanionViews(true), ["details", "up-next", "chat"]);
  assert.deepEqual(playerCompanionViews(false), ["details", "up-next"]);
  assert.equal(normalizePlayerCompanionView("chat", false), "details");
});

test("player companion tabs wrap and honor Home and End", () => {
  assert.equal(movePlayerCompanionView("details", "ArrowRight", true), "up-next");
  assert.equal(movePlayerCompanionView("up-next", "ArrowRight", true), "chat");
  assert.equal(movePlayerCompanionView("details", "ArrowLeft", false), "up-next");
  assert.equal(movePlayerCompanionView("details", "Home", true), "details");
  assert.equal(movePlayerCompanionView("up-next", "End", true), "chat");
});

test("Guide live Twitch playback opens focused chat without treating archives as live", () => {
  const live = { kind: "live", platform: "twitch", twitchLogin: "Marlon" };
  assert.equal(twitchLiveChatLogin(live), "Marlon");
  assert.equal(isGuideLiveTwitchPlayback(live, { id: "m3:live" }), true);
  assert.equal(isGuideLiveTwitchPlayback(live, { id: "m3:videos", airing: { status: "live" } }), true);

  assert.equal(twitchLiveChatLogin({ kind: "vod", platform: "twitch", twitchLogin: "Marlon" }), null);
  assert.equal(twitchLiveChatLogin({ kind: "live", platform: "youtube", twitchLogin: "Marlon" }), null);
  assert.equal(isGuideLiveTwitchPlayback(live, { id: "m3:videos" }), false);
});

test("CORE owns Twitch live controls throughout Theater and Guide handoffs", () => {
  const live = { kind: "live", platform: "twitch", twitchLogin: "Marlon" };
  assert.equal(isCoreControlledTwitchLivePlayback(live, {
    playerScreen: true,
    guideLivePlayback: false,
  }), true);
  assert.equal(isCoreControlledTwitchLivePlayback(live, {
    playerScreen: false,
    guideLivePlayback: true,
  }), true);
  assert.equal(isCoreControlledTwitchLivePlayback(live, {
    playerScreen: false,
    guideLivePlayback: false,
  }), false);
  assert.equal(isCoreControlledTwitchLivePlayback(
    { kind: "vod", platform: "twitch", twitchLogin: "Marlon" },
    { playerScreen: true, guideLivePlayback: true },
  ), false);
});

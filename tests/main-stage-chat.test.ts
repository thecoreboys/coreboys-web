import assert from "node:assert/strict";
import test from "node:test";
import { mainStageChatSelection, mainStageTwitchLogin, prioritizeChatLogins } from "../lib/watch/main-stage-chat";

const members = [{ slug: "ron", twitchLogin: "StableRonaldo" }, { slug: "lacy", twitchLogin: "lacy" }];
const live = { kind: "live" as const, platform: "twitch" as const, memberSlug: "ron", twitchLogin: " StableRonaldo " };

test("the main Twitch source supplies its channel, including guest streams", () => {
  assert.equal(mainStageTwitchLogin(live, members), "stableronaldo");
  assert.equal(mainStageTwitchLogin({ ...live, memberSlug: null, twitchLogin: "guest_stream" }, members), "guest_stream");
});

test("a creator's YouTube simulcast keeps their own Twitch chat", () => {
  assert.equal(mainStageTwitchLogin({ ...live, platform: "youtube", twitchLogin: null }, members), "stableronaldo");
  assert.equal(mainStageTwitchLogin({ ...live, platform: "youtube", memberSlug: "lacy", twitchLogin: null }, members), "lacy");
});

test("unmapped sources, invalid channels, and archived videos never borrow another creator's chat", () => {
  assert.equal(mainStageTwitchLogin(null, members), null);
  assert.equal(mainStageTwitchLogin({ ...live, kind: "vod" }, members), null);
  assert.equal(mainStageTwitchLogin({ ...live, platform: "youtube", memberSlug: "unknown" }, members), null);
  assert.equal(mainStageTwitchLogin({ ...live, memberSlug: null, twitchLogin: "bad/login" }, members), null);
  assert.deepEqual(mainStageChatSelection("unknown", null, null, ["stableronaldo", "lacy"]), { login: null, followsMain: true });
});

test("chat follows a new main source even after another channel was manually selected", () => {
  const available = ["stableronaldo", "lacy", "adapt"];
  const choice = { sourceKey: "ron-twitch", login: "lacy" };
  assert.deepEqual(mainStageChatSelection("ron-twitch", "stableronaldo", choice, available), { login: "lacy", followsMain: false });
  assert.deepEqual(mainStageChatSelection("adapt-twitch", "adapt", choice, available), { login: "adapt", followsMain: true });
  assert.deepEqual(mainStageChatSelection("ron-youtube", "stableronaldo", choice, available), { login: "stableronaldo", followsMain: true });
});

test("removing a browsed chat or returning to automatic selection restores the main channel", () => {
  const choice = { sourceKey: "ron", login: "lacy" };
  assert.deepEqual(mainStageChatSelection("ron", "stableronaldo", choice, ["stableronaldo"]), { login: "stableronaldo", followsMain: true });
  assert.deepEqual(mainStageChatSelection("ron", "stableronaldo", null, ["stableronaldo", "lacy"]), { login: "stableronaldo", followsMain: true });
});

test("a one-connection playback budget always connects the displayed main chat", () => {
  assert.deepEqual(prioritizeChatLogins(["lacy", "silky", "stableronaldo"], "stableronaldo", "stableronaldo", 1), ["stableronaldo"]);
  assert.deepEqual(prioritizeChatLogins(["lacy", "silky", "stableronaldo"], "lacy", "stableronaldo", 1), ["lacy"]);
  assert.deepEqual(prioritizeChatLogins(["lacy", "silky", "stableronaldo"], "lacy", "stableronaldo", 2), ["lacy", "stableronaldo"]);
});

test("connection priorities normalize, deduplicate, and keep both active chats within the eight-channel limit", () => {
  const crowded = ["one", "two", "three", "four", "five", "six", "seven", "eight", " LACY ", "bad/login"];
  const actual = prioritizeChatLogins(crowded, "Lacy", "StableRonaldo", 12);
  assert.equal(actual.length, 8);
  assert.deepEqual(actual.slice(0, 2), ["lacy", "stableronaldo"]);
  assert.equal(new Set(actual).size, actual.length);
  assert.ok(!actual.includes("bad/login"));
});

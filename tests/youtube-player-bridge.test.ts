import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { listenToYouTube, youtubePlaybackSample } from "../lib/watch/youtube-player";
import { shouldStackTwitchRoom } from "../lib/watch/room-layout";

test("YouTube initial delivery restores the current playback state and duration", () => {
  assert.deepEqual(youtubePlaybackSample({ event: "initialDelivery", info: {
    currentTime: 27.5, duration: 618, playerState: 1,
  } }), { currentTime: 27.5, duration: 618, playerState: 1 });
  for (const state of [-1, 0, 1, 2, 3, 5]) {
    assert.deepEqual(youtubePlaybackSample({ event: "onStateChange", info: state }), { playerState: state });
  }
  assert.equal(youtubePlaybackSample({ event: "onReady" }), null);
  assert.equal(youtubePlaybackSample({ event: "infoDelivery", info: null }), null);
});

test("YouTube bridge listening can reattach after a late iframe load", () => {
  const messages: Array<Record<string, unknown>> = [];
  const source = { postMessage: (message: string) => messages.push(JSON.parse(message)) };
  listenToYouTube(source, "late-player");
  listenToYouTube(source, "late-player");
  assert.equal(messages.filter((message) => message.event === "listening").length, 2);
  assert.ok(messages.every((message) => message.channel === "widget" && message.id === "late-player"));
  assert.ok(messages.some((message) => message.func === "addEventListener" && (message.args as string[])[0] === "onStateChange"));
  for (const file of ["PersistentPlayer", "MultiPlayerStage"]) {
    const component = readFileSync(`components/watch/${file}.tsx`, "utf8");
    assert.match(component, /onLoad=\{\(\) => \{\s*setFrameReadyToken/);
    assert.match(component, /youtubePlaybackSample\(/);
  }
});

test("Twitch companion layouts respond to the room width and minimum player height", () => {
  const companion = { x: 7 / 12, y: 0, width: 5 / 12, height: 1 };
  assert.equal(shouldStackTwitchRoom(729, [companion]), true);
  assert.equal(shouldStackTwitchRoom(1280, [companion]), false);
  assert.equal(shouldStackTwitchRoom(1280, [{ x: 0, y: 0, width: 0.5, height: 0.25 }]), true);
  assert.equal(shouldStackTwitchRoom(729, []), false);
  assert.equal(shouldStackTwitchRoom(0, [companion]), false);
});

test("Theater's multiview links release the previous route intent", () => {
  const component = readFileSync("components/watch/PersistentPlayer.tsx", "utf8");
  const links = [...component.matchAll(/<Link\s+href="\/multiview\?picker=1"[\s\S]*?<\/Link>/g)];
  assert.equal(links.length, 2);
  for (const [link] of links) {
    assert.match(link, /checkpointCurrent\(\)/);
    assert.match(link, /minimize\(\)/);
  }
});

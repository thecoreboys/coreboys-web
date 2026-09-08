import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../components/watch/MultiPlayerStage.tsx", import.meta.url), "utf8");

test("mobile Multiview gives absolute media a bounded nonzero frame", () => {
  assert.match(source, /width: mobile \? \(shape === "portrait" \? "min\(100%, 19rem\)" : "100%"\)/);
  assert.match(source, /height: mobile \? "auto"/);
  assert.match(source, /aspectRatio: mobile \? \(shape === "portrait" \? "9 \/ 16" : shape === "square" \? "1 \/ 1" : "16 \/ 9"\)/);
  assert.match(source, /minHeight: mobile && tile.item.platform === "twitch" \? 300/);
});
test("expired native media falls back without shielding provider interaction", () => {
  assert.match(source, /failedNativeSource !== `\$\{tile.item.key\}:\$\{nativeCandidate\}`/);
  assert.match(source, /setFailedNativeSource\(`/);
  assert.match(source, /className=\{`pointer-events-auto absolute inset-0 z-10 h-full w-full/);
  assert.doesNotMatch(source, /tile.item.platform === "twitch" \? "pointer-events-auto z-10" : "pointer-events-none"/);
});
test("small Twitch tiles explain the provider requirement instead of a dead activate loop", () => {
  assert.match(source, /\{tooSmallForTwitch \? \(/);
  assert.match(source, /Turn your phone sideways/);
  assert.match(source, /Open on Twitch/);
  assert.match(source, /aria-label=\{currentLive.length \? "Watch live channels" : "No channels are live"\}/);
});

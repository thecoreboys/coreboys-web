import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../components/watch/MultiPlayerStage.tsx", import.meta.url), "utf8");

test("mobile Multiview gives absolute media a bounded nonzero frame", () => {
  assert.match(source, /width: mobile \? \(shape === "portrait" \? "min\(100%, 19rem\)" : "100%"\)/);
  assert.match(source, /height: mobile \? "auto"/);
  assert.match(source, /aspectRatio: mobile \? \(shape === "portrait" \? "9 \/ 16" : shape === "square" \? "1 \/ 1" : "16 \/ 9"\)/);
  assert.match(source, /minHeight: mobile && tile.item.platform === "twitch" \? \(compact \? undefined : 364\)/);
});
test("phone Multiview offers real multi-player layouts with stable provider frames", () => {
  assert.match(source, /type MobileLayout = "split" \| "stack" \| "focus"/);
  assert.match(source, /const MOBILE_LAYOUT_STORE = "core-multiview-mobile-layout:v1"/);
  // Every rendered phone player stays in one keyed list; promotion is CSS order only.
  assert.match(source, /order: layout === "split" && isMain \? -1 : 0/);
  assert.match(source, /<PlayerTile\s+key=\{tile\.id\}/);
  // Full-bleed stage so wider phones meet Twitch's 400px minimum.
  assert.match(source, /aria-label="Mobile player view" data-mobile-layout=\{layout\} className="-mx-3 sm:-mx-5"/);
});
test("phone Multiview settings apply live and chat stays beside the player", () => {
  assert.match(source, /function MobileRoomSettings\(/);
  for (const setter of ["setMaxActivePlayers", "setDataSaver", "setAutoplayMode", "setQualityPreference", "setPlaybackRate", "setCaptionsEnabled", "setMixAudio", "setChatTextScale", "setShowChatTimestamps"]) {
    assert.match(source, new RegExp(`player\.${setter}`));
  }
  // The phone chat sheet is non-modal so the main player remains usable.
  assert.doesNotMatch(source, /role=\{mobileOpen \? "dialog" : undefined\}/);
  assert.match(source, /h-\[var\(--room-chat-sheet-h,min\(58dvh,40rem\)\)\]/);
  // Desktop-only chat docks never render as fixed panels on a phone.
  assert.match(source, /!mobile && player\.chatDock === "floating" && hasRoomChat/);
});
test("expired native media falls back without shielding provider interaction", () => {
  assert.match(source, /failedNativeSource !== `\$\{tile.item.key\}:\$\{nativeCandidate\}`/);
  assert.match(source, /setFailedNativeSource\(`/);
  assert.match(source, /className=\{`pointer-events-auto absolute inset-0 z-10 h-full w-full/);
  assert.doesNotMatch(source, /tile.item.platform === "twitch" \? "pointer-events-auto z-10" : "pointer-events-none"/);
});
test("small Twitch tiles explain the provider requirement instead of a dead activate loop", () => {
  assert.match(source, /\) : tooSmallForTwitch \? \(/);
  // Compact phone companions turn a too-small Twitch tile into a tap-to-watch card.
  assert.match(source, /compact && \(tooSmallForTwitch \|\| standby\) \? \(/);
  assert.match(source, /Turn your phone sideways/);
  assert.match(source, /Open on Twitch/);
  assert.match(source, /aria-label=\{currentLive.length \? "Watch live channels" : "No channels are live"\}/);
});
test("Twitch room controls reserve their own space above the native iframe", () => {
  assert.match(source, /height: "calc\(100% - 64px\)", top: 64/);
  assert.match(source, /size\.height - 64 < 300/);
  assert.match(source, /minmax\(384px, 1fr\)/);
  assert.match(source, /tile\.item\.platform === "twitch" \? "h-16 bg-room-panel"/);
});

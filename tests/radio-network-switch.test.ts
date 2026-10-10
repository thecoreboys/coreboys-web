import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  radioNetworkSlugFromPath,
  shouldPlayRecordedNetworkTune,
} from "../lib/radio/network-switch";

const system = readFileSync(new URL("../components/watch/RadioAudioSystem.tsx", import.meta.url), "utf8");
const transition = readFileSync(new URL("../components/watch/CinematicRouteTransition.tsx", import.meta.url), "utf8");
const director = readFileSync(new URL("../components/watch/RadioAudioDirector.tsx", import.meta.url), "utf8");

test("only actual channel changes request a recorded DJ Cora tune", () => {
  assert.equal(radioNetworkSlugFromPath("/channels/ron?mode=continuous"), "ron");
  assert.equal(radioNetworkSlugFromPath("/watch"), null);

  assert.equal(shouldPlayRecordedNetworkTune("/", "/channels/core?mode=continuous"), true);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core", "/channels/ron?mode=continuous"), true);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core?mode=continuous", "/channels/core?mode=shorts"), false);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core", "/channels/core"), false);
});

test("the radio system validates a dial selection before routing to its continuous channel", () => {
  assert.match(system, /const target = resolveNetworkChannel\(slug\)/);
  assert.match(system, /if \(!target\) return/);
  assert.match(system, /const href = `\/channels\/\$\{target\.slug\}\?mode=continuous`/);
  assert.match(system, /beginCinematicTransition\(href\)/);
  assert.match(system, /router\.push\(href as never\)/);
});

test("station tune audio uses the shared DJ Cora director lifecycle", () => {
  assert.match(transition, /requestRadioCue\(\{/);
  assert.match(transition, /kind: "network_tune_in"/);
  assert.match(transition, /RADIO_CUE_LIFECYCLE_EVENT/);
  assert.match(transition, /TUNING_TERMINAL_STATUSES\.includes\(detail\.status\)/);
  assert.match(transition, /skipRadioCue\("network_tuning_skipped"\)/);
  assert.match(director, /const isSpeaking = Boolean\(activeCue\)/);
  assert.match(director, /replacesStationTune/);
});

test("network dial navigation starts immediately and channel routes expose a lightweight loading shell", () => {
  assert.match(transition, /router\.push\(href as Route\);/);
  assert.doesNotMatch(transition, /setTimeout\(\(\) =>\s*\{\s*router\.push/);
  const loading = readFileSync(new URL("../app/channels/[slug]/loading.tsx", import.meta.url), "utf8");
  assert.match(loading, /aria-label="Loading network"/);
  assert.match(loading, /animate-pulse/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  radioNetworkSlugFromPath,
  shouldPlayRecordedNetworkTune,
} from "../lib/radio/network-switch";

const system = readFileSync(new URL("../components/watch/RadioAudioSystem.tsx", import.meta.url), "utf8");

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

import assert from "node:assert/strict";
import test from "node:test";
import {
  radioNetworkSlugFromPath,
  shouldPlayRecordedNetworkTune,
} from "../lib/radio/network-switch";

test("only actual channel changes request a recorded DJ Cora tune", () => {
  assert.equal(radioNetworkSlugFromPath("/channels/ron?mode=continuous"), "ron");
  assert.equal(radioNetworkSlugFromPath("/watch"), null);

  assert.equal(shouldPlayRecordedNetworkTune("/", "/channels/core?mode=continuous"), true);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core", "/channels/ron?mode=continuous"), true);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core?mode=continuous", "/channels/core?mode=shorts"), false);
  assert.equal(shouldPlayRecordedNetworkTune("/channels/core", "/channels/core"), false);
});

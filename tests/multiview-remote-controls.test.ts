import assert from "node:assert/strict";
import test from "node:test";
import {
  REMOTE_CONTROL_PREFIX,
  REMOTE_CONTROLS,
  remoteControlFromCommand,
  remoteControlSatisfied,
  type RemoteHostState,
} from "../lib/watch/multiview-remote";

const idle: RemoteHostState = { mainAudible: false, audibleCount: 0, audible: [], maximized: false, layout: "quad" };

test("control commands round-trip through the shared command column", () => {
  for (const control of REMOTE_CONTROLS) assert.equal(remoteControlFromCommand(REMOTE_CONTROL_PREFIX + control), control);
  assert.equal(remoteControlFromCommand("control:explode"), null);
  assert.equal(remoteControlFromCommand("someone:twitch"), null);
  assert.equal(remoteControlFromCommand(null), null);
});

test("a control is only acknowledged once the host state reflects it", () => {
  assert.equal(remoteControlSatisfied("mute-all", null), false);
  assert.equal(remoteControlSatisfied("mute-all", idle), true);
  assert.equal(remoteControlSatisfied("mute-all", { ...idle, audibleCount: 1, audible: ["a:twitch"] }), false);
  assert.equal(remoteControlSatisfied("main-sound-on", idle), false);
  assert.equal(remoteControlSatisfied("main-sound-on", { ...idle, mainAudible: true, audibleCount: 1 }), true);
  assert.equal(remoteControlSatisfied("main-sound-off", idle), true);
  assert.equal(remoteControlSatisfied("maximize", idle), false);
  assert.equal(remoteControlSatisfied("maximize", { ...idle, maximized: true }), true);
  assert.equal(remoteControlSatisfied("restore", idle), true);
  assert.equal(remoteControlSatisfied("theater", idle), false);
  assert.equal(remoteControlSatisfied("theater", { ...idle, layout: "theater-first" }), true);
});

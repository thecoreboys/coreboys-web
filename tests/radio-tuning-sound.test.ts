import assert from "node:assert/strict";
import test from "node:test";
import { isRadioTuningSoundAllowed } from "../lib/radio/tuning-sound";

test("the local tuning texture honors the station audio and accessibility preferences", () => {
  assert.equal(isRadioTuningSoundAllowed({ enabled: true, volume: 0.72 }), true);
  assert.equal(isRadioTuningSoundAllowed({ enabled: false, volume: 0.72 }), false);
  assert.equal(isRadioTuningSoundAllowed({ muted: true, volume: 0.72 }), false);
  assert.equal(isRadioTuningSoundAllowed({ dataSaver: true, volume: 0.72 }), false);
  assert.equal(isRadioTuningSoundAllowed({ suppressed: true, volume: 0.72 }), false);
  assert.equal(isRadioTuningSoundAllowed({ reducedMotion: true, volume: 0.72 }), false);
  assert.equal(isRadioTuningSoundAllowed({ volume: 0 }), false);
});

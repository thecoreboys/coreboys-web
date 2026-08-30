import assert from "node:assert/strict";
import test from "node:test";
import { devicePerformanceProfile } from "../lib/device-performance";

test("device profile conserves resources on low-power or save-data devices", () => {
  assert.equal(devicePerformanceProfile({ hardwareConcurrency: 2, deviceMemory: 2 }), "conserve");
  assert.equal(devicePerformanceProfile({ hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } }), "conserve");
});

test("device profile leaves ordinary devices standard and reserves enhanced for strong hardware", () => {
  assert.equal(devicePerformanceProfile({ hardwareConcurrency: 8, deviceMemory: 8 }), "standard");
  assert.equal(devicePerformanceProfile({ hardwareConcurrency: 16, deviceMemory: 16 }), "enhanced");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  localPlayerPrefsUpdatedAt,
  remotePlayerPrefsWin,
  stampPlayerPrefs,
} from "../lib/watch/player-prefs-clock";

const prefs = { captionsEnabled: true, qualityPreference: "best" };
const t1 = new Date("2026-11-01T10:00:00Z");
const t2 = new Date("2026-11-02T10:00:00Z");

test("a fresh device or an unchanged pre-stamp record defers to the account copy", () => {
  const fresh = stampPlayerPrefs(prefs, null, t1);
  assert.equal(localPlayerPrefsUpdatedAt(JSON.stringify(fresh)), 0);
  const legacy = stampPlayerPrefs(prefs, JSON.stringify(prefs), t1);
  assert.equal(localPlayerPrefsUpdatedAt(JSON.stringify(legacy)), 0);
  assert.equal(remotePlayerPrefsWin("2020-01-01T00:00:00Z", 0), true);
});

test("only a real change moves the local clock", () => {
  const base = JSON.stringify(stampPlayerPrefs(prefs, null, t1));
  const changed = stampPlayerPrefs({ ...prefs, captionsEnabled: false }, base, t1);
  assert.equal(changed.updatedAt, t1.toISOString());
  const rewritten = stampPlayerPrefs({ ...prefs, captionsEnabled: false }, JSON.stringify(changed), t2);
  assert.equal(rewritten.updatedAt, t1.toISOString(), "re-persisting identical values keeps the stamp");
});

test("an older account copy cannot overwrite a newer in-player choice", () => {
  const local = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(remotePlayerPrefsWin("2026-11-01T10:00:00Z", local), false);
  assert.equal(remotePlayerPrefsWin("2026-11-03T10:00:00Z", local), true);
  assert.equal(remotePlayerPrefsWin(undefined, local), false);
  assert.equal(localPlayerPrefsUpdatedAt("not json"), 0);
});

test("settings hydration compares clocks and the provider stamps what it stores", () => {
  const hub = readFileSync("components/account/AccountSettingsHub.tsx", "utf8");
  const provider = readFileSync("components/providers/PlayerProvider.tsx", "utf8");
  assert.match(hub, /remotePlayerPrefsWin\(playerItem\?\.updatedAt, localPrefsMs\)/);
  assert.match(hub, /if \(playerStored && typeof playerStored === "object" && remoteWins\)/);
  assert.match(provider, /stampPlayerPrefs\(\{/);
});

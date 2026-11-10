import assert from "node:assert/strict";
import test from "node:test";
import { settingsSectionFromLocation } from "../lib/account/settings-navigation";
import { mergeSavedNotificationChannel } from "../lib/account/notification-settings";

test("settings links open the owning section, including legacy and nested links", () => {
  assert.equal(settingsSectionFromLocation("#account-deletion", false), "privacy");
  assert.equal(settingsSectionFromLocation("#connections", false), "connected-accounts");
  assert.equal(settingsSectionFromLocation("", true), "connected-accounts");
  assert.equal(settingsSectionFromLocation("#playback", false), "playback");
  assert.equal(settingsSectionFromLocation("", false), "profile");
});

test("an email save cannot undo a concurrent text notification change", () => {
  const current: { emailEnabled: boolean; smsEnabled: boolean; updatedAt: string | null } = { emailEnabled: true, smsEnabled: true, updatedAt: null };
  const response = { emailEnabled: true, smsEnabled: false, updatedAt: "now" };
  assert.deepEqual(mergeSavedNotificationChannel(current, response, "emailEnabled"), { emailEnabled: true, smsEnabled: true, updatedAt: "now" });
});

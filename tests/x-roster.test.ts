import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERS } from "../lib/members";
import {
  X_ROSTER_OWNERS,
  configuredXRosterFeedAccounts,
  getXRosterOwner,
} from "../lib/x/roster";
import { X_COMMUNITY_KEYS } from "../lib/x/types";

test("every CORE channel owner has exactly one X profile and Community slot", () => {
  assert.equal(X_ROSTER_OWNERS.length, MEMBERS.length + 1);
  assert.deepEqual(
    new Set(X_ROSTER_OWNERS.map((owner) => owner.communityKey)),
    new Set(X_COMMUNITY_KEYS),
  );
  assert.deepEqual(
    new Set(X_ROSTER_OWNERS.flatMap((owner) => owner.memberSlug ? [owner.memberSlug] : [])),
    new Set(MEMBERS.map((member) => member.slug)),
  );

  for (const owner of X_ROSTER_OWNERS) {
    assert.ok(owner.handle, `${owner.ownerLabel} is missing an X handle`);
    assert.match(owner.handle, /^@[A-Za-z0-9_]{1,15}$/);
    assert.ok(owner.profileUrl, `${owner.ownerLabel} is missing an X profile URL`);
    assert.equal(new URL(owner.profileUrl).hostname, "x.com");
    assert.equal(getXRosterOwner(owner.memberSlug), owner);
  }
});

test("the single cached X query preserves its owner on every roster account", () => {
  const accounts = configuredXRosterFeedAccounts();
  assert.equal(accounts.length, X_ROSTER_OWNERS.length);
  assert.equal(new Set(accounts.map((account) => account.handle.toLowerCase())).size, accounts.length);
  assert.deepEqual(
    new Set(accounts.map((account) => account.authorSlug ?? "core")),
    new Set(["core", ...MEMBERS.map((member) => member.slug)]),
  );
  for (const account of accounts) {
    const owner = getXRosterOwner(account.authorSlug);
    assert.ok(owner);
    assert.equal(account.handle, owner.handle);
    assert.match(account.authorLabel, new RegExp(`^${owner.ownerLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · @`));
  }
});

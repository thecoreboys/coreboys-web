import assert from "node:assert/strict";
import test from "node:test";
import { CREW } from "../lib/members";
import { configuredXCrewFeedAccounts, crewXAuthorSlug, getXCrewOwner } from "../lib/x/crew-roster";
import { configuredXRosterFeedAccounts } from "../lib/x/roster";
import { buildXRecentSearchUrl, parseXRecentSearchResponse } from "../lib/x-feed-request";
import { canonicalSocialEventId, socialContentTypeForFeedItem } from "../lib/social-event-normalization";

test("every crew X account participates in a bounded query with separate identity", () => {
  const crewAccounts = configuredXCrewFeedAccounts();
  assert.equal(crewAccounts.length, CREW.filter((crew) => crew.socials.some((social) => social.platform === "x")).length);
  for (const account of crewAccounts) {
    const owner = getXCrewOwner(account.authorSlug);
    assert.ok(owner);
    assert.equal(account.authorSlug, crewXAuthorSlug(owner.slug));
    assert.ok(account.authorLabel.startsWith(`${owner.name} · `));
  }
  assert.equal(getXCrewOwner("lacy"), null);
  assert.equal(getXCrewOwner("crew:unknown"), null);
  const accounts = [...configuredXRosterFeedAccounts(), ...crewAccounts];
  const query = new URL(buildXRecentSearchUrl(accounts)!).searchParams.get("query")!;
  assert.ok(query.length <= 512, "configured roster must fit X's standard recent-search query bound");
  for (const account of accounts) assert.ok(query.toLowerCase().includes(`from:${account.handle.replace(/^@/, "").toLowerCase()}`));
});

test("crew media posts keep their crew author and one canonical notification identity", () => {
  const accounts = configuredXCrewFeedAccounts();
  const drew = accounts.find((account) => account.authorSlug === "crew:drew-wall")!;
  assert.ok(drew);
  const items = parseXRecentSearchResponse({
    data: [{ id: "123456789", author_id: "crew-user", text: "Behind the camera", created_at: "2026-11-08T12:00:00Z", attachments: { media_keys: ["photo1", "photo2"] } }],
    includes: {
      users: [{ id: "crew-user", username: drew.handle.replace(/^@/, ""), name: "Drew" }],
      media: [{ media_key: "photo1", type: "photo", url: "https://pbs.twimg.com/media/1.jpg" }, { media_key: "photo2", type: "photo", url: "https://pbs.twimg.com/media/2.jpg" }],
    },
  }, accounts);
  assert.equal(items.length, 2);
  assert.deepEqual(new Set(items.map((item) => item.authorSlug)), new Set(["crew:drew-wall"]));
  assert.deepEqual(new Set(items.map(canonicalSocialEventId)), new Set(["x:123456789"]));
  assert.deepEqual(new Set(items.map(socialContentTypeForFeedItem)), new Set(["post"]));
});

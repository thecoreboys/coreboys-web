import assert from "node:assert/strict";
import test from "node:test";
import type { PatreonLockedItem } from "../lib/watch/types";
import { selectPublicPatreonVideoPosts } from "../lib/watch/patreon-policy";

function teaser(id: string, kind: PatreonLockedItem["kind"] = "post"): PatreonLockedItem {
  return {
    id,
    title: `Teaser ${id}`,
    href: `https://www.patreon.com/posts/${id}`,
    thumbnailUrl: null,
    publishedAt: null,
    label: kind === "post" ? "Locked post" : "Member benefit",
    kind,
    locked: true,
  };
}

test("keeps every real discovered video post and excludes benefit placeholders", () => {
  const publicPosts = Array.from({ length: 9 }, (_, index) => teaser(`public-${index + 1}`));
  const selected = selectPublicPatreonVideoPosts([
    ...publicPosts,
    teaser("public-benefit", "benefit"),
  ]);

  assert.deepEqual(selected.map((item) => item.id), publicPosts.map((item) => item.id));
  assert.ok(selected.every((item) => item.label === "Exclusive video"));
});

test("deduplicates discovered video posts by truthful Patreon destination without mutating input", () => {
  const shared = teaser("shared");
  const discovered = [{ ...shared }, { ...shared, id: "duplicate" }, teaser("unique")];
  const selected = selectPublicPatreonVideoPosts(discovered);

  assert.deepEqual(selected.map((item) => item.id), ["shared", "unique"]);
  assert.equal(discovered.length, 3);
  assert.equal(discovered[0]?.label, "Locked post");
});

import assert from "node:assert/strict";
import test from "node:test";
import { xPosterContent } from "../lib/watch/x-poster";

const item = { title: "im here... 🔥 https://t.co/abc", memberLabel: "Lacy", href: "/watch/x/123", sourceUrl: "https://x.com/LacyHimself/status/123", publishedAt: "2026-11-08T19:00:00Z" };

test("post posters preserve real text, casing, emoji, and source identity", () => {
  const post = xPosterContent(item);
  assert.equal(post.text, "im here... 🔥");
  assert.equal(post.handle, "LacyHimself");
  assert.equal(post.name, "Lacy");
  assert.equal(post.date, "Nov 8, 2026");
  assert.equal(post.avatar, undefined);
});

test("expanded note text and resolved link metadata take priority", () => {
  const post = xPosterContent({ ...item, x: {
    statusId: "123", statusUrl: item.sourceUrl, authorId: "abc", authorHandle: "LacyHimself", authorName: "Lacy on X", authorProfileUrl: "https://x.com/LacyHimself",
    noteText: "Longer actual post https://t.co/abc", noteEntities: { urls: [{ url: "https://t.co/abc", display_url: "youtube.com/watch?v=abc" }] },
  } });
  assert.equal(post.text, "Longer actual post youtube.com/watch?v=abc");
  assert.equal(post.name, "Lacy on X");
});

test("missing content stays honest and malformed timestamps do not leak into cards", () => {
  const post = xPosterContent({ ...item, title: "https://t.co/only", publishedAt: "invalid", sourceUrl: "https://example.com/user/status/123" });
  assert.equal(post.text, "Shared a post on X");
  assert.equal(post.handle, "");
  assert.equal(post.date, null);
});

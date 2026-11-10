import assert from "node:assert/strict";
import test from "node:test";
import { archiveMentionAt, removeArchiveMention } from "../lib/watch/archive-mentions";
import { paginateWatchSearch } from "../lib/watch/search-pagination";

test("creator mentions work at the caret and preserve other search terms", () => {
  const text = "fortnite @lacy clips";
  const mention = archiveMentionAt(text, "fortnite @lac".length)!;
  assert.equal(mention.query, "lac");
  assert.equal(removeArchiveMention(text, mention), "fortnite clips");
  assert.equal(archiveMentionAt("person@example.com", 10), null);
  assert.equal(archiveMentionAt("@", 1)?.query, "");
});

test("archive results can be paged beyond the initial sixty without overlap", () => {
  const source = Array.from({ length: 83 }, (_, index) => index);
  const collected: number[] = [];
  let offset: number | null = 0;
  do {
    const page: { results: number[]; nextOffset: number | null } = paginateWatchSearch(source, offset, 18);
    assert.ok(page.results.length <= 18);
    collected.push(...page.results);
    offset = page.nextOffset;
  } while (offset !== null);
  assert.deepEqual(collected, source);
});

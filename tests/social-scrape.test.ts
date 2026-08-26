import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping runner requires a TypeScript suffix.
import { parseYouTubeSubscriberCount } from "../lib/social-scrape.ts";

test("parses both documented YouTube subscriber renderer shapes", () => {
  assert.equal(
    parseYouTubeSubscriberCount(
      'before "subscriberCountText":{"simpleText":"342K subscribers"} after',
    ),
    342_000,
  );
  assert.equal(
    parseYouTubeSubscriberCount(
      'before "subscriberCountText":{"accessibility":{"accessibilityData":{"label":"3.2M subscribers"}},"simpleText":"3.2M subscribers"} after',
    ),
    3_200_000,
  );
});

test("returns null when YouTube omits a public subscriber count", () => {
  assert.equal(parseYouTubeSubscriberCount('{"title":"Private channel"}'), null);
});

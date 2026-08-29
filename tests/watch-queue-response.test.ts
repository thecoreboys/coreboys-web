import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SHORT_FORM_QUEUE_DEFAULT_LIMIT,
  SHORT_FORM_QUEUE_FILTER,
  SHORT_FORM_QUEUE_MAX_LIMIT,
  WATCH_QUEUE_EXCLUDE_LIMIT,
  isShortFormQueuePlayable,
  watchQueueResponseOptions,
} from "../lib/watch/queue-response";

test("short-form queue filtering is explicit and does not overload the format recommendation hint", () => {
  const recommendationOnly = watchQueueResponseOptions(new URLSearchParams("format=short&limit=1"));
  assert.equal(recommendationOnly.shortFormOnly, false);
  assert.equal(recommendationOnly.responseLimit, null);

  const filtered = watchQueueResponseOptions(new URLSearchParams(
    `format=short&filter=${SHORT_FORM_QUEUE_FILTER}`,
  ));
  assert.equal(filtered.shortFormOnly, true);
  assert.equal(filtered.responseLimit, SHORT_FORM_QUEUE_DEFAULT_LIMIT);
});

test("short-form queue responses and exclusion keys are conservatively bounded", () => {
  const keys = Array.from({ length: WATCH_QUEUE_EXCLUDE_LIMIT + 12 }, (_, index) => `item-${index}`);
  const options = watchQueueResponseOptions(new URLSearchParams({
    filter: SHORT_FORM_QUEUE_FILTER,
    limit: "999",
    exclude: keys.join(","),
  }));

  assert.equal(options.responseLimit, SHORT_FORM_QUEUE_MAX_LIMIT);
  assert.equal(options.excluded.size, WATCH_QUEUE_EXCLUDE_LIMIT);
  assert.equal(options.excluded.has(`item-${WATCH_QUEUE_EXCLUDE_LIMIT - 1}`), true);
  assert.equal(options.excluded.has(`item-${WATCH_QUEUE_EXCLUDE_LIMIT}`), false);
});

test("dedicated Shorts responses accept only supported playable short-form providers", () => {
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "youtube", platform: "youtube" }), true);
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "clip", platform: "tiktok" }), true);
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "clip", platform: "instagram" }), true);
  assert.equal(isShortFormQueuePlayable({ format: "long", kind: "youtube", platform: "youtube" }), false);
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "clip", platform: "twitch" }), false);
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "live", platform: "youtube" }), false);
  assert.equal(isShortFormQueuePlayable({ format: "short", kind: "post", platform: "instagram" }), false);
});

test("the queue route and Shorts client share the bounded opt-in response contract", () => {
  const route = readFileSync(new URL("../app/api/watch/queue/route.ts", import.meta.url), "utf8");
  const stage = readFileSync(new URL("../components/watch/ShortsStage.tsx", import.meta.url), "utf8");

  assert.match(route, /watchQueueResponseOptions\(params\)/);
  assert.match(route, /shortFormOnly && !isShortFormQueuePlayable\(item\)/);
  assert.match(route, /items\.slice\(0, responseLimit\)/);
  assert.match(stage, /slice\(-WATCH_QUEUE_EXCLUDE_LIMIT\)/);
  assert.match(stage, /filter: SHORT_FORM_QUEUE_FILTER/);
  assert.match(stage, /limit: String\(SHORT_FORM_QUEUE_DEFAULT_LIMIT\)/);
});

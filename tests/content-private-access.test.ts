import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server-only content access runs after every cache and verification schema", () => {
  const runner = readFileSync("scripts/apply-web-migrations.mjs", "utf8");
  const registered = Array.from(runner.matchAll(/"([0-9]+_[a-z_]+\.sql)"/g), (match) => match[1]);
  const privateIndex = registered.indexOf("064_content_private_access.sql");
  assert.notEqual(privateIndex, -1);
  assert.equal(registered.filter((name) => name === "064_content_private_access.sql").length, 1);
  for (const dependency of [
    "056_content_tombstones.sql", "057_social_fetch_request_cache.sql",
    "058_content_verification.sql", "059_twitch_content_verification.sql",
    "060_x_content_verification.sql",
    "062_face_profile_review.sql", "063_clipping_campaigns.sql",
  ]) {
    assert.ok(registered.indexOf(dependency) >= 0 && registered.indexOf(dependency) < privateIndex, dependency);
  }
});

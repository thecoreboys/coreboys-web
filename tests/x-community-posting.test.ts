import assert from "node:assert/strict";
import test from "node:test";
import { X_COMMUNITY_POSTING_CAPABILITY, canPublishToXCommunity } from "../lib/x/community-posting";

test("X Community publishing remains explicitly hard-disabled", () => {
  assert.equal(canPublishToXCommunity(), false);
  assert.equal(X_COMMUNITY_POSTING_CAPABILITY.enabled, false);
  assert.equal(X_COMMUNITY_POSTING_CAPABILITY.reason, "x_community_publish_api_undocumented");
});

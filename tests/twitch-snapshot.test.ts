import assert from "node:assert/strict";
import test from "node:test";
import { twitchLiveSnapshotUrl } from "../lib/watch/twitch-snapshot";

test("Twitch live sidebar snapshots use the larger image and refresh their cache key", () => {
  assert.equal(
    twitchLiveSnapshotUrl("https://static-cdn.jtvnw.net/previews-ttv/live_user_lacy-640x360.jpg", 120_000),
    "https://static-cdn.jtvnw.net/previews-ttv/live_user_lacy-1280x720.jpg?t=2",
  );
});

test("invalid and insecure Twitch snapshot URLs are ignored", () => {
  assert.equal(twitchLiveSnapshotUrl(null), null);
  assert.equal(twitchLiveSnapshotUrl("http://example.com/preview.jpg"), null);
  assert.equal(twitchLiveSnapshotUrl("not a URL"), null);
});

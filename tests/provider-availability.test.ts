import assert from "node:assert/strict";
import test from "node:test";
import { unavailableYouTubeObjects, youtubeAtomDeletions } from "../lib/provider-availability";

test("exact YouTube lookup differentiates confirmed absence/private content from malformed or failed responses", () => {
  const ids = ["abcdefghijk", "lmnopqrstuv", "12345678901"];
  assert.deepEqual(unavailableYouTubeObjects(ids, { items: [{ id: ids[0] }, { id: ids[1], status: { privacyStatus: "private" } }] }),
    [{ id: ids[1], reason: "private" }, { id: ids[2], reason: "not_found" }]);
  for (const body of [undefined, {}, { error: { code: 403 }, items: [] }, { items: null }, { items: [{}] }, { items: [null] }]) {
    assert.deepEqual(unavailableYouTubeObjects(ids, body), []);
  }
  assert.deepEqual(unavailableYouTubeObjects([ids[0]!], { items: [{ id: ids[0], status: { embeddable: false } }] }), []);
  assert.deepEqual(unavailableYouTubeObjects([ids[0]!], { items: [{ id: ids[0], status: { uploadStatus: "deleted" } }] }), [{ id: ids[0], reason: "deleted" }]);
});

test("YouTube Atom deletion markers bind an exact video to its channel and reject conflicting owner data", () => {
  const marker = '<at:deleted-entry ref="yt:video:abcdefghijk" when="2026-11-08T20:00:00Z"><at:by><uri>https://www.youtube.com/channel/UCexample</uri></at:by></at:deleted-entry>';
  assert.deepEqual(youtubeAtomDeletions(marker), [{ videoId: "abcdefghijk", channelId: "UCexample" }]);
  assert.deepEqual(youtubeAtomDeletions('<id>yt:channel:UCdifferent</id>'+marker), []);
  assert.deepEqual(youtubeAtomDeletions('<at:deleted-entry ref="yt:video:abcdefghijk"/>'), []);
  assert.deepEqual(youtubeAtomDeletions('<id>yt:channel:UCexample</id><at:deleted-entry ref="yt:video:abcdefghijk"/>'), [{ videoId: "abcdefghijk", channelId: "UCexample" }]);
  assert.deepEqual(youtubeAtomDeletions('<entry><yt:videoId>abcdefghijk</yt:videoId></entry>'), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { AnnotationInput, CreatorInput, activeCreatorTags, creatorTimelineSeconds, matchCreatorText, verifiedSocialUrl, videoRectangle, type CreatorAnnotation, type CreatorProfile } from "../lib/creator-tags/model";
import { defaultCreatorDirectory } from "../lib/creator-tags/directory";

const directory = defaultCreatorDirectory();
test("creator directory includes all six CORE members and named guest channels", () => {
  assert.equal(directory.length, 9);
  for (const creator of directory) {
    assert.ok(CreatorInput.safeParse(creator).success, creator.name);
    assert.ok(creator.socials.length);
    for (const social of creator.socials) assert.ok(verifiedSocialUrl(social.platform, social.url));
  }
});
test("text matching uses complete names, usernames and words, never face appearance", () => {
  assert.deepEqual(matchCreatorText("KICK.COM/ADINROSS", directory).map((c) => c.id), ["adin-ross"]);
  assert.deepEqual(matchCreatorText("@yourragegaming talks with Plaque Boy Max", directory).map((c) => c.id), ["plaqueboymax", "yourrage"]);
  assert.equal(matchCreatorText("a man wearing a cap, gold necklace, dark shirt", directory).length, 0);
  assert.equal(matchCreatorText("adinrossfanclub / merely a plaque", directory).length, 0);
});
test("ambiguous aliases and hidden creator records cannot produce text matches", () => {
  const profiles: CreatorProfile[] = directory.map((creator) => ({ ...creator, active: creator.id !== "adin-ross" }));
  assert.equal(matchCreatorText("adinross", profiles).length, 0);
  const duplicate = { ...directory[0]!, id: "other", name: "Other", aliases: ["adinross"] };
  assert.equal(matchCreatorText("adinross", [...directory, duplicate]).length, 0);
});
test("social links reject arbitrary hosts, credentials, insecure schemes and content permalinks", () => {
  for (const [platform, url] of [["x", "javascript:alert(1)"], ["twitch", "https://twitch.tv.evil.test/creator"], ["youtube", "https://youtube.com/watch?v=id"], ["x", "https://evil.test/a"], ["x", "https://me:secret@x.com/creator"], ["x", "https://x.com/home"], ["x", "http://x.com/creator"]]) assert.equal(verifiedSocialUrl(platform!, url!), false);
});
const tag: CreatorAnnotation = { id: "tag", assetKey: "youtube:yt-test", creatorId: "adin-ross", startSeconds: 10, endSeconds: 15, box: null, evidenceKind: "manual", evidence: "editor confirmed", status: "published", current: true };
test("timed tags stop at their end and disappear across seeks and source changes", () => {
  assert.equal(activeCreatorTags([tag], 10).length, 1);
  assert.equal(activeCreatorTags([tag], 14.999).length, 1);
  for (const time of [9.99, 15, 120, null, NaN, -1]) assert.equal(activeCreatorTags([tag], time).length, 0);
  assert.equal(activeCreatorTags([{ ...tag, current: false }], 12).length, 0);
  assert.equal(activeCreatorTags([{ ...tag, status: "draft" }], 12).length, 0);
});
test("Twitch live viewer watch time cannot masquerade as a broadcast frame timestamp", () => {
  assert.equal(creatorTimelineSeconds({ platform: "twitch", kind: "live", seconds: 120 }), null);
  assert.equal(creatorTimelineSeconds({ platform: "twitch", kind: "live", seconds: 120, replay: true }), 120);
  assert.equal(creatorTimelineSeconds({ platform: "twitch", kind: "vod", seconds: 120 }), 120);
  assert.equal(creatorTimelineSeconds({ platform: "youtube", kind: "live", seconds: 120 }), 120);
});
test("annotation validation prevents overflowing boxes and excessive or reversed time ranges", () => {
  const input = { assetKey: tag.assetKey, creatorId: tag.creatorId, startSeconds: 10, endSeconds: 15, evidenceKind: "manual", evidence: "confirmed" };
  assert.ok(AnnotationInput.safeParse(input).success);
  for (const extra of [{ endSeconds: 9 }, { endSeconds: 3611 }, { box: { x: .95, y: 0, width: .2, height: .1 } }, { startSeconds: Infinity }]) assert.equal(AnnotationInput.safeParse({ ...input, ...extra }).success, false);
});
test("video boxes follow contain and cover letterboxing without distorting source coordinates", () => {
  const contain = videoRectangle({ width: 1600, height: 900 }, { width: 900, height: 1600 });
  assert.equal(contain.height, 1); assert.equal(contain.width, .31640625); assert.equal(contain.x, .341796875);
  const cover = videoRectangle({ width: 900, height: 900 }, { width: 1600, height: 900 }, "cover");
  assert.equal(cover.height, 1); assert.ok(cover.width > 1); assert.ok(cover.x < 0);
  assert.deepEqual(videoRectangle({ width: 0, height: 0 }, { width: 0, height: 0 }), { x: 0, y: 0, width: 1, height: 1 });
});

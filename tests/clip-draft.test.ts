import assert from "node:assert/strict";
import test from "node:test";
import { CLIP_DRAFT_STORAGE_KEY, detectClipPlatform, saveLocalClipDraft } from "../lib/clips/local-draft";

test("clip drafts accept provider media links and reject lookalike hosts or homepages", () => {
  const cases = [
    ["https://clips.twitch.tv/RealClip", "twitch", "RealClip"],
    ["https://www.twitch.tv/creator/clip/RealClip", "twitch", "RealClip"],
    ["https://www.youtube.com/shorts/abcdefghijk", "youtube", "abcdefghijk"],
    ["https://youtu.be/abcdefghijk?t=3", "youtube", "abcdefghijk"],
    ["https://www.youtube.com/watch?v=abcdefghijk", "youtube", "abcdefghijk"],
    ["https://www.tiktok.com/@creator/video/123456789", "tiktok", "123456789"],
    ["https://vm.tiktok.com/ZClip/", "tiktok", null],
    ["https://www.instagram.com/reel/RealReel/", "instagram", "RealReel"],
  ];
  for (const [url, source, externalId] of cases) {
    assert.deepEqual(detectClipPlatform(url!), { source, externalId });
  }
  for (const url of [
    "https://youtube.com.evil.example/watch?v=abc", "https://fakeyoutu.be/abc",
    "https://notclips.twitch.tv/abc", "https://youtube.com/", "https://tiktok.com/@creator",
    "javascript://youtube.com/shorts/abc", "ftp://instagram.com/reel/abc", "not a URL",
  ]) assert.equal(detectClipPlatform(url).source, null, url);
});

test("draft saves use a separate local draft store and retain earlier drafts", () => {
  const values = new Map([[CLIP_DRAFT_STORAGE_KEY, JSON.stringify([{ id: "before", status: "draft" }])]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveLocalClipDraft(storage, { id: "next", status: "draft" });
  assert.deepEqual(JSON.parse(values.get(CLIP_DRAFT_STORAGE_KEY)!), [
    { id: "next", status: "draft" }, { id: "before", status: "draft" },
  ]);
  assert.equal(values.has("coreboys-clip-submissions:v1"), false);
});

test("storage failures propagate without a false save or overwriting damaged data", () => {
  for (const raw of ["{broken", '{"not":"a list"}']) {
    let writes = 0;
    assert.throws(() => saveLocalClipDraft({ getItem: () => raw, setItem: () => { writes += 1; } }, { id: "new", status: "draft" }));
    assert.equal(writes, 0);
  }
  assert.throws(() => saveLocalClipDraft({ getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } }, { id: "new", status: "draft" }), /Quota exceeded/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractPublicTikTokPosts } from "../lib/tiktok-public";

const profileHtml = `
  <script type="application/json" id="__UNIVERSAL_DATA_FOR_REHYDRATION__">
    {"scope":{"items":[
      {"id":"7521412345678901234","desc":"new CORE moment","createTime":1750000000,"author":{"uniqueId":"officialcoreboys"},"video":{"cover":"https://cdn.example/cover.jpg","width":1080,"height":1920}},
      {"id":"7521412345678901235","desc":"another creator","createTime":1750000001,"author":{"uniqueId":"notcore"},"video":{"cover":"https://cdn.example/nope.jpg"}}
    ]}}
  </script>`;

test("extracts only attributable public TikTok post records", () => {
  assert.deepEqual(extractPublicTikTokPosts(profileHtml, "@officialcoreboys"), [{
    id: "7521412345678901234",
    title: "new CORE moment",
    createdAt: 1750000000,
    thumbnailUrl: "https://cdn.example/cover.jpg",
    width: 1080,
    height: 1920,
  }]);
});

test("returns an empty window for a public shell with no post data", () => {
  assert.deepEqual(extractPublicTikTokPosts("<script type=\"application/json\">{}</script>", "officialcoreboys"), []);
});

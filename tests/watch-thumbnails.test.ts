import test from "node:test";
import assert from "node:assert/strict";
import { watchThumbCandidates } from "../lib/watch/thumbs";

test("rail artwork avoids oversized and often missing YouTube stills", () => {
  const chain = watchThumbCandidates("https://i.ytimg.com/vi/video123/maxresdefault.jpg", "video123");
  assert.equal(chain[0], "https://i.ytimg.com/vi/video123/hqdefault.jpg");
  assert.equal(chain[1], "https://i.ytimg.com/vi/video123/mqdefault.jpg");
  assert.equal(chain.includes("/embed-preview.png"), false);
  assert.equal(new Set(chain).size, chain.length);
});

test("hero keeps high resolution and a missing youtubeId can be recovered from the URL", () => {
  assert.equal(watchThumbCandidates("https://i.ytimg.com/vi/video123/maxresdefault.jpg", null, true)[0], "https://i.ytimg.com/vi/video123/maxresdefault.jpg");
  assert.equal(watchThumbCandidates("https://i.ytimg.com/vi/video123/maxresdefault.jpg")[0], "https://i.ytimg.com/vi/video123/hqdefault.jpg");
});

test("custom posters and provider images do not become a repeated generic card", () => {
  const custom = watchThumbCandidates("/brand/custom.webp", "video123");
  assert.equal(custom[0], "/brand/custom.webp");
  assert.deepEqual(watchThumbCandidates("https://cdn.example/image.jpg"), ["https://cdn.example/image.jpg"]);
  assert.deepEqual(watchThumbCandidates(""), []);
});

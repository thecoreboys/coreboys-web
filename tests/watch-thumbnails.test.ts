import test from "node:test";
import assert from "node:assert/strict";
import { isYoutubePlaceholderPixels, watchThumbCandidates } from "../lib/watch/thumbs";

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

test("YouTube's gray missing-thumbnail graphic is detected without rejecting normal imagery", () => {
  const width = 32;
  const height = 24;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inCenterPanel = x >= 9 && x <= 22 && y >= 7 && y <= 16;
      const inBrightDot = [12, 16, 20].some((dotX) => (x - dotX) ** 2 + (y - 11) ** 2 <= 1);
      const value = inBrightDot ? 235 : inCenterPanel ? 95 : 215;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  assert.equal(isYoutubePlaceholderPixels(pixels, width, height), true);

  const colorful = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < colorful.length; offset += 4) {
    colorful[offset] = 20;
    colorful[offset + 1] = 105;
    colorful[offset + 2] = 180;
    colorful[offset + 3] = 255;
  }
  assert.equal(isYoutubePlaceholderPixels(colorful, width, height), false);
});

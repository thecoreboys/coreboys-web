import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/watch/tiktok-thumbnail/route";

test("TikTok thumbnail recovery rejects non-video and non-TikTok URLs", async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = (async () => {
    requested = true;
    return Response.json({ thumbnail_url: "https://p16.tiktokcdn.com/cover.jpg" });
  }) as typeof fetch;
  try {
    const response = await GET(new Request("https://core.local/api/watch/tiktok-thumbnail?url=https%3A%2F%2Fevil.example%2Fvideo"));
    assert.equal(response.status, 400);
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TikTok thumbnail recovery redirects only to a TikTok image CDN", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ thumbnail_url: "https://p16.tiktokcdn-us.com/cover.jpg" })) as typeof fetch;
  try {
    const shareUrl = "https://www.tiktok.com/@creator/video/1234567890123456";
    const endpoint = new URL("https://core.local/api/watch/tiktok-thumbnail");
    endpoint.searchParams.set("url", shareUrl);
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://p16.tiktokcdn-us.com/cover.jpg");
    assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TikTok thumbnail recovery rejects an unsafe oEmbed image URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ thumbnail_url: "https://evil.example/tracker.jpg" })) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/tiktok-thumbnail");
    endpoint.searchParams.set("url", "https://www.tiktok.com/@creator/video/1234567890123456");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

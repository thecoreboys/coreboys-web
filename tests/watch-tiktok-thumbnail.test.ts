import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/watch/tiktok-thumbnail/route";
import { tiktokPostThumbnailSource } from "../lib/watch/thumbs";

test("search and cards recover only the exact TikTok post URL", () => {
  const source = "https://www.tiktok.com/@creator/video/1234567890123456";
  assert.equal(tiktokPostThumbnailSource({ platform: "tiktok", sourceUrl: `${source}?tracking=1` }), source);
  assert.equal(tiktokPostThumbnailSource({ platform: "tiktok", href: `/theater?url=${encodeURIComponent(source)}` }), source);
  assert.equal(tiktokPostThumbnailSource({ platform: "tiktok", sourceUrl: "https://evil.example/@creator/video/1234567890123456" }), undefined);
  assert.equal(tiktokPostThumbnailSource({ platform: "youtube", sourceUrl: source }), undefined);
});

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

test("recovers the exact post cover when TikTok oEmbed omits its thumbnail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).includes("/oembed")) return Response.json({ provider_name: "TikTok" });
    return new Response(`<script type="application/json">${JSON.stringify({ posts: [
      { id: "1234567890123456", createTime: 1750000000, author: { uniqueId: "creator" }, video: { cover: "https://p16.tiktokcdn-eu.com/real-cover.jpg" } },
      { id: "1234567890123457", createTime: 1750000001, author: { uniqueId: "creator" }, video: { cover: "https://p16.tiktokcdn.com/other.jpg" } },
    ] })}</script>`, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/tiktok-thumbnail");
    endpoint.searchParams.set("url", "https://www.tiktok.com/@creator/video/1234567890123456");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://p16.tiktokcdn-eu.com/real-cover.jpg");
  } finally { globalThis.fetch = originalFetch; }
});

test("a missing cover remains retryable and never substitutes a different post", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => String(input).includes("/oembed")
    ? Response.json({})
    : new Response(`<script type="application/json">${JSON.stringify({ id: "1234567890123457", createTime: 1750000000, author: { uniqueId: "creator" }, video: { cover: "https://p16.tiktokcdn.com/other.jpg" } })}</script>`)) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/tiktok-thumbnail");
    endpoint.searchParams.set("url", "https://www.tiktok.com/@creator/video/1234567890123456");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = originalFetch; }
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Route imports the server-only Redis cache, which is unavailable in the test
// runtime. Preserve its successful-value caching behavior for these tests.
const cache = new Map<string, unknown>();
const filename = resolve("app/api/watch/instagram-thumbnail/route.ts");
const nativeRequire = createRequire(filename);
const mod = { exports: {} as { GET: (request: Request) => Promise<Response> } };
vm.runInThisContext(`(function(module, exports, require) { ${ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText}\n})`, { filename })(mod, mod.exports, (name: string) => name === "@/lib/server-cache" ? {
  cachedThumbnailData: async (key: string, load: () => Promise<unknown>, options: { shouldCache: (value: unknown) => boolean }) => {
    if (cache.has(key)) return cache.get(key);
    const value = await load();
    if (options.shouldCache(value)) cache.set(key, value);
    return value;
  },
} : nativeRequire(name));
const { GET } = mod.exports;

test("Instagram covers decode signed URLs and skip private or empty sharing pages", async () => {
  const originalFetch = globalThis.fetch;
  const endpoint = new URL("https://core.local/api/watch/instagram-thumbnail");
  endpoint.searchParams.set("url", "https://www.instagram.com/reel/AbCd12345/");
  try {
    globalThis.fetch = (async () => new Response('<head><meta content="https://scontent.cdninstagram.com/cover.jpg?key=123&amp;size=large" property="og:image"></head>', { headers: { "content-type": "text/html" } })) as typeof fetch;
    const cover = await GET(new Request(endpoint));
    assert.equal(cover.headers.get("location"), "https://scontent.cdninstagram.com/cover.jpg?key=123&size=large");
    assert.doesNotMatch(cover.headers.get("cache-control") ?? "", /stale-while-revalidate/);
    globalThis.fetch = (async () => new Response('<head><title>Sign in</title></head>', { headers: { "content-type": "text/html" } })) as typeof fetch;
    assert.equal((await GET(new Request(endpoint))).status, 302);
    endpoint.searchParams.set("url", "https://www.instagram.com/reel/Private123/");
    assert.equal((await GET(new Request(endpoint))).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

test("Instagram thumbnail recovery rejects non-Instagram URLs", async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = (async () => {
    requested = true;
    return new Response('<html><head><meta property="og:image" content="https://scontent.cdninstagram.com/cover.jpg"></head></html>', { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const response = await GET(new Request("https://core.local/api/watch/instagram-thumbnail?url=https%3A%2F%2Fevil.example%2Freel%2Fabcd123"));
    assert.equal(response.status, 400);
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram thumbnail recovery redirects to the public Reel cover", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<html><head><meta property="og:image" content="https://scontent.cdninstagram.com/cover.jpg"></head></html>', { headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/instagram-thumbnail");
    endpoint.searchParams.set("url", "https://www.instagram.com/reel/Unique12345/?utm_source=core");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://scontent.cdninstagram.com/cover.jpg");
    assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram thumbnail recovery rejects unsafe sharing image URLs", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response('<head><meta content="https://evil.example/tracker.jpg" property="og:image"></head>', { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/instagram-thumbnail");
    endpoint.searchParams.set("url", "https://www.instagram.com/p/AbCd12345/");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 404);
    assert.equal(requestedUrl, "https://www.instagram.com/p/AbCd12345/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createPublicCache } from "../lib/public-cache";
import * as crypto from "node:crypto";

// Use the real cache with a fresh, isolated store for each case. Server-only
// Redis setup belongs to Next, and must never be reached by this unit test.
function loadRoute() {
  const source = readFileSync(resolve(process.cwd(), "app/api/watch/instagram-thumbnail/route.ts"), "utf8");
  const module = { exports: {} as typeof import("../app/api/watch/instagram-thumbnail/route") };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name: string) => {
      if (name === "node:crypto") return crypto;
      if (name === "@/lib/server-cache") return { cachedThumbnailData: createPublicCache({ read: async () => null, write: async () => {}, background: (work) => { void work(); } }) };
      throw new Error(`Unexpected import: ${name}`);
    },
    Response, Request, URL, AbortSignal, TextDecoder,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  });
  return module.exports;
}

test("Instagram covers decode signed URLs and skip private or empty sharing pages", async () => {
  const { GET } = loadRoute();
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
    endpoint.searchParams.set("url", "https://www.instagram.com/reel/Private12345/");
    assert.equal((await GET(new Request(endpoint))).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

test("Instagram thumbnail recovery rejects non-Instagram URLs", async () => {
  const { GET } = loadRoute();
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
  const { GET } = loadRoute();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<html><head><meta property="og:image" content="https://scontent.cdninstagram.com/cover.jpg"></head></html>', { headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const endpoint = new URL("https://core.local/api/watch/instagram-thumbnail");
    endpoint.searchParams.set("url", "https://www.instagram.com/reel/AbCd12345/?utm_source=core");
    const response = await GET(new Request(endpoint));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://scontent.cdninstagram.com/cover.jpg");
    assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram thumbnail recovery rejects unsafe sharing image URLs", async () => {
  const { GET } = loadRoute();
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

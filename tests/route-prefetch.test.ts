import assert from "node:assert/strict";
import test from "node:test";
import { canPrefetchPages, createRouteWarmer, publicPrefetchHref } from "../lib/route-prefetch";

test("preloading is limited to public destinations and respects reduced-data connections", () => {
  const current = "https://site.test/guide";
  assert.equal(publicPrefetchHref("/channels/ron?mode=continuous", current), "/channels/ron?mode=continuous");
  assert.equal(publicPrefetchHref("/shorts", current), "/shorts");
  for (const href of ["/guide", "/account", "/admin", "/api/auth/me", "https://other.test/shorts", "/channels/unknown", "/channels/ron?token=private", "/guide#section"]) {
    assert.equal(publicPrefetchHref(href, current), null, href);
  }
  assert.equal(canPrefetchPages(), true);
  assert.equal(canPrefetchPages({ saveData: true }), false);
  assert.equal(canPrefetchPages({ effectiveType: "2g" }), false);
  assert.equal(canPrefetchPages({ effectiveType: "4g" }), true);
});

test("repeated hover/focus preloads coalesce and can warm a refreshed route later", () => {
  let now = 1_000;
  const requests: string[] = [];
  const warm = createRouteWarmer(href => { requests.push(href); }, () => now);
  warm("/guide"); warm("/guide"); warm("/shorts");
  assert.deepEqual(requests, ["/guide", "/shorts"]);
  now += 30_000;
  warm("/guide");
  assert.deepEqual(requests, ["/guide", "/shorts", "/guide"]);
});

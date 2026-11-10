import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import middleware from "../middleware";

test("public pages and discovery files are open while admin keeps its preview gate", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "production",
    SITE_ACCESS_CODE: "123456",
    SITE_ACCESS_COOKIE_SECRET: "test-secret-that-is-long-enough",
  });
  try {
    for (const path of ["/", "/channels/core", "/guide", "/robots.txt", "/sitemap.xml", "/api/watch/search"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 200, path);
    }
    for (const path of ["/admin", "/studio"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/access");
    }
    const api = await middleware(new NextRequest("https://thecoreboys.com/api/admin/photos"));
    assert.equal(api.status, 401);
  } finally {
    for (const key of ["NODE_ENV", "SITE_ACCESS_CODE", "SITE_ACCESS_COOKIE_SECRET"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import middleware from "../middleware";

test("site pages and visitor APIs are public while staff pages still require staff sign-in", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "production", SITE_ACCESS_CODE: "123456", SITE_ACCESS_COOKIE_SECRET: "test-secret-that-is-long-enough",
    SITE_ACCESS_GATE_ENABLED: "false",
  });
  try {
    for (const path of ["/", "/channels/core", "/guide", "/multiview/remote", "/robots.txt", "/sitemap.xml", "/api/watch/search", "/api/auth/signup"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(response.headers.get("x-middleware-request-x-coreboys-access-page"), null, path);
    }
    for (const path of ["/admin", "/studio"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/admin/sign-in");
    }
  } finally {
    for (const key of ["NODE_ENV", "SITE_ACCESS_CODE", "SITE_ACCESS_COOKIE_SECRET", "SITE_ACCESS_GATE_ENABLED"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("an explicitly enabled private preview still requires its code", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "production",
    SITE_ACCESS_GATE_ENABLED: "true",
    SITE_ACCESS_CODE: "123456",
    SITE_ACCESS_COOKIE_SECRET: "test-secret-that-is-long-enough",
  });
  try {
    for (const path of ["/", "/channels/core", "/guide", "/robots.txt", "/sitemap.xml", "/admin", "/studio"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/access");
    }
    for (const path of ["/api/admin/photos", "/api/watch/search"]) {
      const api = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(api.status, 401, path);
    }
    for (const path of ["/access", "/api/access/verify", "/api/streams/poll"]) {
      const response = await middleware(new NextRequest(`https://thecoreboys.com${path}`));
      assert.equal(response.status, 200, path);
    }
  } finally {
    for (const key of ["NODE_ENV", "SITE_ACCESS_CODE", "SITE_ACCESS_COOKIE_SECRET", "SITE_ACCESS_GATE_ENABLED"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

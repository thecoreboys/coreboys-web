import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const requireModule = createRequire(resolve(process.cwd(), "package.json"));

function makeRoute(query: (sql: string, values: unknown[]) => Promise<unknown>) {
  const path = requireModule.resolve("./app/api/account/loyalty/route");
  const replacements: Record<string, unknown> = {
    "./lib/fan-auth": { getCurrentFanUserId: async () => "user-1" },
    "./lib/account-request": { accountRequestMatches: () => true, ACCOUNT_CHANGED_MESSAGE: "Account changed" },
    "./lib/db": { query },
    "./lib/oauth/loyalty": { buildLoyaltyCard: () => ({}), listLoyalty: async () => [], siteWatchStats: async () => ({}) },
    "./lib/oauth/connections": { listConnections: async () => [] },
  };
  const saved = new Map<string, NodeJS.Module | undefined>();
  for (const [name, exports] of Object.entries(replacements)) {
    const key = requireModule.resolve(name);
    saved.set(key, requireModule.cache[key]);
    requireModule.cache[key] = { id: key, filename: key, loaded: true, exports } as NodeJS.Module;
  }
  saved.set(path, requireModule.cache[path]);
  delete requireModule.cache[path];
  try { return requireModule(path) as { PATCH: (request: Request) => Promise<Response> }; }
  finally {
    for (const [key, value] of saved) {
      if (value) requireModule.cache[key] = value;
      else delete requireModule.cache[key];
    }
  }
}

function request(body: unknown) {
  return new Request("https://example.test/api/account/loyalty", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("profile settings can clear the favorite and handle and return confirmed values", async () => {
  const handler = makeRoute(async (sql, values) => {
    assert.match(sql, /CASE WHEN \$5::boolean THEN \$2 ELSE favorite_member END/);
    assert.match(sql, /CASE WHEN \$6::boolean THEN \$4 ELSE public_slug END/);
    assert.deepEqual(values, ["user-1", null, false, null, true, true]);
    return { rows: [{ public_card: false, public_slug: null, favorite_member: null }] };
  });
  const response = await handler.PATCH(request({ favoriteMember: null, publicCard: false, publicSlug: null }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).publicSlug, null);
});

test("publishing without a handle fails and invalid settings never reach the database", async () => {
  let reads = 0;
  const handler = makeRoute(async () => { reads++; return { rows: [] }; });
  const invalid = await handler.PATCH(request({ publicCard: "yes" }));
  assert.equal(invalid.status, 400);
  assert.equal(reads, 0);
  const missing = await handler.PATCH(request({ publicCard: true, publicSlug: null }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /handle/i);
});

test("a duplicate handle remains a clear conflict if another save wins the race", async () => {
  const handler = makeRoute(async (sql) => {
    if (sql.includes("SELECT id")) return { rows: [] };
    throw Object.assign(new Error("duplicate"), { code: "23505" });
  });
  const response = await handler.PATCH(request({ publicCard: true, publicSlug: "example-user" }));
  assert.equal(response.status, 409);
});

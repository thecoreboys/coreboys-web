import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("only the exact independently authenticated face maintenance route bypasses preview access", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const paths = source.split("const TRUSTED_INTEGRATION_PATHS = [")[1]!.split("] as const")[0]!;
  assert.match(paths, /"\/api\/admin\/faces\/maintenance"/);
  assert.doesNotMatch(paths, /"\/api\/admin\/"|"\/api\/admin\/faces\/"/);
  const route = readFileSync(new URL("../app/api/admin/faces/maintenance/route.ts", import.meta.url), "utf8");
  assert.match(route, /timingSafeEqual\(expected, actual\)/);
  assert.match(route, /suppliedCronSecret && !cronAuthorized/);
  assert.match(route, /await requireAdmin\(\)/);
});

test("media shares the primary pool instead of doubling every replica's sessions", () => {
  const source = readFileSync(new URL("../lib/media-intelligence/schema.ts", import.meta.url), "utf8");
  assert.match(source, /if \(sameDatabase\) \{[\s\S]*?getPrimaryDatabasePool\(\)/);
  assert.match(source, /max: 1,/);
  const primary = readFileSync(new URL("../lib/db.ts", import.meta.url), "utf8");
  assert.match(primary, /max: 3,/);
  assert.match(primary, /statement_timeout: 30_000/);
});

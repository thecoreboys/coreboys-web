import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const events = readFileSync(resolve(process.cwd(), "lib/social-events.ts"), "utf8");

test("reconciled social posts refresh expired artwork without replacing event identity", () => {
  assert.match(events, /ON CONFLICT \(canonical_id\) DO UPDATE[\s\S]*?SET artwork_url = COALESCE\(EXCLUDED\.artwork_url, social_content_events\.artwork_url\)/);
  assert.match(events, /WHERE EXCLUDED\.artwork_url IS NOT NULL[\s\S]*?artwork_url IS DISTINCT FROM EXCLUDED\.artwork_url/);
  assert.match(events, /\(xmax = 0\) AS created/);
  assert.match(events, /const created = inserted\.rows\[0\]\?\.created === true/);
});

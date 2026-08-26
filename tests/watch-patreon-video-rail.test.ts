import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const ingestion = readFileSync(resolve(root, "lib/watch/patreon.ts"), "utf8");
const shelf = readFileSync(resolve(root, "components/watch/PatreonLockedShelf.tsx"), "utf8");

test("Patreon ingestion accepts only real locked video posts and has no benefit fallback", () => {
  assert.match(ingestion, /if \(!postType\.includes\("video"\)\) continue/);
  assert.match(ingestion, /label: "Exclusive video"/);
  assert.doesNotMatch(ingestion, /FALLBACK_ITEMS|rewardPattern|Member benefit/);
});

test("Patreon rail renders every discovered video before one final unlock card", () => {
  assert.match(shelf, /data\.items\.map\(\(item, index\) =>/);
  assert.doesNotMatch(shelf, /\.slice\(|PatreonFilter|FILTERS|Member benefit/);
  assert.ok(shelf.indexOf("data.items.map") < shelf.indexOf("<UnlockCard"));
  assert.equal((shelf.match(/<UnlockCard/g) ?? []).length, 1);
  assert.match(shelf, />\s*Exclusive video\s*</);
});

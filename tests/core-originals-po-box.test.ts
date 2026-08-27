import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("CORE PO Box Openings is available in both Originals data paths", () => {
  const home = read("components/watch/WatchHome.tsx");
  const originals = read("lib/core-originals.ts");
  const asset = "public/brand/events-series-challenges/core-po-box-openings.webp";

  assert.match(home, /CORE PO Box Openings/);
  assert.match(home, /core-po-box-openings\.webp/);
  assert.match(originals, /\["core-po-box-openings", "CORE PO Box Openings"/);
  assert.ok(statSync(asset).size < 500_000, "the home-rail poster should stay below 500 KB");
});

test("seeded Originals remain reachable when the database is unavailable", () => {
  const originals = read("lib/core-originals.ts");

  assert.match(originals, /catch \{/);
  assert.match(originals, /id: `seed:\$\{seedSlug\}`/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Add to DVR opens the shared login modal instead of navigating away", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/watch/mylist.ts"), "utf8");
  assert.match(source, /import \{ openAuthModal \} from "@\/lib\/auth\/modal"/);
  assert.match(source, /openAuthModal\(\{ mode: "login", next: safeReturn \}\)/);
  assert.doesNotMatch(source, /window\.location\.assign\(.*\/login/);
});

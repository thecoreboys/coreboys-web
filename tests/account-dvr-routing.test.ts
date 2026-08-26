import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("account settings and legacy My List routes converge on the signed-in DVR", () => {
  const settings = read("components/account/AccountSettingsHub.tsx");
  const dvr = read("app/dvr/page.tsx");
  const legacy = read("app/my-list/page.tsx");

  assert.match(settings, /label="Manage my DVR"[^>]+href="\/dvr"/);
  assert.doesNotMatch(settings, /\/watch\/my-list/);
  assert.match(dvr, /getCurrentFanUserId\(\)/);
  assert.match(dvr, /redirect\("\/login\?next=\/dvr"\)/);
  assert.match(legacy, /redirect\("\/dvr"/);
});

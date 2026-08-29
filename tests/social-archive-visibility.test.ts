import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function functionWindow(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing ${start}`);
  assert.ok(endIndex > startIndex, `missing ${end}`);
  return contents.slice(startIndex, endIndex);
}

test("six-month social archives use bounded catalog reads and cursor-paged X history", () => {
  const persisted = source("lib/social-feed-events.ts");
  const feed = source("lib/social-feed.ts");
  const catalog = source("lib/watch/catalog.ts");
  const xArchive = source("app/channels/[slug]/x/page.tsx");

  assert.match(
    persisted,
    /export const PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT = 10_000/,
  );
  assert.match(
    persisted,
    /Math\.min\(\s*PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT,\s*Math\.max\(0, Math\.floor\(limit\)\)/,
  );
  assert.match(
    persisted,
    /WHERE provider IN \('instagram','tiktok','x'\)/,
  );
  assert.match(persisted, /row\.provider === "x"[\s\S]*\/\\\/status\\\/\(\\d\{5,25\}\)\//);
  assert.match(persisted, /row\.provider === "instagram" \? "ig" : "x"/);
  assert.match(
    feed,
    /getPersistedPublicSocialFeed\(\s*"house",\s*Math\.min\(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT, Math\.max\(768, limit\)\)/,
  );
  assert.match(
    feed,
    /getPersistedPublicSocialFeed\(\s*"core",\s*Math\.min\(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT, Math\.max\(256, limit\)\)/,
  );
  assert.match(
    catalog,
    /getCoreFeed\(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT\)/,
  );
  assert.match(
    catalog,
    /getHouseFeed\(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT\)/,
  );
  assert.match(xArchive, /getPersistedPublicXArchive/);
  assert.match(xArchive, /X_SOCIAL_ARCHIVE_PAGE_SIZE/);
  assert.match(xArchive, /archive\.nextCursor/);
});

test("archive visibility stays DB-only and progressively rendered", () => {
  const persisted = source("lib/social-feed-events.ts");
  const feed = source("lib/social-feed.ts");
  const rails = source("components/watch/CreatorPlatformRails.tsx");
  const houseRead = functionWindow(
    feed,
    "export async function getHouseFeed(",
    "export async function refreshHouseFeed(",
  );
  const coreRead = functionWindow(
    feed,
    "export async function getCoreFeed(",
    "export async function refreshCoreFeed(",
  );

  assert.match(persisted, /FROM social_content_events/);
  assert.doesNotMatch(persisted, /fetchSocialFetch|social_fetch_credit|backfill/);
  for (const publicRead of [houseRead, coreRead]) {
    assert.match(publicRead, /getPersistedPublicSocialFeed/);
    assert.doesNotMatch(publicRead, /fetchSocialFetch|refresh(?:House|Core)Feed/);
  }
  assert.match(rails, /maxItemsPerSource = 20_000/);
  assert.match(rails, /const INITIAL_MEDIA_ITEMS = 24/);
  assert.match(rails, /const MEDIA_ITEMS_STEP = 24/);
  assert.match(rails, /rail\.items\.slice\(0, visibleCount\)/);
});

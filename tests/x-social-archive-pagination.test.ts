import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  decodeXSocialArchiveCursor,
  encodeXSocialArchiveCursor,
} from "../lib/x-social-archive-cursor";

const root = process.cwd();
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("X archive cursors round-trip a stable timestamp and UUID", () => {
  const encoded = encodeXSocialArchiveCursor({
    publishedAt: "2026-08-28T15:20:10-04:00",
    eventId: "550E8400-E29B-41D4-A716-446655440000",
  });

  assert.deepEqual(decodeXSocialArchiveCursor(encoded), {
    publishedAt: "2026-08-28T19:20:10.000Z",
    eventId: "550e8400-e29b-41d4-a716-446655440000",
  });
});

test("X archive cursors reject malformed and oversized input", () => {
  assert.equal(decodeXSocialArchiveCursor("not base64!"), null);
  assert.equal(decodeXSocialArchiveCursor("a".repeat(257)), null);
  assert.equal(decodeXSocialArchiveCursor(Buffer.from(JSON.stringify({
    publishedAt: "yesterday",
    eventId: "not-a-uuid",
  })).toString("base64url")), null);
  assert.throws(() => encodeXSocialArchiveCursor({
    publishedAt: "invalid",
    eventId: "550e8400-e29b-41d4-a716-446655440000",
  }), /invalid_x_social_archive_cursor/);
});

test("X archive reads one bounded, stable database window without provider fetches", () => {
  const archive = source("lib/social-feed-events.ts");
  assert.match(archive, /X_SOCIAL_ARCHIVE_PAGE_SIZE = 48/);
  assert.match(archive, /provider='x'/);
  assert.match(archive, /member_slug IS NOT DISTINCT FROM \$1::text/);
  assert.match(archive, /published_at < \$2::timestamptz/);
  assert.match(archive, /published_at = \$2::timestamptz AND id < \$3::uuid/);
  assert.match(archive, /ORDER BY published_at DESC,id DESC/);
  assert.match(archive, /pageSize \+ 1/);
  assert.doesNotMatch(archive, /fetchSocialFetch|fetch\([^)]*x\.com/i);
});

test("channel archive is discoverable and uses cursor paging", () => {
  const page = source("app/channels/[slug]/x/page.tsx");
  const channel = source("components/watch/NetworkChannelPage.tsx");
  assert.match(page, /getPersistedPublicXArchive/);
  assert.match(page, /XTweetsRail/);
  assert.match(page, /query\.before/);
  assert.match(page, /archive\.nextCursor/);
  assert.match(page, /maxItems=\{X_SOCIAL_ARCHIVE_PAGE_SIZE\}/);
  assert.doesNotMatch(page, /getWatchCatalog|fetchSocialFetch|fetch\(/);
  assert.match(channel, /href=\{`\/channels\/\$\{channel\.slug\}\/x` as Route\}/);
});

test("migration installs the paging index and the runner includes it", () => {
  const migration = source("scripts/migrations/048_x_social_archive_paging.sql");
  const runner = source("scripts/apply-web-migrations.mjs");
  assert.match(migration, /social_content_events_x_archive_page_idx/);
  assert.match(migration, /\(provider, member_slug, published_at DESC, id DESC\)/);
  assert.match(migration, /WHERE provider = 'x'/);
  assert.match(runner, /048_x_social_archive_paging\.sql/);
});

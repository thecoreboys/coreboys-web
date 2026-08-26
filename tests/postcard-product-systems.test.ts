import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "scripts/migrations/017_postcard_product_systems.sql"),
  "utf8",
);

test("postcard product migration is registered in the web migration runner", () => {
  const runner = readFileSync(join(process.cwd(), "scripts/apply-web-migrations.mjs"), "utf8");
  assert.match(runner, /"017_postcard_product_systems\.sql"/);
  assert.match(runner, /"018_fanzone_communities\.sql"/);
  assert.ok(
    runner.indexOf('"017_postcard_product_systems.sql"')
      < runner.indexOf('"018_fanzone_communities.sql"'),
  );
});

test("postcard product migration includes every scoped product-system table", () => {
  for (const table of [
    "postcard_design_packs",
    "postcard_pack_revisions",
    "postcard_pack_assets",
    "postcard_drops",
    "postcard_drafts",
    "postcard_proof_links",
    "postcard_order_images",
    "postcard_sharing_choices",
    "postcard_recipient_acknowledgements",
    "postcard_staff_audit",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  }
});

test("published creative and staff audit records have database-level guards", () => {
  assert.match(migration, /postcard design pack ownership and member scope are immutable/);
  assert.match(migration, /submitted postcard pack revision content is immutable/);
  assert.match(migration, /approved postcard asset bytes and rights provenance are immutable/);
  assert.match(migration, /postcard_staff_audit is append-only/);
  assert.match(migration, /scheduled postcard drop requires a published pack revision/);
});

test("member-safe database projections omit private fulfillment fields", () => {
  const inbox = migration.slice(
    migration.indexOf("CREATE OR REPLACE VIEW postcard_member_inbox_safe"),
    migration.indexOf("CREATE OR REPLACE VIEW postcard_member_analytics_daily"),
  );
  assert.match(inbox, /security_barrier = TRUE/);
  assert.doesNotMatch(inbox, /return_address/);
  assert.doesNotMatch(inbox, /stripe_payment_intent/);
  assert.doesNotMatch(inbox, /status_token_hash/);
  assert.doesNotMatch(inbox, /creative_front_html/);
  assert.doesNotMatch(inbox, /creative_back_html/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "scripts/migrations/022_postcard_collectible_releases.sql"),
  "utf8",
);

test("collectible release migration follows checkout migration in the runner", () => {
  const runner = readFileSync(join(process.cwd(), "scripts/apply-web-migrations.mjs"), "utf8");
  assert.match(runner, /"021_postcard_draft_checkout\.sql"/);
  assert.match(runner, /"022_postcard_collectible_releases\.sql"/);
  assert.ok(
    runner.indexOf('"021_postcard_draft_checkout.sql"')
      < runner.indexOf('"022_postcard_collectible_releases.sql"'),
  );
});

test("collectible foundation records sealed catalog, choices, issuance, and completion", () => {
  for (const table of [
    "postcard_collectible_sets",
    "postcard_collectible_releases",
    "postcard_collectible_variants",
    "postcard_collectible_order_intents",
    "postcard_collectible_issuances",
    "postcard_collectible_set_completions",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  }
  assert.match(migration, /bundle_mode IN \('single','send_one_keep_one'\)/);
  assert.match(migration, /send_quantity = 1[\s\S]*keep_quantity = 1[\s\S]*inventory_quantity = 2/);
  assert.match(migration, /reservation_expires_at TIMESTAMPTZ DEFAULT \(NOW\(\) \+ INTERVAL '30 minutes'\)/);
  assert.match(migration, /paid-confirmed reservation/);
});

test("issuance is row-locked, capped, unique, idempotent, and live-order-only", () => {
  const functionSql = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION issue_postcard_collectible"),
    migration.indexOf("REVOKE ALL ON FUNCTION issue_postcard_collectible"),
  );
  assert.match(functionSql, /postcard_collectible_order_intents[\s\S]*FOR UPDATE/);
  assert.match(functionSql, /postcard_collectible_releases[\s\S]*FOR UPDATE/);
  assert.match(functionSql, /issued_total \+ intent_row\.inventory_quantity > release_row\.max_supply/);
  assert.match(functionSql, /variant_issued_total \+ intent_row\.inventory_quantity > variant_row\.max_supply/);
  assert.match(functionSql, /intent_row\.state = 'issued'[\s\S]*RETURN QUERY/);
  assert.match(functionSql, /order_mode <> 'live'/);
  assert.match(migration, /UNIQUE \(release_id, serial_number\)/);
  assert.match(migration, /postcard collectible issuance ledger is append-only/);
  assert.match(functionSql, /reservation_expires_at IS NOT NULL/);
  assert.match(functionSql, /state NOT IN \('active','sold_out','retired'\)/);
});

test("approved sets and releases seal membership, supply, and provenance", () => {
  assert.match(migration, /approved postcard collectible set definition is immutable/);
  assert.match(migration, /approved postcard collectible release supply and provenance are immutable/);
  assert.match(migration, /approved postcard collectible variants are immutable/);
  assert.match(migration, /requires a published revision design/);
});

test("fan-safe binder and progress views omit private order and creative fields", () => {
  const binder = migration.slice(
    migration.indexOf("CREATE OR REPLACE VIEW postcard_collectible_binder_safe"),
    migration.indexOf("CREATE OR REPLACE VIEW postcard_collectible_set_progress_safe"),
  );
  const progress = migration.slice(
    migration.indexOf("CREATE OR REPLACE VIEW postcard_collectible_set_progress_safe"),
  );
  assert.match(binder, /security_barrier = TRUE/);
  assert.match(progress, /security_barrier = TRUE/);
  for (const privateField of [
    "order_id",
    "message",
    "sender_name",
    "return_address",
    "creative_front_html",
    "creative_back_html",
    "storage_key",
    "stripe_payment_intent",
    "provider_id",
    "config",
  ]) {
    assert.doesNotMatch(binder, new RegExp(privateField), privateField);
    assert.doesNotMatch(progress, new RegExp(privateField), privateField);
  }
});

test("forward migration keeps rich-order inbox art authoritative and private", () => {
  const inbox = migration.slice(
    migration.indexOf("CREATE OR REPLACE VIEW postcard_member_inbox_safe"),
    migration.indexOf("CREATE OR REPLACE VIEW postcard_collectible_binder_safe"),
  );
  assert.match(inbox, /orders\.has_custom_art/);
  assert.doesNotMatch(inbox, /orders\.image_url/);
  assert.doesNotMatch(inbox, /postcard_order_images/);
  assert.doesNotMatch(inbox, /return_address/);
  assert.doesNotMatch(inbox, /draft_creative/);
  assert.doesNotMatch(inbox, /creative_front_html/);
});

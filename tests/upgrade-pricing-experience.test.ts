import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "components/marketing/PricingExperience.tsx"), "utf8");

test("upgrade page presents one clear membership tier with direct calls to action", () => {
  assert.match(source, /Support CORE and get beta access\./);
  assert.match(source, /joinLabel/);
  assert.match(source, /Join the CORE beta/);
  assert.match(source, /Continue to billing/);
  assert.match(source, /One plan · cancel anytime/);
  assert.match(source, /Every member gets the same beta access\./);
  assert.match(source, /Full access to current CORE beta features/);
  assert.match(source, /features may change as we improve them/);
  assert.doesNotMatch(source, /\$500/);
  assert.doesNotMatch(source, /Bronze|Silver|Gold|Premium plan/);
});

test("upgrade page keeps feature context and concise membership proof in the page", () => {
  assert.match(source, /FEATURE_FOCUS/);
  assert.match(source, /"multiview\.saved_layouts"/);
  assert.match(source, /focusFeature/);
  assert.match(source, /<FocusCallout feature=\{requestedFeature\}/);
  assert.match(source, /styles\.cleanGrid/);
  assert.match(source, /styles\.membershipCard/);
  assert.match(source, /styles\.includedCard/);
  assert.match(source, /styles\.cleanNotice/);
  assert.match(source, /styles\.cleanFaq/);
});

test("upgrade page keeps beta answers concise and preserves the free-content promise", () => {
  assert.match(source, /Simple billing, no surprises\./);
  assert.match(source, /Can I cancel\?/);
  assert.match(source, /What does beta mean\?/);
  assert.match(source, /Public content stays free\./);
  assert.match(source, /It is not a subscription to any creator/);
});

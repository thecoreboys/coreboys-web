import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "components/marketing/PricingExperience.tsx"), "utf8");

test("upgrade page presents one clear membership tier with direct calls to action", () => {
  assert.match(source, /Make CORE yours\./);
  assert.match(source, /joinLabel/);
  assert.match(source, /See what membership unlocks/);
  assert.match(source, /Full beta access · Cancel anytime · Public content stays free\./);
  assert.match(source, /One tier\. Every CORE feature\./);
  assert.match(source, /may not work as intended/);
  assert.match(source, /ongoing development and continuous updates/);
  assert.doesNotMatch(source, /\$500/);
  assert.doesNotMatch(source, /Bronze|Silver|Gold|Premium plan/);
});

test("upgrade page keeps feature context and concise membership proof in the page", () => {
  assert.match(source, /FEATURE_FOCUS/);
  assert.match(source, /"multiview\.saved_layouts"/);
  assert.match(source, /focusFeature/);
  assert.match(source, /styles\.featureGrid/);
  assert.match(source, /styles\.productVisual/);
  assert.match(source, /styles\.supportStrip/);
  assert.match(source, /styles\.freeSection/);
  assert.match(source, /styles\.faqSection/);
  assert.match(source, /styles\.finalCta/);
});

test("upgrade FAQ uses native disclosure controls and preserves the free-content promise", () => {
  assert.match(source, /<details className=\{styles\.faqItem\}>/);
  assert.match(source, /Free stays free/);
  assert.match(source, /It is not a creator subscription/);
});

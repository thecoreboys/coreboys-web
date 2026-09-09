import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "components/marketing/PricingExperience.tsx"), "utf8");

test("upgrade page presents one clear membership tier with direct calls to action", () => {
  assert.match(source, /Support CORE\. Get beta access\./);
  assert.match(source, /joinLabel/);
  assert.match(source, /Join the CORE beta/);
  assert.match(source, /Continue to billing/);
  assert.match(source, /One plan · cancel anytime/);
  assert.match(source, /Every member gets the same beta access\./);
  assert.match(source, /Full access to current CORE beta features/);
  assert.match(source, /Some may not work as intended while development and regular updates continue/);
  assert.doesNotMatch(source, /\$500/);
  assert.doesNotMatch(source, /Bronze|Silver|Gold|Premium plan/);
});

test("settings and membership use the same accessible account header", () => {
  const header = readFileSync(resolve(process.cwd(), "components/account/AccountPageHeader.tsx"), "utf8");
  const settings = readFileSync(resolve(process.cwd(), "app/account/settings/page.tsx"), "utf8");
  assert.match(source, /<AccountPageHeader/);
  assert.match(settings, /<AccountPageHeader/);
  assert.match(header, /aria-current=\{active === key \? "page" : undefined\}/);
  assert.match(header, /Membership & billing/);
  assert.match(settings, /var\(--site-header-h/);
  assert.match(settings, /grid grid-cols-1 items-start/);
  assert.match(settings, /<aside className="min-w-0/);
  assert.match(settings, /className="min-w-0 space-y-6"/);
  assert.match(settings, /overscroll-x-contain/);
  assert.match(settings, /min-h-11 shrink-0 items-center gap-2 whitespace-nowrap/);
});

test("billing summary distinguishes loading from failure and offers a retry", () => {
  const billing = readFileSync(resolve(process.cwd(), "components/account/BillingSummaryCard.tsx"), "utf8");
  assert.match(billing, /Loading your billing details/);
  assert.match(billing, /Try again/);
  assert.match(billing, /controller.abort\(\)/);
  assert.match(billing, /if \(!controller.signal.aborted\) setSummary/);
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

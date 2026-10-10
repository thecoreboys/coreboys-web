import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "components/marketing/PricingExperience.tsx"), "utf8");

test("upgrade page presents one clear membership tier with direct calls to action", () => {
  assert.match(source, /Support CORE\. Get beta access\./);
  assert.match(source, /Choose your amount/);
  assert.doesNotMatch(source, /joinLabel|Continue to billing/);
  assert.match(source, /One plan · cancel anytime/);
  assert.match(source, /Every member gets the same beta access\./);
  assert.match(source, /Full access to current CORE beta features/);
  assert.match(source, /Some may not work as intended while development and regular updates continue/);
  assert.doesNotMatch(source, /\$500/);
  assert.doesNotMatch(source, /Bronze|Silver|Gold|Premium plan/);
});

test("settings and billing share one accessible account settings shell", () => {
  const header = readFileSync(resolve(process.cwd(), "components/account/AccountPageHeader.tsx"), "utf8");
  const settings = readFileSync(resolve(process.cwd(), "app/account/settings/page.tsx"), "utf8");
  const billing = readFileSync(resolve(process.cwd(), "app/account/settings/billing/page.tsx"), "utf8");
  const layout = readFileSync(resolve(process.cwd(), "components/account/AccountSettingsLayout.tsx"), "utf8");
  assert.match(source, /<AccountPageHeader/);
  assert.doesNotMatch(settings, /<AccountPageHeader/);
  assert.doesNotMatch(header, /accountNav|Account settings|Support the site/);
  assert.match(settings, /<AccountSettingsLayout/);
  assert.match(billing, /<AccountSettingsLayout/);
  assert.match(billing, /accountMode/);
  assert.match(layout, /aria-label="Account settings"/);
  assert.match(layout, /grid-cols-\[15rem_minmax\(0,1fr\)\]/);
  assert.match(layout, /connected-accounts/);
  assert.match(layout, /\/account\/settings\/billing/);
});

test("public upgrade page keeps account-navigation tabs out of the membership pitch", () => {
  const header = readFileSync(resolve(process.cwd(), "components/account/AccountPageHeader.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "components/marketing/PricingExperience.module.css"), "utf8");
  assert.doesNotMatch(header, /<nav|accountNav/);
  assert.match(header, /CORE membership/);
  assert.match(styles, /\.cleanHeader h1 \{ max-width: 44rem/);
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

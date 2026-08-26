import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("membership copy stays direct and avoids duplicate promotional badges", () => {
  const auth = read("components/auth/AuthModal.tsx");
  const navigation = read("components/chrome/TopNav.tsx");
  const pricing = read("components/marketing/PricingExperience.tsx");
  const homeCta = read("components/marketing/SupporterCta.tsx");

  for (const source of [auth, pricing, homeCta]) {
    assert.doesNotMatch(source, /on your terms|your way|thoughtful|choose what it’s worth/i);
  }

  assert.doesNotMatch(auth, /OPTIONAL SUPPORTER|From \$3\/month/);
  assert.match(navigation, />Support the site</);
  assert.doesNotMatch(navigation, /supporterIdentity|>Supporter</);
  assert.doesNotMatch(pricing, /styles\.previewBadge|styles\.recommended|Neutral app Supporter badge/);
  assert.doesNotMatch(homeCta, /Member identity|neutral badge/);
});

test("staff and status pages use operational language", () => {
  const xAdmin = read("app/admin/x/page.tsx");
  const monitor = read("app/monitor/[slug]/MonitorClient.tsx");
  const originals = read("app/originals/[slug]/page.tsx");

  assert.match(xAdmin, /title="X posts and API usage"/);
  assert.doesNotMatch(xAdmin, /spend gates/);
  assert.doesNotMatch(monitor, /tailored for the streamer/i);
  assert.doesNotMatch(originals, /being curated/i);
});

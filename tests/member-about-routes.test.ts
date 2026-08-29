import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { legacyMemberRedirectTarget } from "../lib/member-profile-routes";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("member profile routes publish /channels canonicals", () => {
  const profile = source("app/about/[slug]/page.tsx");
  const numbers = source("app/about/[slug]/numbers/page.tsx");
  const openGraphImage = source("app/about/[slug]/opengraph-image.tsx");

  assert.match(profile, /alternates: \{ canonical: `\/channels\/\$\{member\.slug\}` \}/);
  assert.match(profile, /url: `\/channels\/\$\{member\.slug\}`/);
  assert.match(profile, /redirect\(`\/channels\/\$\{slug\}`\)/);
  assert.doesNotMatch(profile, /\/m\/\$\{/);

  assert.match(numbers, /canonical: `\/about\/\$\{member\.slug\}\/numbers`/);
  assert.match(numbers, /url: `\/about\/\$\{member\.slug\}\/numbers`/);
  assert.match(numbers, /href=\{`\/about\/\$\{member\.slug\}` as Route\}/);
  assert.match(openGraphImage, /thecoreboys\.com\/about\/\{member\.slug\}/);
});

test("legacy /m profile routes permanently redirect to their channel equivalents", () => {
  const profile = source("app/m/[slug]/page.tsx");
  const numbers = source("app/m/[slug]/numbers/page.tsx");
  const openGraphImage = source("app/m/[slug]/opengraph-image.tsx");

  assert.match(profile, /legacyMemberRedirectTarget\(slug, "profile", query\)/);
  assert.match(numbers, /legacyMemberRedirectTarget\(slug, "numbers", query\)/);
  assert.match(openGraphImage, /permanentRedirect\(`\/about\/\$\{encodeURIComponent\(slug\)\}\/opengraph-image` as Route\)/);
});

test("legacy member redirects preserve safe bookmark query parameters", () => {
  assert.equal(legacyMemberRedirectTarget("jason", "profile"), "/channels/jason");
  assert.equal(
    legacyMemberRedirectTarget("jason", "numbers", {
      range: "30d",
      compare: ["youtube", "twitch"],
      empty: undefined,
    }),
    "/about/jason/numbers?range=30d&compare=youtube&compare=twitch",
  );
  assert.equal(legacyMemberRedirectTarget("../ron", "profile"), "/channels/..%2Fron");
});

test("the sitemap advertises only canonical member profile URLs", () => {
  const sitemap = source("app/sitemap.ts");

  assert.match(sitemap, /`\$\{SITE\}\/channels\/\$\{m\.slug\}`/);
  assert.match(sitemap, /`\$\{SITE\}\/about\/\$\{m\.slug\}\/numbers`/);
  assert.doesNotMatch(sitemap, /`\$\{SITE\}\/m\/\$\{m\.slug\}/);
});

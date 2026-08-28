import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Social Fetch controls are available only through the protected admin route", () => {
  const route = read("app/api/admin/social-fetch/route.ts");
  assert.match(route, /requireAdmin/);
  assert.match(route, /requestHasSameOrigin/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /updateSocialFetchBudgetSettings\([\s\S]*actorId: auth\.id/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(route, /monthlyCreditCap: z\.number\(\)\.int\(\)\.min\(0\)\.max\(1_000_000\)/);
});

test("six-month history controls require an explicit protected admin action", () => {
  const route = read("app/api/admin/social-fetch/backfill/route.ts");
  assert.match(route, /requireAdmin/);
  assert.match(route, /requestHasSameOrigin/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /months: 6/);
  assert.match(route, /startSocialFetchBackfill/);
  assert.match(route, /pauseSocialFetchBackfill/);
  assert.match(route, /resumeSocialFetchBackfill/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.doesNotMatch(route, /export async function (?:PUT|DELETE)/);
});

test("admin control room exposes the global switch, hard cap, and private UTC usage state", () => {
  const page = read("app/admin/social-fetch/page.tsx");
  const controlRoom = read("components/admin/SocialFetchControlRoom.tsx");
  const adminHome = read("app/admin/page.tsx");

  assert.match(page, /SocialFetchControlRoom/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(controlRoom, /\/api\/admin\/social-fetch/);
  assert.match(controlRoom, /Paid refresh enabled/);
  assert.match(controlRoom, /Monthly credit cap \(UTC\)/);
  assert.match(controlRoom, /creditsCharged/);
  assert.match(controlRoom, /creditsReserved/);
  assert.match(controlRoom, /creditsRemaining/);
  assert.match(controlRoom, /currentPeriodUtc/);
  assert.match(controlRoom, /Private cutoff state/);
  assert.match(controlRoom, /Six-month history import/);
  assert.match(controlRoom, /Total import credit cap/);
  assert.match(controlRoom, /Start six-month import/);
  assert.match(controlRoom, /Pause import/);
  assert.match(controlRoom, /Resume with this cap/);
  assert.match(controlRoom, /never sends notifications for historical rows/);
  assert.match(controlRoom, /X posts for all six members plus CORE/);
  assert.match(controlRoom, /28 account and surface tasks/);
  assert.match(controlRoom, /X reserves 2/);
  assert.match(controlRoom, /I confirm this private six-month import may use up to the credit limit/);
  assert.match(adminHome, /href: "\/admin\/social-fetch"/);
});

test("admin cutoff copy promises silent fallback instead of modifying public surfaces", () => {
  const page = read("app/admin/social-fetch/page.tsx");
  const publicEmbed = read("components/watch/OfficialSocialEmbedFallback.tsx");
  const publicRails = read("components/watch/CreatorPlatformRails.tsx");

  assert.match(page, /Public feeds continue using stored posts and official platform links or embeds/);
  for (const source of [publicEmbed, publicRails]) {
    assert.doesNotMatch(source, /monthly_cap_reached|Social Fetch credit|credit cutoff|credit cap reached/i);
  }
});

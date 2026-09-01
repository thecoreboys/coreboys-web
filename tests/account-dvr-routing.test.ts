import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("account settings and legacy My List routes converge on the membership DVR", () => {
  const settings = read("components/account/AccountSettingsHub.tsx");
  const dvr = read("app/dvr/page.tsx");
  const legacy = read("app/my-list/page.tsx");
  const api = read("app/api/account/list/route.ts");
  const gate = read("components/watch/DvrMembershipGate.tsx");
  const poster = read("components/watch/PosterCard.tsx");
  const player = read("components/watch/PersistentPlayer.tsx");

  assert.match(settings, /label="Manage my DVR"[^>]+href="\/dvr"/);
  assert.doesNotMatch(settings, /\/watch\/my-list/);
  assert.match(dvr, /getCurrentFanUserId\(\)/);
  assert.match(dvr, /redirect\("\/login\?next=\/dvr"\)/);
  assert.match(dvr, /getAccountSubscriptionState/);
  assert.match(dvr, /featureId = "dvr\.extended_retention"/);
  assert.match(dvr, /DvrMembershipGate/);
  assert.match(api, /requireAccountEntitlement/);
  assert.match(api, /featureId: "dvr\.extended_retention"/);
  assert.match(api, /status: 403/);
  assert.match(gate, /DVR is included with membership/);
  assert.match(poster, /Unlock DVR/);
  assert.match(poster, /subscription\.featureHref\("dvr\.extended_retention"\)/);
  assert.match(player, /dvrActionLoading/);
  assert.match(legacy, /redirect\("\/dvr"/);
});

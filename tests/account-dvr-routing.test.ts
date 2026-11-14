import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { listAccountMatches } from "../lib/watch/list-account";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("account settings and legacy My List routes converge on the saved library", () => {
  const settings = read("components/account/AccountSettingsHub.tsx");
  const dvr = read("app/dvr/page.tsx");
  const legacy = read("app/my-list/page.tsx");
  const api = read("app/api/account/list/route.ts");
  const gate = read("components/watch/DvrMembershipGate.tsx");
  const poster = read("components/watch/PosterCard.tsx");
  const player = read("components/watch/PersistentPlayer.tsx");

  assert.match(settings, /label="Manage saved library"[^>]+href="\/dvr"/);
  assert.doesNotMatch(settings, /\/watch\/my-list/);
  assert.match(dvr, /getCurrentFanUserId\(\)/);
  assert.match(dvr, /redirect\("\/login\?next=\/dvr"\)/);
  assert.match(dvr, /getAccountSubscriptionState/);
  assert.match(dvr, /featureId = "dvr\.extended_retention"/);
  assert.match(dvr, /DvrMembershipGate/);
  assert.match(api, /requireAccountEntitlement/);
  assert.match(api, /featureId: "dvr\.extended_retention"/);
  assert.match(api, /status: 403/);
  assert.match(gate, /const DVR_FEATURE = "dvr\.extended_retention"/);
  assert.match(gate, /\/upgrade\?feature=\$\{encodeURIComponent\(DVR_FEATURE\)\}/);
  assert.match(gate, /<Link href=\{upgradeHref as never\}/);
  assert.match(poster, /const dvrLocked = Boolean\(user && !dvrLoading && !dvrAllowed\)/);
  assert.match(poster, /if \(!dvrAllowed\) \{[\s\S]{0,160}window\.location\.assign/);
  assert.match(poster, /subscription\.featureHref\("dvr\.extended_retention"\)/);
  assert.match(player, /dvrActionLoading/);
  assert.match(legacy, /redirect\("\/dvr"/);
});

test("DVR mutations reject a stale account identity before database writes", () => {
  assert.equal(listAccountMatches("old-tab-account", "new-cookie-account"), false);
  assert.equal(listAccountMatches("same-account", "same-account"), true);
  assert.equal(listAccountMatches(undefined, "legacy-caller-account"), true);
  const api = read("app/api/account/list/route.ts");
  for (const method of ["POST", "PUT"]) {
    const handler = api.slice(api.indexOf(`export async function ${method}`));
    const guard = handler.indexOf("listAccountMatches(parsed.data.accountId, userId)");
    assert.ok(guard > 0);
    assert.ok(guard < handler.indexOf("await ensureFanOauthSchema()"));
    assert.match(handler.slice(guard, guard + 190), /status: 409/);
  }
  assert.match(api, /return privateJson\(\{ accountId: userId, ids: await list\(userId\) \}\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountRequestMatches } from "../lib/account-request";

test("expected account protects stale tabs and navigation links against another account's cookie", () => {
  const request = (expected?: string) => new Request("https://core.test/api/account/passport", { headers: expected === undefined ? {} : { "x-core-account-id": expected } });
  assert.equal(accountRequestMatches(request("owner-a"), "owner-a"), true);
  assert.equal(accountRequestMatches(request("owner-a"), "owner-b"), false);
  assert.equal(accountRequestMatches(request(""), "owner-b"), false);
  assert.equal(accountRequestMatches(new Request("https://core.test/api/oauth/twitch/start?accountId=owner-a"), "owner-b"), false);
  assert.equal(accountRequestMatches(request(), "owner-b"), true, "legacy callers retain cookie-based auth");
});

test("Passport and connection mutations check expected account before any side effect", () => {
  for (const [file, mutation] of [
    ["app/api/account/passport/handler.ts", "performPassportAction(userId"],
    ["app/api/account/sync/route.ts", "syncProvider(uid"],
    ["app/api/oauth/[provider]/route.ts", "disconnectOauthProvider(provider"],
    ["app/api/account/loyalty/route.ts", "UPDATE fan_users"],
  ]) {
    const source = readFileSync(file!, "utf8");
    const guard = source.indexOf("accountRequestMatches(req,");
    assert.ok(guard >= 0 && guard < source.indexOf(mutation!), file);
  }
});

test("account caches verify the response owner and connections reset when auth changes", () => {
  const passport = readFileSync("hooks/usePassport.ts", "utf8");
  assert.match(passport, /dashboard\.profile\.userId !== accountId/);
  assert.match(passport, /result\.accountId !== accountId/);
  assert.match(passport, /\(\[url, accountId\]/);
  const connections = readFileSync("components/account/ConnectedAccounts.tsx", "utf8");
  assert.match(connections, /ConnectedAccountsForUser key=\{user\.id\}/);
  assert.match(connections, /payload\.accountId !== accountId/);
  assert.match(connections, /start\?accountId=/);
});

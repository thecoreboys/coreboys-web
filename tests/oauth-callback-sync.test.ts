import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("OAuth callback reports a stored connection with a failed initial sync honestly", () => {
  const callback = read("app/api/oauth/[provider]/callback/route.ts");
  const accounts = read("components/account/ConnectedAccounts.tsx");

  assert.match(callback, /const sync = await syncProvider\(uid, provider\)/);
  assert.match(callback, /oauth: sync\.ok \? "ok" : "sync-error"/);
  assert.match(accounts, /oauth === "sync-error"/);
  assert.match(accounts, /Connected \$\{provider\}, but its first sync failed/);
});

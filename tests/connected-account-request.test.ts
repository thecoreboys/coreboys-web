import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  connectedAccountError,
  readConnectedAccountResponse,
} from "../components/account/connected-account-request";

test("connected-account responses reject non-2xx API payloads", async () => {
  await assert.rejects(
    readConnectedAccountResponse(
      new Response(JSON.stringify({ error: "provider unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
      "Sync failed.",
    ),
    /Sync failed\. provider unavailable\./,
  );
});

test("connected-account responses explain an expired session", async () => {
  await assert.rejects(
    readConnectedAccountResponse(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      "Accounts failed to load.",
    ),
    /session expired/i,
  );
});

test("connected-account responses reject malformed success bodies", async () => {
  await assert.rejects(
    readConnectedAccountResponse(
      new Response("not-json", { status: 200 }),
      "Accounts failed to load.",
    ),
    /Accounts failed to load\./,
  );
});

test("connected-account responses return a valid success payload", async () => {
  const payload = await readConnectedAccountResponse<{ results: unknown[] }>(
    new Response(JSON.stringify({ results: [] }), { status: 200 }),
    "Sync failed.",
  );
  assert.deepEqual(payload, { results: [] });
  assert.equal(connectedAccountError("unknown", "Fallback"), "Fallback");
});

test("ConnectedAccounts never labels a failed or incomplete sync as successful", () => {
  const component = readFileSync(
    resolve(process.cwd(), "components/account/ConnectedAccounts.tsx"),
    "utf8",
  );
  assert.match(component, /if \(!Array\.isArray\(result\.results\)\)/);
  assert.match(component, /else if \(!result\.results\.length\)/);
  assert.match(component, /const failures = result\.results\.filter\(\(entry\) => !entry\.ok\)/);
  assert.match(component, /const syncNeedsAttention = Boolean\(conn\?\.lastSyncError\)/);
  assert.match(component, /const connectionNeedsReconnect/);
  assert.match(component, /visibleCatalog = catalog\.filter/);
  assert.match(component, /function ConnectedIdentity/);
  assert.match(component, /<ConnectedIdentity connection=\{conn\}/);
  assert.doesNotMatch(component, /Read-only connection/);
  assert.match(component, /oauth === "sync-error"/);
});

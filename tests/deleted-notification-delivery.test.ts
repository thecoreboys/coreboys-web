import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function deliveryWorker(removedAfterClaim: boolean) {
  const filename = path.resolve("lib/social-delivery.ts");
  const module = { exports: {} as { drainSocialNotificationDeliveries: () => Promise<{ sent: number; skipped: number }> } };
  const emails: Array<{ subject: string }> = [];
  const sql: string[] = [];
  const row = { id: "delivery", event_id: "event", channel: "email", user_id: "fan", provider: "x",
    member_slug: "lacy", content_type: "post", title: "Stale title at claim", body: "Original body", href: "https://x.com/LacyHimself/status/123456789", artwork_url: null, attempts: 1 };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, URL,
    process: { env: { SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED: "true" } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "web-push") return {};
      if (name === "@/lib/social-alert") return { socialAlertLabel: () => "New post" };
      if (name === "@/lib/social-event-normalization") return { socialNotificationMaxAgeMs: () => 3600000 };
      if (name === "@/lib/notifications/resend") return {
        getResendReadiness: () => ({ configured: true, enabled: true, readyToSend: true, missing: [], invalid: [] }),
        sendEmailWithResend: async (email: { subject: string }) => { emails.push(email); },
      };
      if (name === "@/lib/db") return { query: async (query: string) => {
        sql.push(query);
        if (query.includes("WITH terminal")) return { rows: [{ ...row }] };
        if (query.includes("SELECT u.email")) return { rows: [{ email: "fan@example.test", email_verified: true, enabled: true, rule_enabled: true, email_enabled: true }] };
        if (query.includes("SELECT e.title")) return { rows: removedAfterClaim ? [] : [{ title: "Current title", body: "Current body", href: row.href, artwork_url: null }] };
        return { rows: [] };
      } };
      throw new Error(name);
    },
  }, { filename });
  return { run: module.exports.drainSocialNotificationDeliveries, emails, sql };
}

test("a post removed after a worker claim never produces a delayed email", async () => {
  const worker = deliveryWorker(true);
  const result = await worker.run();
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(worker.emails, []);
  assert.ok(worker.sql.some((sql) => sql.includes("e.removed_at IS NULL")));
});

test("still-available notifications use current content instead of the claimed stale copy", async () => {
  const worker = deliveryWorker(false);
  const result = await worker.run();
  assert.equal(result.sent, 1);
  assert.equal(worker.emails[0]?.subject, "New post: Current title");
});

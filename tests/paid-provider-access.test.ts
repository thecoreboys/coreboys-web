import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { planIncludesFeature } from "../lib/subscriptions/catalog";

test("paid provider access fails closed for signed-out, free, and unavailable accounts", async () => {
  let userId: string | null = null;
  let result: "allowed" | "denied" | "unavailable" = "allowed";
  class Denied extends Error {}
  const imports: Record<string, unknown> = {
    "server-only": {},
    "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    "@/lib/fan-auth": { getCurrentFanUserId: async () => userId },
    "@/lib/subscriptions/entitlements": {
      EntitlementDeniedError: Denied,
      requireAccountEntitlement: async () => {
        if (result === "denied") throw new Denied();
        if (result === "unavailable") throw new Error("unavailable");
      },
    },
  };
  const code = transpileModule(readFileSync("lib/subscriptions/paid-provider-access.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as { requirePaidProviderAccess(request: Request, feature: string): Promise<{ ok: boolean; response?: Response; userId?: string }> };
  vm.runInNewContext(`(function(exports, require) { ${code}\n })`, { URL })(api, (id: string) => { assert.ok(id in imports); return imports[id]; });
  const request = new Request("https://thecoreboys.com/api/concierge");
  assert.equal((await api.requirePaidProviderAccess(request, "ai.concierge")).response?.status, 401);
  userId = "fan-1";
  result = "denied";
  assert.equal((await api.requirePaidProviderAccess(request, "ai.concierge")).response?.status, 403);
  result = "unavailable";
  assert.equal((await api.requirePaidProviderAccess(request, "ai.concierge")).response?.status, 503);
  result = "allowed";
  assert.equal((await api.requirePaidProviderAccess(request, "ai.concierge")).userId, "fan-1");
});

test("paid provider features require membership while public playback remains free", () => {
  for (const feature of ["ai.concierge", "ai.stream_context", "social.x_actions", "community.ai_moderated_submissions", "postcard.order"] as const) {
    assert.equal(planIncludesFeature("free", feature), false);
    assert.equal(planIncludesFeature("plus", feature), true);
  }
  assert.equal(planIncludesFeature("free", "playback.public"), true);
});

test("provider routes check membership before starting billable work", () => {
  const routes = [
    ["app/api/concierge/route.ts", 'requirePaidProviderAccess(req, "ai.concierge")', "reserveAiUsage({"],
    ["app/api/stream-context/[login]/route.ts", 'requirePaidProviderAccess(req, "ai.stream_context")', "reserveAiUsage({"],
    ["app/api/x/actions/route.ts", 'requirePaidProviderAccess(request, "social.x_actions")', "performXNativeAction(userId"],
    ["app/api/fanzone/communities/questions/route.ts", 'requirePaidProviderAccess(request, "community.ai_moderated_submissions")', "createCommunityQuestion(userId"],
    ["app/api/fanzone/communities/ideas/route.ts", 'requirePaidProviderAccess(request, "community.ai_moderated_submissions")', "createCommunityIdea(userId"],
    ["app/api/postcard/create-intent/route.ts", 'requirePaidProviderAccess(req, "postcard.order")', "await moderateText("],
  ];
  for (const [file, gate, paidWork] of routes) {
    const source = readFileSync(file!, "utf8");
    const gatePosition = source.indexOf(gate!);
    assert.ok(gatePosition >= 0 && gatePosition < source.indexOf(paidWork!), file);
    assert.match(source.slice(gatePosition), /if \(!access\.ok\) return access\.response/);
  }
});

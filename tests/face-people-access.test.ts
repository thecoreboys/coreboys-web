import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { FaceWatchContentIdSchema } from "../lib/face-recognition-contracts";
import { parseFacePresenceAtMs } from "../lib/face-recognition-policy";
import { CreatorInput } from "../lib/creator-tags/model";
import { FaceGuestProfileSchema, FacePersonSlugSchema, FaceProfileReviewInput, type FaceGuestProfile } from "../lib/face-people";

test("research approval requires admin access, same origin and an explicit current review", async () => {
  let admin = false;
  let sameOrigin = true;
  const writes: unknown[] = [];
  const imports: Record<string, unknown> = {
    "@/lib/admin-api": { requireAdmin: async () => admin ? { ok: true, id: "reviewer" } : { ok: false, response: Response.json({}, { status: 403 }) } },
    "@/lib/face-people": { FacePersonSlugSchema, FaceProfileReviewInput },
    "@/lib/x/security": { requestHasSameOrigin: () => sameOrigin },
    "@/lib/face-recognition-http": {
      facePrivateJson: (body: unknown, status = 200) => Response.json(body, { status }), facePrivateResponse: (response: Response) => response,
      faceRequestId: () => "review-test", faceStoreErrorResponse: (error: unknown) => { throw error; },
    },
    "@/lib/face-recognition-store": { reviewFaceGuestProfile: async (...args: unknown[]) => { writes.push(args); return { status: "approved" }; } },
  };
  const source = transpileModule(readFileSync("app/api/admin/faces/people/[slug]/review/route.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as { POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> };
  vm.runInNewContext(`(function(exports, require) { ${source}\n })`)(api, (id: string) => { assert.ok(id in imports); return imports[id]; });
  const body = { decision: "approved", version: "latest-revision", note: "Checked official channel and photo" };
  const post = (input = body) => api.POST(new Request("https://thecoreboys.com/api/admin/faces/people/guest/review", { method: "POST", body: JSON.stringify(input) }), { params: Promise.resolve({ slug: "guest" }) });
  assert.equal((await post()).status, 403);
  admin = true; sameOrigin = false;
  assert.equal((await post()).status, 403);
  sameOrigin = true;
  assert.equal((await post({ ...body, version: "" })).status, 400);
  assert.equal((await post({ ...body, note: "" })).status, 400);
  assert.equal((await post({ ...body, subjectApproved: true } as typeof body)).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await post()).status, 200);
  assert.equal(writes.length, 1);
});

test("AI presence preserves creator-tag membership access before any identity lookup", async () => {
  for (const allowed of [false, true]) {
    let reads = 0;
    const imports: Record<string, unknown> = {
      "@/lib/creator-tags/access": { requireCreatorTagAccess: async () => allowed ? { ok: true } : { ok: false, response: Response.json({ error: "plan_required" }, { status: 403 }) } },
      "@/lib/face-recognition-contracts": { FaceWatchContentIdSchema },
      "@/lib/face-recognition-policy": { facePresencePublicIsEnabled: () => true, parseFacePresenceAtMs },
      "@/lib/face-recognition-http": { facePublicJson: (body: unknown, status = 200) => Response.json(body, { status }) },
      "@/lib/face-recognition-store": { getPublicFacePresence: async () => { reads++; return { tags: [] }; } },
    };
    const source = transpileModule(readFileSync("app/api/watch/presence/route.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const api = {} as { GET(request: Request): Promise<Response> };
    vm.runInNewContext(`(function(exports, require) { ${source}\n })`, { URL })(api, (id: string) => {
      assert.ok(id in imports, `Unexpected dependency: ${id}`);
      return imports[id];
    });
    const response = await api.GET(new Request("https://thecoreboys.com/api/watch/presence?contentId=vod-123&atMs=1000"));
    assert.equal(response.status, allowed ? 200 : 403);
    assert.equal(reads, allowed ? 1 : 0);
  }
});

test("only admins can import saved guest metadata, preserving channels without enrolling a face", async () => {
  let admin = true;
  let sameOrigin = true;
  let reads = 0;
  const saved: Array<{ profile: FaceGuestProfile; mode: string }> = [];
  const guest = CreatorInput.parse({ id: "guest-streamer", name: "Guest Streamer", aliases: [], socials: [
    { platform: "twitch", url: "https://www.twitch.tv/guest_streamer" },
    { platform: "youtube", url: "https://www.youtube.com/@gueststreamer" },
    { platform: "kick", url: "https://kick.com/gueststreamer" },
  ] });
  const imports: Record<string, unknown> = {
    "@/lib/admin-api": { requireAdmin: async () => admin ? { ok: true, id: "admin" } : { ok: false, response: Response.json({}, { status: 401 }) } },
    "@/lib/creator-tags/model": { CreatorInput },
    "@/lib/creator-tags/store": { creatorDirectory: async () => { reads++; return [guest, { ...guest, id: "core-member" }, { ...guest, id: "inactive", active: false }]; } },
    "@/lib/face-people": { FaceGuestProfileSchema },
    "@/lib/face-recognition-http": {
      facePrivateJson: (body: unknown, status = 200) => Response.json(body, { status }),
      facePrivateResponse: (response: Response) => response,
      faceRequestId: () => "test-request",
      faceStoreErrorResponse: (error: unknown) => { throw error; },
    },
    "@/lib/face-recognition-store": {
      listFaceGuestProfiles: async () => saved.map(({ profile }) => profile),
      saveFaceGuestProfile: async (profile: FaceGuestProfile, mode: string) => { saved.push({ profile, mode }); return profile; },
    },
    "@/lib/members": { MEMBERS: [{ slug: "core-member" }], CREW: [] },
    "@/lib/x/security": { requestHasSameOrigin: () => sameOrigin },
  };
  const source = transpileModule(readFileSync("app/api/admin/faces/people/directory/route.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as { GET(): Promise<Response>; POST(request: Request): Promise<Response> };
  vm.runInNewContext(`(function(exports, require) { ${source}\n })`, { URL })(api, (id: string) => {
    assert.ok(id in imports, `Unexpected dependency: ${id}`);
    return imports[id];
  });
  const post = (creatorId: string) => api.POST(new Request("https://thecoreboys.com/api/admin/faces/people/directory", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId, displayName: "Untrusted name", consent: true }),
  }));
  admin = false;
  assert.equal((await api.GET()).status, 401);
  assert.equal((await post(guest.id)).status, 401);
  assert.equal(reads, 0);
  admin = true;
  sameOrigin = false;
  assert.equal((await post(guest.id)).status, 403);
  assert.equal(reads, 0);
  sameOrigin = true;
  assert.deepEqual((await (await api.GET()).json()).creators, [{ id: guest.id, name: guest.name }]);
  assert.equal((await post("core-member")).status, 400);
  assert.equal((await post("inactive")).status, 404);
  assert.equal((await post("missing")).status, 404);
  assert.equal(saved.length, 0);
  assert.equal((await post(guest.id)).status, 201);
  const created = saved[0];
  assert.ok(created);
  assert.equal(created.mode, "create");
  assert.equal(created.profile.displayName, guest.name);
  assert.equal(created.profile.twitchLogin, "guest_streamer");
  assert.deepEqual(created.profile.socialLinks, guest.socials);
  assert.equal("consent" in created.profile, false);
  assert.equal((await post(guest.id)).status, 200);
  const updated = saved[1];
  assert.ok(updated);
  assert.equal(updated.mode, "update");
});

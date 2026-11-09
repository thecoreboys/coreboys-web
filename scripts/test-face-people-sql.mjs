/** End-to-end metadata regression in a disposable, loopback-only PostgreSQL container. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import pg from "pg";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const container = `core-face-people-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let client;
let pool;
let started = false;
const priorPublicGate = process.env.FACE_PRESENCE_PUBLIC_ENABLED;

try {
  docker("run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:16-alpine");
  started = true;
  const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
  // Wait for the final TCP server, not PostgreSQL's temporary bootstrap server.
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); break; }
    catch (error) { if (attempt === 59) throw error; await new Promise((done) => setTimeout(done, 300)); }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    client = new pg.Client({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password, connectionTimeoutMillis: 1000 });
    try { await client.connect(); break; } catch (error) {
      await client.end().catch(() => {});
      if (attempt === 29) throw error;
      await new Promise((done) => setTimeout(done, 300));
    }
  }
  await client.query("CREATE TABLE admin_users (id uuid PRIMARY KEY, email text)");
  await client.query("CREATE ROLE core_face_worker NOLOGIN");
  for (const file of ["024_face_presence.sql", "056_face_guest_profiles.sql", "056_face_guest_profiles.sql"]) {
    await client.query(readFileSync(resolve(root, "scripts/migrations", file), "utf8"));
  }

  const db = {
    query: (...args) => pool.query(...args),
    withTransaction: async (run) => {
      const connection = await pool.connect();
      await connection.query("BEGIN");
      try { const result = await run(connection); await connection.query("COMMIT"); return result; }
      catch (error) { await connection.query("ROLLBACK"); throw error; }
      finally { connection.release(); }
    },
  };
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password, max: 3 });
  const loaded = new Map();
  const dependencies = {
    "server-only": {},
    "@/lib/db": db,
    "@/lib/members": { MEMBERS: [], CREW: [], MEMBERS_BY_SLUG: {} },
    "@/lib/asset-manifest.json": {},
  };
  function loadModule(file) {
    if (loaded.has(file)) return loaded.get(file);
    const exports = {};
    loaded.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInThisContext(`(function(exports, require, process) { ${source}\n })`, { filename: file })(exports, (id) => {
      if (id in dependencies) return dependencies[id];
      if (id.startsWith("@/")) return loadModule(resolve(root, `${id.slice(2)}.ts`));
      if (id.startsWith(".")) return loadModule(resolve(dirname(file), `${id}.ts`));
      return require(id);
    }, process);
    return exports;
  }
  const store = loadModule(resolve(root, "lib/face-recognition-store.ts"));
  const contracts = loadModule(resolve(root, "lib/face-recognition-contracts.ts"));
  const profiles = loadModule(resolve(root, "lib/face-people.ts"));
  const publicParser = loadModule(resolve(root, "lib/face-presence-public.ts"));
  const actor = { id: randomUUID(), email: "fixture-admin@example.invalid" };
  const context = { actor, requestId: "face-people-regression" };
  await client.query("INSERT INTO admin_users(id,email) VALUES ($1,$2)", [actor.id, actor.email]);
  const guest = profiles.FaceGuestProfileSchema.parse({ slug: "fixture-guest", displayName: "Fixture guest", twitchLogin: "fixture_guest", youtubeUrl: "https://www.youtube.com/@fixtureguest" });
  await store.saveFaceGuestProfile(guest, "create", context);
  assert.equal((await store.listFaceGuestProfiles()).length, 1);
  assert.equal((await store.listFaceIdentities()).length, 0, "Saving a profile must never enroll it");
  assert.equal(await store.getPublicFaceGuestProfile(guest.slug), null);
  await assert.rejects(store.saveFaceGuestProfile(guest, "create", context), /already used/);
  await assert.rejects(store.saveFaceGuestProfile({ ...guest, slug: "duplicate-account" }, "create", context), /already belongs/);
  await assert.rejects(client.query("INSERT INTO face_identities(canonical_kind,canonical_slug,display_name,created_by) VALUES ('guest','missing','Missing',$1)", [actor.id]), /foreign key/);

  const contentIds = ["yt-fixture1234", "vod-123456", "clip-twitch-fixture1234"];
  const consent = {
    consentVersion: "test-v1", captureMethod: "signed_release", evidenceRef: "fixture-release",
    consentTextSha256: "a".repeat(64), subjectConfirmedAdult: true,
    adultVerifiedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    permissions: { allowTemplateCreation: false, allowLiveMatching: false, allowArchiveMatching: false, allowPublicTag: true, allowProfileLinks: true },
    approvedContentIds: contentIds,
    approvedArchiveScopes: contentIds.map((contentId) => ({ contentId, startMs: 1000, endMs: 5000 })),
  };
  const identity = await store.createFaceIdentity(contracts.FaceIdentityCreateSchema.parse({ canonicalKind: "guest", canonicalSlug: guest.slug, consent }), context);
  await assert.rejects(client.query("DELETE FROM face_guest_profiles WHERE slug=$1", [guest.slug]), /foreign key/);
  await client.query("SET ROLE core_face_worker");
  const registryCode = readFileSync(resolve(root, "workers/face-analyzer/face_analyzer/registry.py"), "utf8");
  for (const match of registryCode.matchAll(/cursor\.execute\("""([\s\S]*?)"""\)/g)) await client.query(match[1]);
  await assert.rejects(client.query("SELECT * FROM face_guest_profiles"), /permission denied/);
  await client.query("RESET ROLE");
  const overview = await store.getFaceAdminOverview();
  assert.equal(overview.people[0].key, `guest:${guest.slug}`);
  assert.equal(overview.identities[0].enrollmentStatus, "not_enrolled");
  process.env.FACE_PRESENCE_PUBLIC_ENABLED = "true";
  for (const contentId of contentIds) {
    const source = await store.createFaceSource(contracts.FaceSourceCreateSchema.parse({ contentId, displayName: contentId, provider: contentId.startsWith("yt-") ? "youtube" : "twitch", sourceKind: "archive", state: "active" }), context);
    const track = await store.createManualFaceTrack({ sourceId: source.id, identityId: identity.id, startMs: 1000, endMs: 4000 }, context);
    assert.equal((await store.getPublicFacePresence(contentId, 2000)).tags.length, 0);
    await assert.rejects(store.reviewFaceTrack(track.id, { action: "publish" }, context), /human approval/);
    await store.reviewFaceTrack(track.id, { action: "approve", sourceMomentVerified: true, confidenceBand: "reviewed" }, context);
    await store.reviewFaceTrack(track.id, { action: "publish" }, context);
    const visible = publicParser.parsePublicFacePresenceResponse(await store.getPublicFacePresence(contentId, 2000));
    assert.equal(visible.tags[0].displayName, guest.displayName);
    assert.equal(visible.tags[0].profileHref, `/people/${guest.slug}`);
    assert.equal(visible.tags[0].socialLinks[0].url, "https://www.twitch.tv/fixture_guest");
    assert.equal((await store.getPublicFacePresence(contentId, 999)).tags.length, 0);
    assert.equal((await store.getPublicFacePresence(contentId, 4000)).tags.length, 0);
    assert.equal((await store.getPublicFacePresence(contentId, null)).tags.length, 0, "Archive tags cannot appear live");
    await assert.rejects(store.createManualFaceTrack({ sourceId: source.id, identityId: identity.id, startMs: 0, endMs: 4000 }, context), /outside/);
  }
  await store.saveFaceGuestProfile({ ...guest, displayName: "Updated guest" }, "update", context);
  assert.equal((await store.getPublicFacePresence(contentIds[0], 2000)).tags[0].displayName, "Updated guest");
  assert.equal((await store.getPublicFaceGuestProfile(guest.slug)).displayName, "Updated guest");
  assert.equal((await store.getFaceAdminOverview()).published.length, 3);
  await store.updateFaceIdentity(identity.id, { action: "revoke_consent", reason: "Fixture consent withdrawn" }, context);
  for (const contentId of contentIds) assert.equal((await store.getPublicFacePresence(contentId, 2000)).tags.length, 0);
  assert.equal(await store.getPublicFaceGuestProfile(guest.slug), null);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM face_audit_log WHERE action LIKE 'guest_profile.%'")).rows[0].count, 2);
  console.log("PASS: guest persistence, duplicate protection, consent, review, YouTube/Twitch VOD/clip tag metadata, time boundaries, profile updates, revocation and audit; disposable database only.");
} finally {
  if (priorPublicGate === undefined) delete process.env.FACE_PRESENCE_PUBLIC_ENABLED;
  else process.env.FACE_PRESENCE_PUBLIC_ENABLED = priorPublicGate;
  await pool?.end().catch(() => {});
  await client?.end().catch(() => {});
  if (started) docker("stop", container);
}

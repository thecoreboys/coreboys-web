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
import { importResearch, parseResearchManifest } from "./import-face-profile-research.mjs";

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
  await client.query("CREATE TABLE admin_users (id uuid PRIMARY KEY, email text, role text DEFAULT 'admin', deleted_at timestamptz)");
  await client.query("CREATE ROLE core_face_worker NOLOGIN");
  await client.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated");
  for (const file of ["024_face_presence.sql", "056_face_guest_profiles.sql", "056_face_guest_profiles.sql", "057_face_site_enrollment.sql", "057_face_site_enrollment.sql", "061_face_private_access.sql", "061_face_private_access.sql", "062_face_profile_review.sql", "062_face_profile_review.sql"]) {
    await client.query(readFileSync(resolve(root, "scripts/migrations", file), "utf8"));
  }

  for (const role of ["anon", "authenticated"]) {
    await client.query(`SET ROLE ${role}`);
    await assert.rejects(client.query("SELECT * FROM face_enrollment_jobs"),/permission denied/);
    await assert.rejects(client.query("SELECT * FROM face_presence_public_safe"),/permission denied/);
    await assert.rejects(client.query("SELECT claim_face_enrollment('untrusted')"),/permission denied/);
    await assert.rejects(client.query("SELECT purge_face_audit_retention()"),/permission denied/);
    assert.equal((await client.query(`SELECT count(*)::int AS accessible FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname ~ '(^face_|_face_)' AND has_function_privilege(current_user,p.oid,'EXECUTE')`)).rows[0].accessible,0);
    await client.query("RESET ROLE");
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
  const createInput = contracts.FaceIdentityCreateSchema.parse({ canonicalKind: "guest", canonicalSlug: guest.slug, consent });
  await client.query(`UPDATE face_guest_profiles SET research=$2::jsonb, review_status='pending' WHERE slug=$1`, [guest.slug, JSON.stringify({ checkedAt: new Date().toISOString(), sources: [{ label: "Twitch profile", url: "https://www.twitch.tv/fixture_guest" }], note: "Public metadata; permission still needed." })]);
  const pendingProfile = (await store.listFaceGuestProfiles())[0];
  await assert.rejects(store.createFaceIdentity(createInput, context), /admin must approve/);
  await assert.rejects(store.reviewFaceGuestProfile(guest.slug, { decision: "approved", version: "stale", note: "Checked source" }, context), /changed/);
  await store.reviewFaceGuestProfile(guest.slug, { decision: "needs_changes", version: pendingProfile.review.version, note: "Correct channel first" }, context);
  await assert.rejects(store.createFaceIdentity(createInput, context), /admin must approve/);
  await store.saveFaceGuestProfile({ ...guest, avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/test-profile_image-300x300.png", avatarSourceProfile: "https://www.twitch.tv/fixture_guest", avatarCheckedAt: new Date().toISOString() }, "update", context);
  let reviewedProfile = (await store.listFaceGuestProfiles())[0];
  assert.equal(reviewedProfile.review.status, "pending");
  assert.ok(reviewedProfile.avatarUrl);
  await store.reviewFaceGuestProfile(guest.slug, { decision: "approved", version: reviewedProfile.review.version, note: "Checked name, channel and picture" }, context);
  assert.equal((await store.listFaceIdentities()).length, 0, "Profile approval must not create consent or identity");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM face_reference_assets")).rows[0].n, 0);
  const identity = await store.createFaceIdentity(createInput, context);
  const publicProfile = await store.getPublicFaceGuestProfile(guest.slug);
  assert.equal(publicProfile, null, "Public switch is still disabled");
  // Later metadata edits must require a fresh review without losing provenance.
  await store.saveFaceGuestProfile(guest, "update", context);
  reviewedProfile = (await store.listFaceGuestProfiles())[0];
  assert.equal(reviewedProfile.review.status, "pending");
  assert.ok(reviewedProfile.review.research);
  await store.reviewFaceGuestProfile(guest.slug, { decision: "approved", version: reviewedProfile.review.version, note: "Reviewed corrected details" }, context);
  // The remaining existing integration cases exercise independent photo review,
  // time-scoped publication, withdrawal and worker enrollment against this profile.
  await client.query("UPDATE face_guest_profiles SET research=NULL WHERE slug=$1", [guest.slug]);
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
  assert.equal((await store.getPublicFaceGuestProfile(guest.slug)).profileReview, undefined, "Private review metadata must not be public");
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
  assert.equal((await client.query("SELECT count(*)::int AS count FROM face_audit_log WHERE action LIKE 'guest_profile.%'")).rows[0].count, 7);
  // Enrollment is a separate, template-only permission: no fake footage scope is needed.
  const enrolledGuest = profiles.FaceGuestProfileSchema.parse({slug:"enrollment-fixture",displayName:"Enrollment fixture"});
  await store.saveFaceGuestProfile(enrolledGuest,"create",context);
  const enrollmentIdentity = await store.createFaceIdentity(contracts.FaceIdentityCreateSchema.parse({canonicalKind:"guest",canonicalSlug:enrolledGuest.slug,
    consent:{...consent,permissions:{allowTemplateCreation:true,allowLiveMatching:false,allowArchiveMatching:false,allowPublicTag:false,allowProfileLinks:false},approvedContentIds:[],approvedArchiveScopes:[]}}),context);
  process.env.FACE_ANALYZER_ENABLED="true";
  await client.query("UPDATE face_guest_profiles SET review_status='pending' WHERE slug=$1",[enrolledGuest.slug]);
  await assert.rejects(store.queueFaceEnrollment(enrollmentIdentity.id,context),/admin must approve/);
  await client.query("UPDATE face_guest_profiles SET review_status='approved' WHERE slug=$1",[enrolledGuest.slug]);
  await client.query("SELECT heartbeat_face_worker('fixture-worker','test',false,NULL,'healthy',NULL)");
  await client.query("SELECT heartbeat_face_enrollment('fixture-worker',$1)",["a".repeat(64)]);
  await assert.rejects(store.queueFaceEnrollment(enrollmentIdentity.id,context),/at least 3/);
  const reviewer={id:randomUUID(),email:"reviewer@example.invalid"};
  await client.query("INSERT INTO admin_users(id,email) VALUES ($1,$2)",[reviewer.id,reviewer.email]);
  const referenceHashes=[];
  for(let index=1;index<=3;index++) {
    const digest=String(index).repeat(64); referenceHashes.push(digest);
    const reference=await store.registerFaceReference({identityId:enrollmentIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:digest,
      contentType:"image/webp",fileName:`fixture-${index}.webp`,sourceKind:"subject_provided",byteSize:500,width:256,height:256},context);
    await assert.rejects(store.reviewFaceReference(reference.id,{action:"approve"},context),/independent|different|second|own/);
    await store.reviewFaceReference(reference.id,{action:"approve"},{actor:reviewer,requestId:"fixture-review"});
  }
  const queued=await store.queueFaceEnrollment(enrollmentIdentity.id,context);
  assert.equal((await store.queueFaceEnrollment(enrollmentIdentity.id,context)).id,queued.id,"Enqueue is idempotent while pending");
  await client.query("SET ROLE core_face_worker");
  await assert.rejects(client.query("SELECT * FROM face_enrollment_jobs"),/permission denied/);
  const claimed=(await client.query("SELECT claim_face_enrollment('fixture-worker') AS job")).rows[0].job;
  assert.equal(claimed.id,queued.id);
  assert.equal(claimed.references.length,3);
  assert.equal((await client.query("SELECT claim_face_enrollment('fixture-worker-2') AS job")).rows[0].job,null,"Only one worker claims the request");
  const template=(await client.query("SELECT sync_face_template_set('fixture-worker',$1,$2,$3,$4,3,$5::text[],now()+interval '1 hour') AS id",
    [enrollmentIdentity.id,claimed.consent_id,"a".repeat(64),"b".repeat(64),referenceHashes])).rows[0].id;
  assert.equal((await client.query("SELECT finish_face_enrollment($1,'wrong-worker',$2,NULL) AS ok",[queued.id,template])).rows[0].ok,false);
  assert.equal((await client.query("SELECT finish_face_enrollment($1,'fixture-worker',$2,NULL) AS ok",[queued.id,template])).rows[0].ok,true);
  await client.query("RESET ROLE");
  assert.equal((await store.getFaceAdminOverview()).identities.find(person=>person.id===enrollmentIdentity.id).enrollmentStatus,"ready");
  const pending=await store.queueFaceEnrollment(enrollmentIdentity.id,context);
  await store.updateFaceIdentity(enrollmentIdentity.id,{action:"revoke_consent",reason:"Fixture permission removed"},context);
  await client.query("SELECT claim_face_enrollment('fixture-worker')");
  assert.equal((await client.query("SELECT state FROM face_enrollment_jobs WHERE id=$1",[pending.id])).rows[0].state,"failed");
  assert.equal((await store.getFaceAdminOverview()).identities.find(person=>person.id===enrollmentIdentity.id).enrollmentStatus,"revoked");
  console.log("PASS: site enrollment requires independent approved references, claims once, reports Ready only after registered templates, and rejects revoked permission.");
  const researchEntries = parseResearchManifest([{ profile: { slug: "researched-fixture", displayName: "Researched fixture", twitchLogin: "researched_fixture" }, research: {
    checkedAt: new Date().toISOString(), sources: [{ label: "Source profile", url: "https://www.twitch.tv/researched_fixture" }], note: "No subject permission supplied." } }]);
  const identityCount = (await store.listFaceIdentities()).length;
  assert.equal((await importResearch(client,researchEntries,actor.email,false)).toCreate,1);
  assert.equal((await importResearch(client,researchEntries,actor.email,true)).created,1);
  assert.equal((await store.listFaceGuestProfiles()).find(profile=>profile.slug==="researched-fixture").review.status,"pending");
  assert.equal((await importResearch(client,researchEntries,actor.email,true)).created,0,"Imports must be idempotent");
  assert.equal((await store.listFaceIdentities()).length,identityCount,"Imports must not create identities or consent");
  const staged = (await store.listFaceGuestProfiles()).find(profile=>profile.slug==="researched-fixture");
  await store.reviewFaceGuestProfile(staged.slug,{decision:"approved",version:staged.review.version,note:"Verified fixture"},context);
  await importResearch(client,researchEntries,actor.email,true);
  assert.equal((await store.listFaceGuestProfiles()).find(profile=>profile.slug===staged.slug).review.status,"approved","Reimports must preserve admin decisions");
  console.log("PASS: research staging, stale review protection, independent admin approval, private provenance and idempotent import.");
  console.log("PASS: guest persistence, duplicate protection, consent, review, YouTube/Twitch VOD/clip tag metadata, time boundaries, profile updates, revocation and audit; disposable database only.");
} finally {
  if (priorPublicGate === undefined) delete process.env.FACE_PRESENCE_PUBLIC_ENABLED;
  else process.env.FACE_PRESENCE_PUBLIC_ENABLED = priorPublicGate;
  await pool?.end().catch(() => {});
  await client?.end().catch(() => {});
  if (started) docker("stop", container);
}

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
import { importPhotoCandidates, PhotoResearchManifest } from "./import-face-photo-candidates.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const container = `core-face-people-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let client;
let pool;
let started = false;
const priorPublicGate = process.env.FACE_PRESENCE_PUBLIC_ENABLED;
const priorAutomaticGate = process.env.FACE_AUTOMATIC_MATCHING_ENABLED;

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
  await client.query("CREATE TABLE admin_users (id uuid PRIMARY KEY, email text, role text DEFAULT 'admin', deleted_at timestamptz, totp_enabled boolean DEFAULT true)");
  await client.query("CREATE ROLE core_face_worker NOLOGIN");
  await client.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated");
  for (const file of ["024_face_presence.sql", "056_face_guest_profiles.sql", "056_face_guest_profiles.sql", "057_face_site_enrollment.sql", "057_face_site_enrollment.sql", "061_face_private_access.sql", "061_face_private_access.sql", "062_face_profile_review.sql", "062_face_profile_review.sql", "063_face_photo_candidates.sql", "063_face_photo_candidates.sql", "064_face_processing_costs.sql", "064_face_processing_costs.sql", "065_face_owner_photo_review.sql", "065_face_owner_photo_review.sql"]) {
    await client.query(readFileSync(resolve(root, "scripts/migrations", file), "utf8"));
  }

  for (const role of ["anon", "authenticated"]) {
    await client.query(`SET ROLE ${role}`);
    await assert.rejects(client.query("SELECT * FROM face_enrollment_jobs"),/permission denied/);
    await assert.rejects(client.query("SELECT * FROM face_photo_candidates"),/permission denied/);
    await assert.rejects(client.query("SELECT * FROM face_browser_reviews"),/permission denied/);
    await assert.rejects(client.query("SELECT * FROM face_browser_marks"),/permission denied/);
    await assert.rejects(client.query("SELECT * FROM face_owner_photo_reviewers"),/permission denied/);
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
  const browserFixtures=[];
  for (const contentId of contentIds) {
    const source = await store.createFaceSource(contracts.FaceSourceCreateSchema.parse({ contentId, displayName: contentId, provider: contentId.startsWith("yt-") ? "youtube" : "twitch", sourceKind: "archive", state: "active" }), context);
    const metadata={sourceId:source.id,fingerprint:"a".repeat(64),algorithm:"sha256-chunks-v1-4mib",byteSize:5000,durationMs:10000,fileName:"fixture.webm"};
    const [project,duplicate]=await Promise.all([store.prepareBrowserVideoReview(metadata,context),store.prepareBrowserVideoReview({...metadata,fileName:"renamed.webm"},context)]);
    assert.equal(project.id,duplicate.id,"Concurrent identical videos reuse one saved review despite renaming");
    await assert.rejects(store.prepareBrowserVideoReview({...metadata,byteSize:6000},context),/different file metadata/);
    const mark={sourceId:source.id,browserReviewId:project.id,identityId:identity.id,startMs:1000,endMs:4000};
    browserFixtures.push(mark);
    const [track,duplicateTrack]=await Promise.all([store.createManualFaceTrack(mark,context),store.createManualFaceTrack(mark,context)]);
    assert.equal(track.id,duplicateTrack.id,"Concurrent manual marks reuse one proposal");
    await assert.rejects(store.createManualFaceTrack({...mark,endMs:11000,identityId:null},context),/duration/);
    const manualJob={sourceId:source.id,kind:"manual_review",configuration:{startMs:1000,endMs:4000}};
    const [firstJob,sameJob]=await Promise.all([store.createFaceJob({...manualJob,idempotencyKey:"random-click-one"},context),store.createFaceJob({...manualJob,idempotencyKey:"random-click-two"},context)]);
    assert.equal(firstJob.id,sameJob.id,"Random caller keys cannot create duplicate server work");
    await client.query("UPDATE face_jobs SET status='succeeded',finished_at=now() WHERE id=$1",[firstJob.id]);
    assert.equal((await store.createFaceJob(manualJob,context)).status,"succeeded","Completed work is reused without running again");
    const changedJob=await store.createFaceJob({...manualJob,configuration:{startMs:1000,endMs:4500}},context);
    assert.notEqual(changedJob.id,firstJob.id,"Changed interval requires new work");
    await client.query("UPDATE face_jobs SET status='failed',finished_at=now() WHERE id=$1",[changedJob.id]);
    assert.equal((await store.createFaceJob({...manualJob,configuration:{startMs:1000,endMs:4500}},context)).status,"failed","Failures require explicit retry");
    assert.equal((await store.getPublicFacePresence(contentId, 2000)).tags.length, 0);
    await assert.rejects(store.reviewFaceTrack(track.id, { action: "publish" }, context), /human approval/);
    await store.reviewFaceTrack(track.id, { action: "approve", sourceMomentVerified: true, confidenceBand: "reviewed" }, context);
    await store.reviewFaceTrack(track.id, { action: "publish" }, context);
    assert.equal((await store.createManualFaceTrack(mark,context)).state,"published","Resaving cannot overwrite a human review");
    const reopened=await store.prepareBrowserVideoReview(metadata,context);
    assert.equal(reopened.reused,true);assert.equal(reopened.markers[0].status,"published");
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
  assert.equal(await store.faceWorkerHasPendingWork(),false,"Completed/failed jobs and browser labels do not wake the worker");
  await store.updateFaceIdentity(identity.id, { action: "revoke_consent", reason: "Fixture consent withdrawn" }, context);
  await assert.rejects(store.createManualFaceTrack(browserFixtures[0],context),/consent|permission/);
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
  const candidates=PhotoResearchManifest.parse([1,4,5].map((n)=>({id:randomUUID(),kind:"guest",slug:n===4?guest.slug:enrolledGuest.slug,
    sourceUrl:"https://www.twitch.tv/fixture/clip/source",imageSourceUrl:`https://static-cdn.jtvnw.net/photo-${n}.jpg`,sourceLabel:"Fixture source",researchNote:"Unapproved research candidate",
    checkedAt:new Date().toISOString(),storageKey:`${randomUUID()}.webp`,contentSha256:String(n).repeat(64),byteSize:500,width:256,height:256})));
  const identitiesBefore=(await store.listFaceIdentities()).length;
  assert.equal((await importPhotoCandidates(client,candidates,actor.email,false)).toCreate,3);
  assert.equal((await importPhotoCandidates(client,candidates,actor.email,true)).created,3);
  assert.equal((await store.listFaceIdentities()).length,identitiesBefore,"Research photos never create identities");
  assert.equal((await client.query("SELECT count(*)::int n FROM face_reference_assets")).rows[0].n,0,"Research photos never become references automatically");
  assert.equal((await store.getFaceAdminOverview()).photoCandidates.length,3);
  const upload={identityId:enrollmentIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:"1".repeat(64),contentType:"image/webp",fileName:"candidate.webp",sourceKind:"licensed_archive",subjectApproved:true,byteSize:500,width:256,height:256};
  await assert.rejects(store.registerFaceReference({...upload,contentSha256:"4".repeat(64)},context,candidates[1].id),/different profile/);
  await assert.rejects(store.registerFaceReference({...upload,contentSha256:"a".repeat(64)},context,candidates[0].id),/contents changed/);
  await client.query("UPDATE face_guest_profiles SET review_status='pending' WHERE slug=$1",[enrolledGuest.slug]);
  await assert.rejects(store.registerFaceReference(upload,context,candidates[0].id),/admin must approve/);
  await client.query("UPDATE face_guest_profiles SET review_status='approved' WHERE slug=$1",[enrolledGuest.slug]);
  const referenceHashes=[];
  for(let index=1;index<=3;index++) {
    const digest=String(index).repeat(64); referenceHashes.push(digest);
    const reference=await store.registerFaceReference({identityId:enrollmentIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:digest,
      contentType:"image/webp",fileName:`fixture-${index}.webp`,sourceKind:index===1?"licensed_archive":"subject_provided",subjectApproved:true,byteSize:500,width:256,height:256},context,index===1?candidates[0].id:undefined);
    await assert.rejects(store.reviewFaceReference(reference.id,{action:"approve"},context),/independent|different|second|own/);
    await store.reviewFaceReference(reference.id,{action:"approve"},{actor:reviewer,requestId:"fixture-review"});
  }
  await assert.rejects(store.registerFaceReference(upload,context,candidates[0].id),/already reviewed/);
  assert.equal((await importPhotoCandidates(client,candidates,actor.email,true)).created,0,"Repeat import preserves photo decisions");
  assert.equal((await store.getFacePhotoCandidate(candidates[0].id)).state,"submitted");
  assert.ok((await store.listReviewedFacePhotoCandidateFiles()).some(row=>row.id===candidates[0].id));
  await store.markFacePhotoCandidateFileDeleted(candidates[0].id);
  assert.equal((await store.listReviewedFacePhotoCandidateFiles()).length,0);
  const queued=await store.queueFaceEnrollment(enrollmentIdentity.id,context);
  assert.equal(await store.faceWorkerHasPendingWork(),true,"A durable enrollment request wakes a sleeping service");
  assert.equal((await store.queueFaceEnrollment(enrollmentIdentity.id,context)).id,queued.id,"Enqueue is idempotent while pending");
  await client.query("SET ROLE core_face_worker");
  await assert.rejects(client.query("SELECT * FROM face_browser_reviews"),/permission denied/);
  await assert.rejects(client.query("SELECT * FROM face_browser_marks"),/permission denied/);
  assert.equal((await client.query("SELECT face_worker_has_pending_work('fixture-worker') pending")).rows[0].pending,true);
  await assert.rejects(client.query("SELECT * FROM face_photo_candidates"),/permission denied/);
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
  const currentModel=loadModule(resolve(root,"lib/face-processing-costs.ts")).FACE_ENROLLMENT_MODEL_VERSION;
  await client.query("UPDATE face_template_sets SET model_version=$2 WHERE id=$1",[template,currentModel]);
  const alreadyReady=await store.queueFaceEnrollment(enrollmentIdentity.id,context);
  assert.equal(alreadyReady.status,"ready");assert.equal(alreadyReady.templateSetId,template);
  assert.equal((await client.query("SELECT count(*)::int n FROM face_enrollment_jobs WHERE identity_id=$1",[enrollmentIdentity.id])).rows[0].n,1,"Unchanged approved photos reuse existing enrollment");
  const addedReference=await store.registerFaceReference({...upload,storageKey:`${randomUUID()}.webp`,contentSha256:"6".repeat(64)},context);
  await store.reviewFaceReference(addedReference.id,{action:"approve"},{actor:reviewer,requestId:"new-photo"});
  const pending=await store.queueFaceEnrollment(enrollmentIdentity.id,context);
  assert.equal(pending.reused,false,"A changed set of approved photos requires new enrollment");
  // Real archive scan caching includes settings, model/template version and consent.
  const scanGuest=profiles.FaceGuestProfileSchema.parse({slug:"scan-fixture",displayName:"Scan fixture"});
  await store.saveFaceGuestProfile(scanGuest,"create",context);
  const scanIdentity=await store.createFaceIdentity(contracts.FaceIdentityCreateSchema.parse({canonicalKind:"guest",canonicalSlug:scanGuest.slug,
    consent:{...consent,permissions:{...consent.permissions,allowTemplateCreation:true,allowArchiveMatching:true}}}),context);
  const scanConsent=(await client.query("SELECT id FROM face_consents WHERE identity_id=$1",[scanIdentity.id])).rows[0].id;
  for(let n=7;n<=9;n++){
    const photo=await store.registerFaceReference({...upload,identityId:scanIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:String(n).repeat(64)},context);
    await store.reviewFaceReference(photo.id,{action:"approve"},{actor:reviewer,requestId:"scan-photo"});
  }
  const scanTemplate=(await client.query("SELECT sync_face_template_set('fixture-worker',$1,$2,$3,$4,3,$5::text[],now()+interval '1 hour') id",
    [scanIdentity.id,scanConsent,currentModel,"c".repeat(64),[7,8,9].map(n=>String(n).repeat(64))])).rows[0].id;
  process.env.FACE_AUTOMATIC_MATCHING_ENABLED="true";
  const scanSource=await store.createFaceSource(contracts.FaceSourceCreateSchema.parse({contentId:"yt-fixture1234",displayName:"Scan source",provider:"youtube",sourceKind:"archive",state:"active",automaticMatchingEnabled:true,allVisiblePeopleConsented:true,allowedIdentityIds:[scanIdentity.id]}),context).catch(async error=>{
    if(!error.message.includes("already"))throw error;
    const id=(await client.query("SELECT id FROM face_sources WHERE content_id='yt-fixture1234'")).rows[0].id;
    await store.configureFaceSource(id,{mode:"review_only",recognitionEnabled:true,state:"active",allVisiblePeopleConsented:true,allowedIdentityIds:[scanIdentity.id]},context);
    return{id};
  });
  const scan={sourceId:scanSource.id,kind:"archive_scan",configuration:{startMs:1000,endMs:4000}};
  const scanJob=await store.createFaceJob(scan,context);
  assert.equal((await store.createFaceJob({...scan,configuration:{...scan.configuration,samplingFps:.5}},context)).id,scanJob.id,"Default and explicit sampling share a result");
  await client.query("UPDATE face_jobs SET status='succeeded',finished_at=now() WHERE id=$1",[scanJob.id]);
  assert.equal((await store.createFaceJob(scan,context)).id,scanJob.id);
  const faster=await store.createFaceJob({...scan,configuration:{...scan.configuration,samplingFps:1}},context);
  assert.notEqual(faster.id,scanJob.id,"Sampling changes require new work");
  await client.query("UPDATE face_template_sets SET template_fingerprint=$2 WHERE id=$1",[scanTemplate,"d".repeat(64)]);
  const newTemplateJob=await store.createFaceJob(scan,context);
  assert.notEqual(newTemplateJob.id,scanJob.id,"New approved templates invalidate the result cache");
  await store.updateFaceIdentity(scanIdentity.id,{action:"revoke_consent",reason:"Scan fixture revoked"},context);
  await assert.rejects(store.createFaceJob(scan,context),/consent|templates/);
  delete process.env.FACE_AUTOMATIC_MATCHING_ENABLED;
  await store.updateFaceIdentity(enrollmentIdentity.id,{action:"revoke_consent",reason:"Fixture permission removed"},context);
  await assert.rejects(store.registerFaceReference({...upload,contentSha256:"5".repeat(64)},context,candidates[2].id),/consent/);
  await store.dismissFacePhotoCandidate(candidates[2].id,"Wrong photo for this reference",context);
  assert.equal((await store.getFacePhotoCandidate(candidates[2].id)).state,"dismissed");
  await client.query("SELECT claim_face_enrollment('fixture-worker')");
  assert.equal((await client.query("SELECT state FROM face_enrollment_jobs WHERE id=$1",[pending.id])).rows[0].state,"failed");
  assert.equal((await store.getFaceAdminOverview()).identities.find(person=>person.id===enrollmentIdentity.id).enrollmentStatus,"revoked");
  console.log("PASS: site enrollment requires independent approved references, claims once, reports Ready only after registered templates, and rejects revoked permission.");
  console.log("PASS: browser video/marks and concurrent scan requests reuse saved work, preserve reviewed labels, invalidate changed settings/templates and recheck revoked permissions.");
  console.log("PASS: researched photo imports remain private and unapproved; submission checks exact photo, profile, consent, independent review and repeat-safe decisions; reviewed copies enter file cleanup.");
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
  const owner={id:randomUUID(),email:"owner-photos@example.invalid"},ownerContext={actor:owner,requestId:"owner-photo-fixture"};
  await client.query("INSERT INTO admin_users(id,email) VALUES ($1,$2)",[owner.id,owner.email]);
  const ownerGuest=profiles.FaceGuestProfileSchema.parse({slug:"owner-photo-fixture",displayName:"Owner photo fixture"});
  await store.saveFaceGuestProfile(ownerGuest,"create",ownerContext);
  const ownerConsent={...consent,captureMethod:"owner_attested_email",evidenceRef:"Owner fixture email-permission attestation",
    permissions:{allowTemplateCreation:true,allowLiveMatching:false,allowArchiveMatching:false,allowPublicTag:false,allowProfileLinks:false},approvedContentIds:[],approvedArchiveScopes:[]};
  const ownerInput=contracts.FaceIdentityCreateSchema.parse({canonicalKind:"guest",canonicalSlug:ownerGuest.slug,consent:ownerConsent});
  await assert.rejects(store.createFaceIdentity(ownerInput,ownerContext),/not enabled/);
  await client.query("INSERT INTO face_owner_photo_reviewers(admin_user_id,grant_source) VALUES ($1,'Explicit synthetic owner workflow request')",[owner.id]);
  await client.query("UPDATE admin_users SET totp_enabled=false WHERE id=$1",[owner.id]);
  assert.equal(await store.getFaceOwnerPhotoReviewAllowed(owner.id),false);
  await assert.rejects(store.createFaceIdentity(ownerInput,ownerContext),/not enabled/);
  await client.query("UPDATE admin_users SET totp_enabled=true WHERE id=$1",[owner.id]);
  assert.equal((await store.getFaceAdminOverview(owner.id)).ownerPhotoReviewAllowed,true);
  assert.equal((await store.getFaceAdminOverview(actor.id)).ownerPhotoReviewAllowed,false,"Being an admin does not grant owner review");
  const ownerIdentity=await store.createFaceIdentity(ownerInput,ownerContext);
  const ownerHashes=["a","b","c"].map(x=>x.repeat(64));const ownerRefs=[];
  for(const hash of ownerHashes){
    const ref=await store.registerFaceReference({...upload,identityId:ownerIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:hash},ownerContext);ownerRefs.push(ref.id);
    await assert.rejects(store.reviewFaceReference(ref.id,{action:"approve",note:"Cannot impersonate independent review"},ownerContext),/different/);
    await assert.rejects(store.reviewFaceReference(ref.id,{action:"approve_owner",ownerConfirmed:true,note:"No owner entitlement"},context),/not enabled/);
    await assert.rejects(store.reviewFaceReference(ref.id,{action:"approve_owner",ownerConfirmed:false,note:"Missing explicit confirmation"},ownerContext),/Explicit owner confirmation/);
    await assert.rejects(client.query("UPDATE face_reference_assets SET state='approved',review_mode='owner',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[ref.id,actor.id]),/not enabled/);
    await store.reviewFaceReference(ref.id,{action:"approve_owner",ownerConfirmed:true,note:"Synthetic owner confirms image quality and exact-photo permission"},ownerContext);
    assert.equal((await client.query("SELECT face_reference_review_is_valid($1) valid",[ref.id])).rows[0].valid,true);
  }
  assert.ok((await store.listFaceReferences(ownerIdentity.id)).every(r=>r.reviewMode==="owner"&&r.status==="accepted"));
  assert.equal((await client.query("SELECT count(*)::int n FROM face_audit_log WHERE action='reference.approve_owner' AND actor_id=$1 AND after_state->>'reviewMode'='owner'",[owner.id])).rows[0].n,3);
  assert.equal((await client.query("SELECT count(*)::int n FROM face_enrollment_jobs WHERE identity_id=$1",[ownerIdentity.id])).rows[0].n,0,"Owner review alone never starts enrollment");
  const ownerJob=await store.queueFaceEnrollment(ownerIdentity.id,ownerContext);
  // The normal migration runner replays these older files on every deployment.
  // Existing owner reviews must remain valid throughout that replay, not only
  // after the newest migration re-runs.
  for(const file of ["024_face_presence.sql","057_face_site_enrollment.sql"]){
    await client.query(readFileSync(resolve(root,"scripts/migrations",file),"utf8"));
    assert.equal((await client.query("SELECT face_enrollment_is_current($1) current",[ownerJob.id])).rows[0].current,true);
  }
  for(let repeat=0;repeat<2;repeat++)await client.query(readFileSync(resolve(root,"scripts/migrations/065_face_owner_photo_review.sql"),"utf8"));
  await client.query("SET ROLE core_face_worker");
  await assert.rejects(client.query("SELECT * FROM face_owner_photo_reviewers"),/permission denied/);
  await assert.rejects(client.query("SELECT face_owner_photo_review_is_allowed($1)",[owner.id]),/permission denied/);
  assert.equal((await client.query("SELECT face_reference_review_is_valid($1) valid",[ownerRefs[0]])).rows[0].valid,true);
  const ownedClaim=(await client.query("SELECT claim_face_enrollment('fixture-worker') job")).rows[0].job;
  assert.equal(ownedClaim.id,ownerJob.id);assert.equal(ownedClaim.references.length,3);
  const ownedTemplate=(await client.query("SELECT sync_face_template_set('fixture-worker',$1,$2,$3,$4,3,$5::text[],now()+interval '1 hour') id",[ownerIdentity.id,ownedClaim.consent_id,currentModel,"e".repeat(64),ownerHashes])).rows[0].id;
  assert.equal((await client.query("SELECT finish_face_enrollment($1,'fixture-worker',$2,NULL) ok",[ownerJob.id,ownedTemplate])).rows[0].ok,true);
  await client.query("RESET ROLE");
  await client.query("UPDATE face_owner_photo_reviewers SET revoked_at=now() WHERE admin_user_id=$1",[owner.id]);
  assert.equal(await store.getFaceOwnerPhotoReviewAllowed(owner.id),false);
  assert.equal((await client.query("SELECT face_reference_review_is_valid($1) valid",[ownerRefs[0]])).rows[0].valid,true,"A historically authorized review remains attributed honestly");
  const extraOwned=await store.registerFaceReference({...upload,identityId:ownerIdentity.id,storageKey:`${randomUUID()}.webp`,contentSha256:"f".repeat(64)},ownerContext);
  await assert.rejects(store.reviewFaceReference(extraOwned.id,{action:"approve_owner",ownerConfirmed:true,note:"Entitlement was withdrawn"},ownerContext),/not enabled/);
  await store.updateFaceIdentity(ownerIdentity.id,{action:"revoke_consent",reason:"Synthetic subject withdrawal"},ownerContext);
  assert.equal((await client.query("SELECT face_reference_review_is_valid($1) valid",[ownerRefs[0]])).rows[0].valid,false);
  assert.equal((await client.query("SELECT state FROM face_template_sets WHERE id=$1",[ownedTemplate])).rows[0].state,"purge_pending");
  console.log("PASS: owner-only email attestation and photo review require an explicit account grant, MFA and confirmation; preserve normal review rules and replay safety; worker accepts approved owner references and honors withdrawal.");
  console.log("PASS: guest persistence, duplicate protection, consent, review, YouTube/Twitch VOD/clip tag metadata, time boundaries, profile updates, revocation and audit; disposable database only.");
} finally {
  if (priorPublicGate === undefined) delete process.env.FACE_PRESENCE_PUBLIC_ENABLED;
  else process.env.FACE_PRESENCE_PUBLIC_ENABLED = priorPublicGate;
  if (priorAutomaticGate === undefined) delete process.env.FACE_AUTOMATIC_MATCHING_ENABLED;
  else process.env.FACE_AUTOMATIC_MATCHING_ENABLED = priorAutomaticGate;
  await pool?.end().catch(() => {});
  await client?.end().catch(() => {});
  if (started) docker("stop", container);
}

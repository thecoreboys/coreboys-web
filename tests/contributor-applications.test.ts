import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { resolve } from "node:path";
import ts from "typescript";
import * as jose from "jose";
import { createHmac } from "node:crypto";
import * as validation from "../lib/contributors/validation";

function load<T>(path: string, dependencies: Record<string,unknown>, environment = "production"): T {
  const filename=resolve(path), native=createRequire(filename), module={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,require:(name:string)=>name in dependencies?dependencies[name]:native(name),Buffer,Date,URL,Request,Response,Headers,TextDecoder,Uint8Array,Error,console,process:{env:{NODE_ENV:environment,FAN_SESSION_SECRET:"test-secret-for-contributor-security-123456789"}}},{filename});
  return module.exports as T;
}
const details={firstName:"Test",lastName:"Applicant",phone:"",twitter:"@test",discord:"",portfolio:"https://example.com/work",role:"Developer",how:"I can improve accessibility and mobile layouts.",ageConfirmed:true};
test("requires age confirmation, a contact handle, a real role and bounded text",()=>{
  assert.ok(validation.contributorSchema.safeParse(details).success);
  for(const change of [{ageConfirmed:false},{ageConfirmed:"true"},{twitter:"",discord:""},{role:"admin"},{firstName:""},{how:"short"},{how:"x".repeat(2001)},{phone:"555<script>"},{extra:"field"}]) assert.equal(validation.contributorSchema.safeParse({...details,...change}).success,false);
});
test("portfolio rejects script, data, http and credential URLs",()=>{
  for(const portfolio of ["javascript:alert(1)","data:text/html,test","http://example.com","https://user:pass@example.com","//evil.test"]) assert.equal(validation.contributorSchema.safeParse({...details,portfolio}).success,false);
});
test("JSON stream size cap applies without Content-Length",async()=>{
  await assert.rejects(validation.readApplicationJson(new Request("https://site.test/api/contributors",{method:"POST",body:JSON.stringify({how:"x".repeat(17000)})})),/body_too_large/);
  await assert.rejects(validation.readApplicationJson(new Request("https://site.test/api/contributors",{method:"POST",body:"{"})));
});
type Security=typeof import("../lib/contributors/security");
const security=()=>load<Security>("lib/contributors/security.ts",{"server-only":{},jose,"@/lib/site-access-rate-limit":{siteAccessClientIp:()=>"203.0.113.4"}});
test("private details are authenticated-encrypted and tampering fails",()=>{
  const s=security(), encrypted=s.encryptApplication(details); assert.ok(!encrypted.includes("Applicant"));
  assert.equal(JSON.stringify(s.decryptApplication(encrypted)),JSON.stringify(details));
  const parts=encrypted.split(".");const tag=parts[3]!;parts[3]=(tag[0]==="A"?"B":"A")+tag.slice(1);assert.throws(()=>s.decryptApplication(parts.join(".")));
});
test("form tokens reject immediate sends, wrong visitors, tampering and expiry",async()=>{
  const s=security();const token=await s.issueApplicationToken("visitor");assert.equal(await s.verifyApplicationToken(token,"visitor"),null);
  const key=createHmac("sha256","test-secret-for-contributor-security-123456789").update("core-contributors:v1:form").digest();
  const make=(issued:number,expires:number)=>new jose.SignJWT({purpose:"contributor-application",fp:"visitor"}).setProtectedHeader({alg:"HS256"}).setJti("12345678-1234-1234-1234-123456789abc").setIssuedAt(issued).setExpirationTime(expires).sign(key);
  const now=Math.floor(Date.now()/1000), valid=await make(now-5,now+60);
  assert.ok(await s.verifyApplicationToken(valid,"visitor"));assert.equal(await s.verifyApplicationToken(valid,"other"),null);
  assert.equal(await s.verifyApplicationToken(valid+"x","visitor"),null);assert.equal(await s.verifyApplicationToken(await make(now-100,now-5),"visitor"),null);
});
type PublicRoute={POST(request:Request):Promise<Response>};
function route(options:{limited?:boolean;broken?:boolean;development?:boolean}={}) {
  let saves=0;
  let received: unknown;
  const api=load<PublicRoute>("app/api/contributors/route.ts",{
    "@/lib/x/security":{requestHasSameOrigin:(r:Request)=>r.headers.get("origin")==="https://site.test"},
    "@/lib/site-access-rate-limit":{consumeSiteAccessRateLimit:async()=>{if(options.broken)throw Error("db");return{ok:!options.limited,retryAfterSeconds:600}}},
    "@/lib/contributors/validation":validation,
    "@/lib/contributors/security":{contributorFingerprint:()=>"hashed",verifyApplicationToken:async(token:string)=>token==="valid"?"token-id":null},
    "@/lib/contributors/store":{saveApplication:async(details: unknown)=>{saves++;received=details;return"saved"}},
  },options.development?"development":"production");return{api,saves:()=>saves,received:()=>received};
}
const request=(body:unknown,origin="https://site.test")=>new Request("https://site.test/api/contributors",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
const envelope={details,token:"valid",website:""};
test("loopback alias is development-only, same-port and requires same-origin browser metadata",async()=>{
  const local=(origin="http://127.0.0.1:3015",site="same-origin")=>new Request("http://localhost:3015/api/contributors",{method:"POST",headers:{origin,"sec-fetch-site":site,"content-type":"application/json"},body:JSON.stringify(envelope)});
  const production=route();assert.equal((await production.api.POST(local())).status,403);assert.equal(production.saves(),0);
  const dev=route({development:true});assert.equal((await dev.api.POST(local())).status,201);
  assert.equal((await dev.api.POST(local("http://127.0.0.1:3016"))).status,403);
  assert.equal((await dev.api.POST(local("http://127.0.0.1:3015","cross-site"))).status,403);
});
test("cross-origin, honeypot, unverified and invalid applications never reach storage",async()=>{
  const r=route();assert.equal((await r.api.POST(request(envelope,"https://evil.test"))).status,403);
  for(const body of [{...envelope,website:"spam"},{...envelope,token:"bad"},{...envelope,details:{...details,ageConfirmed:false}}])assert.equal((await r.api.POST(request(body))).status,400);
  assert.equal(r.saves(),0);
});
test("enforced limits and database failures fail closed",async()=>{
  const limited=route({limited:true}); const response=await limited.api.POST(request(envelope));assert.equal(response.status,429);assert.equal(response.headers.get("retry-after"),"600");assert.equal(limited.saves(),0);
  const broken=route({broken:true});assert.equal((await broken.api.POST(request(envelope))).status,503);assert.equal(broken.saves(),0);
});
test("valid application is private and does not echo contact details",async()=>{
  const r=route(), response=await r.api.POST(request(envelope));assert.equal(response.status,201);assert.match(response.headers.get("cache-control")!,/no-store/);assert.equal(await response.text(),'{"ok":true}');assert.equal(r.saves(),1);
});
test("admin API rejects non-admin sessions before reading any applications",async()=>{
  let reads=0;const api=load<{GET(r:Request):Promise<Response>}>("app/api/admin/contributors/route.ts",{
    "@/lib/admin-api":{requireAdmin:async()=>({ok:false,response:new Response("forbidden",{status:403})})},
    "@/lib/contributors/store":{listApplications:async()=>{reads++;return{}}},
    "@/lib/contributors/validation":validation,
    "@/lib/x/security":{requestHasSameOrigin:()=>false},
  });assert.equal((await api.GET(new Request("https://site.test/api/admin/contributors"))).status,403);assert.equal(reads,0);
});

const help = { kind: "help", name: "Test helper", contact: "helper@example.com", role: "Developer", portfolio: "", message: "I can improve the mobile experience.", ageConfirmed: true };
const suggestion = { kind: "suggestion", message: "Please add a way to find saved streams." };

test("suggestions need no age attestation; help signups require one along with contact and role", () => {
  const parsed = validation.communitySubmissionSchema.parse(suggestion);
  assert.equal(parsed.contact, "");
  assert.equal(parsed.ageConfirmed, false);
  assert.ok(validation.communitySubmissionSchema.safeParse({ ...suggestion, ageConfirmed: false }).success);
  assert.ok(validation.communitySubmissionSchema.safeParse({ ...suggestion, ageConfirmed: true }).success, "already-open old suggestion forms remain accepted");
  assert.ok(validation.communitySubmissionSchema.safeParse(help).success);
  for (const change of [{ message: "short" }, { ageConfirmed: "true" }, { kind: "admin" }, { message: "x".repeat(2001) }, { contact: "<script>" }, { role: "Developer" }]) {
    assert.equal(validation.communitySubmissionSchema.safeParse({ ...suggestion, ...change }).success, false);
  }
  for (const change of [{ ageConfirmed: false }, { ageConfirmed: undefined }, { name: "" }, { contact: "" }, { role: "admin" }, { message: "Too short" }, { portfolio: "javascript:alert(1)" }]) {
    assert.equal(validation.communitySubmissionSchema.safeParse({ ...help, ...change }).success, false);
  }
});

test("both form types reach storage privately, including an anonymous suggestion", async () => {
  for (const submission of [help, suggestion]) {
    const r = route();
    const response = await r.api.POST(request({ ...envelope, details: submission }));
    assert.equal(response.status, 201);
    assert.equal(await response.text(), '{"ok":true}');
    const saved = r.received() as validation.CommunitySubmission;
    assert.equal(saved.kind, submission.kind);
    assert.equal(saved.message, submission.message);
    assert.equal(saved.contact, submission.kind === "help" ? help.contact : "");
  }
});

test("normalization preserves existing applications and all their contact fields", () => {
  const old = { ...details, phone: "+1 555 555 0100", discord: "test-helper" };
  const normalized = validation.normalizeSubmission(old);
  assert.equal(normalized.kind, "help");
  assert.equal(normalized.name, "Test Applicant");
  assert.equal(normalized.message, details.how);
  assert.deepEqual(normalized.legacyContacts, { twitter: old.twitter, discord: old.discord, phone: old.phone });
  assert.equal(validation.normalizeSubmission(suggestion).kind, "suggestion");
  for (const submission of [help, suggestion]) {
    const s = security();
    assert.equal(JSON.stringify(s.decryptApplication(s.encryptApplication(submission))), JSON.stringify(submission));
  }
});

type AdminRoute = { GET(request: Request): Promise<Response>; PATCH(request: Request): Promise<Response> };
function adminRoute(options: { authorized?: boolean; missing?: boolean; broken?: boolean } = {}) {
  const reads: unknown[][] = [], writes: unknown[][] = [];
  const api = load<AdminRoute>("app/api/admin/contributors/route.ts", {
    "@/lib/admin-api": { requireAdmin: async () => options.authorized === false ? { ok: false, response: new Response("forbidden", { status: 403 }) } : { ok: true } },
    "@/lib/x/security": { requestHasSameOrigin: (r: Request) => r.headers.get("origin") === "https://site.test" },
    "@/lib/contributors/validation": validation,
    "@/lib/contributors/store": {
      listApplications: async (...args: unknown[]) => { reads.push(args); return { applications: [], nextCursor: null, counts: { total: 0, help: 0, suggestion: 0, new: 0 } }; },
      updateApplicationStatus: async (...args: unknown[]) => { writes.push(args); if (options.broken) throw Error("db"); return !options.missing; },
    },
  });
  return { api, reads, writes };
}
const submissionId = "12345678-1234-4234-8234-123456789abc";
const updateRequest = (body: unknown, origin = "https://site.test") => new Request("https://site.test/api/admin/contributors", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

test("admin inbox validates filters and cursors before reading and passes valid filters to storage", async () => {
  const r = adminRoute();
  for (const query of ["kind=admin", "status=deleted", "at=not-a-date&id=" + submissionId, "id=" + submissionId]) {
    assert.equal((await r.api.GET(new Request("https://site.test/api/admin/contributors?" + query))).status, 400);
  }
  assert.equal(r.reads.length, 0);
  const response = await r.api.GET(new Request("https://site.test/api/admin/contributors?kind=suggestion&status=new"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(JSON.stringify(r.reads[0]), JSON.stringify([null, { kind: "suggestion", status: "new" }]));
});

test("review writes require admin, same origin and a valid bounded update", async () => {
  const unauthorized = adminRoute({ authorized: false });
  assert.equal((await unauthorized.api.PATCH(updateRequest({ id: submissionId, status: "reviewed" }))).status, 403);
  assert.equal(unauthorized.writes.length, 0);
  const r = adminRoute();
  assert.equal((await r.api.PATCH(updateRequest({ id: submissionId, status: "reviewed" }, "https://evil.test"))).status, 403);
  for (const body of [{ id: "bad-id", status: "new" }, { id: submissionId, status: "deleted" }, { id: submissionId, status: "new", contact: "overwrite" }]) {
    assert.equal((await r.api.PATCH(updateRequest(body))).status, 400);
  }
  assert.equal((await r.api.PATCH(updateRequest({ id: submissionId, status: "new", excess: "x".repeat(17000) }))).status, 413);
  assert.equal(r.writes.length, 0);
  for (const status of ["reviewed", "new"]) {
    const response = await r.api.PATCH(updateRequest({ id: submissionId, status }));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"ok":true}');
  }
  assert.equal(JSON.stringify(r.writes), JSON.stringify([[submissionId, "reviewed"], [submissionId, "new"]]));
  assert.equal((await adminRoute({ missing: true }).api.PATCH(updateRequest({ id: submissionId, status: "reviewed" }))).status, 404);
  assert.equal((await adminRoute({ broken: true }).api.PATCH(updateRequest({ id: submissionId, status: "reviewed" }))).status, 503);
});

test("inbox filters the full query, paginates and decrypts legacy and new submissions", async () => {
  let pageParameters: unknown[] = [], statusParameters: unknown[] = [];
  const rows = Array.from({ length: 26 }, (_, index) => ({ id: String(index), created_at: new Date(Date.UTC(2026, 0, 26 - index)).toISOString(), details_encrypted: JSON.stringify(index ? suggestion : details), review_status: "new" }));
  const store = load<typeof import("../lib/contributors/store")>("lib/contributors/store.ts", {
    "server-only": {}, "./validation": validation, "./security": { decryptApplication: JSON.parse },
    "@/lib/db": { query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT id::text")) { pageParameters = params; assert.match(sql, /submission_type=\$3/); assert.match(sql, /review_status=\$4/); return { rows }; }
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ total: 26, help: 1, suggestion: 25, new: 26 }] };
      if (sql.startsWith("UPDATE")) { statusParameters = params; return { rows: [{ id: submissionId }] }; }
      return { rows: [] };
    } },
  });
  const cursor = { at: "2026-02-01T00:00:00.000Z", id: submissionId };
  const result = await store.listApplications(cursor, { kind: "suggestion", status: "new" });
  assert.equal(result.applications.length, 25);
  assert.equal(result.applications[0]?.name, "Test Applicant");
  assert.equal(result.applications[1]?.kind, "suggestion");
  assert.equal(result.applications[1]?.contact, "");
  assert.equal(result.nextCursor?.id, "24");
  assert.equal(result.counts.suggestion, 25);
  assert.equal(JSON.stringify(pageParameters), JSON.stringify([cursor.at, cursor.id, "suggestion", "new"]));
  assert.equal(await store.updateApplicationStatus(submissionId, "reviewed"), true);
  assert.equal(JSON.stringify(statusParameters), JSON.stringify([submissionId, "reviewed"]));
});

test("new submissions store their type alongside encrypted details and share the existing limits", async () => {
  const saved: unknown[][] = [];
  const store = load<typeof import("../lib/contributors/store")>("lib/contributors/store.ts", {
    "server-only": {}, "./validation": validation, "./security": { encryptApplication: () => "encrypted" },
    "@/lib/db": { query: async () => ({ rows: [] }), withTransaction: async (fn: (db: unknown) => unknown) => fn({ query: async (sql: string, params: unknown[]) => {
      if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("INSERT")) saved.push(params);
      return { rows: [] };
    } }) },
  });
  for (const submission of [help, suggestion]) {
    assert.equal(await store.saveApplication(validation.submissionSchema.parse(submission), "fingerprint", "token-id"), "saved");
  }
  assert.equal(JSON.stringify(saved), JSON.stringify([["token-id", "encrypted", "fingerprint", true, "help"], ["token-id", "encrypted", "fingerprint", false, "suggestion"]]));
});
test("storage serializes same-visitor limits, deduplicates tokens and binds all input parameters",async()=>{
  let count=0,duplicate=false,inserted:unknown[]=[];const statements:string[]=[];
  const db={query:async(sql:string,params:unknown[])=>{statements.push(sql);if(sql.includes("count(*)"))return{rows:[{count}]};if(sql.startsWith("SELECT id"))return{rows:duplicate?[{id:"existing"}]:[]};if(sql.startsWith("INSERT INTO"))inserted=params;return{rows:[]}}};
  const store=load<typeof import("../lib/contributors/store")>("lib/contributors/store.ts",{"server-only":{},"@/lib/db":{query:async()=>({rows:[]}),withTransaction:async(fn:(db:unknown)=>unknown)=>fn(db)},"./validation":validation,"./security":{encryptApplication:()=>"encrypted"}});
  assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","token"),"saved");assert.ok(statements[0]!.includes("pg_advisory_xact_lock"));assert.equal(inserted[1],"encrypted");
  count=5;assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","new-token"),"limited");
  duplicate=true;assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","token"),"duplicate");
});

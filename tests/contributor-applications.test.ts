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
    {module,exports:module.exports,require:(name:string)=>name in dependencies?dependencies[name]:native(name),Buffer,Date,URL,Request,Response,Headers,TextDecoder,Uint8Array,console,process:{env:{NODE_ENV:environment,FAN_SESSION_SECRET:"test-secret-for-contributor-security-123456789"}}},{filename});
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
  const api=load<PublicRoute>("app/api/contributors/route.ts",{
    "@/lib/x/security":{requestHasSameOrigin:(r:Request)=>r.headers.get("origin")==="https://site.test"},
    "@/lib/site-access-rate-limit":{consumeSiteAccessRateLimit:async()=>{if(options.broken)throw Error("db");return{ok:!options.limited,retryAfterSeconds:600}}},
    "@/lib/contributors/validation":validation,
    "@/lib/contributors/security":{contributorFingerprint:()=>"hashed",verifyApplicationToken:async(token:string)=>token==="valid"?"token-id":null},
    "@/lib/contributors/store":{saveApplication:async()=>{saves++;return"saved"}},
  },options.development?"development":"production");return{api,saves:()=>saves};
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
  });assert.equal((await api.GET(new Request("https://site.test/api/admin/contributors"))).status,403);assert.equal(reads,0);
});
test("storage serializes same-visitor limits, deduplicates tokens and binds all input parameters",async()=>{
  let count=0,duplicate=false,inserted:unknown[]=[];const statements:string[]=[];
  const db={query:async(sql:string,params:unknown[])=>{statements.push(sql);if(sql.includes("count(*)"))return{rows:[{count}]};if(sql.startsWith("SELECT id"))return{rows:duplicate?[{id:"existing"}]:[]};if(sql.startsWith("INSERT INTO"))inserted=params;return{rows:[]}}};
  const store=load<typeof import("../lib/contributors/store")>("lib/contributors/store.ts",{"server-only":{},"@/lib/db":{query:async()=>({rows:[]}),withTransaction:async(fn:(db:unknown)=>unknown)=>fn(db)},"./validation":validation,"./security":{encryptApplication:()=>"encrypted"}});
  assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","token"),"saved");assert.ok(statements[0]!.includes("pg_advisory_xact_lock"));assert.equal(inserted[1],"encrypted");
  count=5;assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","new-token"),"limited");
  duplicate=true;assert.equal(await store.saveApplication(details as validation.ContributorDetails,"ip-hash","token"),"duplicate");
});

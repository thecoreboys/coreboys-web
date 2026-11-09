import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { FaceJobCreateSchema } from "../lib/face-recognition-contracts";
import { BrowserVideoReviewInput,safeLocalVideoObjectUrl } from "../lib/browser-video-review";
import { FACE_ENROLLMENT_MODEL_VERSION, VIDEO_FINGERPRINT_ALGORITHM, faceScanFrameCount } from "../lib/face-processing-costs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

test("scan budgets count rounded sampling intervals, including the last partial frame", () => {
  const job={sourceId:"12345678-1234-4234-9234-123456789abc",kind:"archive_scan",configuration:{startMs:0,endMs:3600000}};
  assert.equal(faceScanFrameCount(0,3600000),1800);
  assert.equal(FaceJobCreateSchema.safeParse(job).success,true);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:0,endMs:3600001}}).success,false);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:0,endMs:7200000,samplingFps:.25}}).success,true);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:0,endMs:7200001,samplingFps:.1}}).success,false);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:0,endMs:1800*333,samplingFps:3}}).success,true);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:0,endMs:1800*333+1,samplingFps:3}}).success,false);
  assert.equal(FaceJobCreateSchema.safeParse({...job,configuration:{startMs:100,endMs:99}}).success,false);
  assert.equal(faceScanFrameCount(0,201*1800,1000/200.5),1800);
});

test("browser fingerprints are deterministic across names, span all chunks, and detect changed bytes", async () => {
  const source=readFileSync("public/workers/video-fingerprint.js","utf8");
  async function run(blob:Blob){
    const messages:Array<{type:string;fingerprint?:string;percent?:number}>=[];
    const self={onmessage:undefined as unknown as (event:unknown)=>Promise<void>,postMessage:(value:typeof messages[number])=>messages.push(value)};
    vm.runInNewContext(source,{self,Blob,TextEncoder,Uint8Array,crypto:webcrypto});
    await self.onmessage({data:{file:blob}});
    assert.equal(messages.at(-1)?.type,"complete");
    assert.equal(messages.filter(m=>m.type==="progress").at(-1)?.percent,100);
    return messages.at(-1)!.fingerprint;
  }
  const size=4*1024*1024+11, bytes=new Uint8Array(size).fill(7);
  const original=await run(new File([bytes],"original.mp4"));
  assert.equal(await run(new File([bytes],"renamed.webm")),original);
  const chunks=[bytes.slice(0,4*1024*1024),bytes.slice(4*1024*1024)].map(chunk=>createHash("sha256").update(chunk).digest());
  assert.equal(original,createHash("sha256").update(`COREVIDEO:${VIDEO_FINGERPRINT_ALGORITHM}:${size}:`).update(Buffer.concat(chunks)).digest("hex"));
  bytes[size-1]=8;
  assert.notEqual(await run(new Blob([bytes])),original,"A change past the first chunk must invalidate saved work");
});

test("video review accepts metadata only and enrollment reuse follows the pinned real encoder", () => {
  const input={sourceId:"12345678-1234-4234-9234-123456789abc",fingerprint:"a".repeat(64),algorithm:VIDEO_FINGERPRINT_ALGORITHM,byteSize:1000,durationMs:10000,fileName:"fixture.webm"};
  assert.equal(BrowserVideoReviewInput.safeParse(input).success,true);
  assert.equal(BrowserVideoReviewInput.safeParse({...input,video:"data:video/webm;base64,..."}).success,false);
  assert.equal(BrowserVideoReviewInput.safeParse({...input,fileName:"../fixture.webm"}).success,false);
  assert.equal(BrowserVideoReviewInput.safeParse({...input,algorithm:"sha256"}).success,false);
  assert.ok(readFileSync("workers/face-analyzer/cloud_entry.py","utf8").includes(FACE_ENROLLMENT_MODEL_VERSION));
  assert.ok(readFileSync("workers/face-analyzer/download_models.py","utf8").includes(FACE_ENROLLMENT_MODEL_VERSION));
});

test("local player accepts only browser UUID blob URLs from its own origin",()=>{
  const id="12345678-1234-4234-9234-123456789abc",origin="https://thecoreboys.com";
  assert.equal(safeLocalVideoObjectUrl(`blob:${origin}/${id}`,origin),`blob:${origin}/${id}`);
  assert.equal(safeLocalVideoObjectUrl(`blob:http://127.0.0.1:3000/${id}`,"http://127.0.0.1:3000"),`blob:http://127.0.0.1:3000/${id}`);
  for(const url of [`blob:https://evil.example/${id}`,`https://thecoreboys.com/${id}`,"javascript:alert(1)","data:text/html,<script>alert(1)</script>",`blob:${origin}/<script>`, `blob:${origin}/${id}\" onerror=\"alert(1)`])assert.equal(safeLocalVideoObjectUrl(url,origin),"");
});

test("browser review checks admin/origin before saving and bounds streamed metadata without Content-Length", async () => {
  let admin=false,sameOrigin=true,writes=0;
  const imports:Record<string,unknown>={
    "@/lib/admin-api":{requireAdmin:async()=>admin?{ok:true,id:"admin"}:{ok:false,response:Response.json({},{status:401})}},
    "@/lib/x/security":{requestHasSameOrigin:()=>sameOrigin},
    "@/lib/browser-video-review":{BrowserVideoReviewInput},
    "@/lib/face-recognition-store":{prepareBrowserVideoReview:async()=>{writes++;return{id:"saved"};}},
    "@/lib/face-recognition-http":{facePrivateJson:(value:unknown,status=200)=>Response.json(value,{status}),facePrivateResponse:(r:Response)=>r,faceRequestId:()=>"test",faceStoreErrorResponse:(e:unknown)=>{throw e;}},
  };
  const api={} as {POST:(r:Request)=>Promise<Response>};
  const js=transpileModule(readFileSync("app/api/admin/faces/browser-reviews/route.ts","utf8"),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(exports,require){${js}\n})`,{Buffer})(api,(id:string)=>{assert.ok(id in imports,id);return imports[id];});
  const input={sourceId:"12345678-1234-4234-9234-123456789abc",fingerprint:"a".repeat(64),algorithm:VIDEO_FINGERPRINT_ALGORITHM,byteSize:1000,durationMs:10000,fileName:"fixture.webm"};
  const request=()=>new Request("https://example.test/review",{method:"POST",body:JSON.stringify(input)});
  assert.equal((await api.POST(request())).status,401);
  admin=true;sameOrigin=false;assert.equal((await api.POST(request())).status,403);
  sameOrigin=true;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(17000));controller.close();}});
  assert.equal((await api.POST(new Request("https://example.test/review",{method:"POST",body:stream,duplex:"half"} as RequestInit & {duplex:"half"}))).status,413);
  assert.equal(writes,0);assert.equal((await api.POST(request())).status,200);assert.equal(writes,1);
});

test("web wakes through its managed identity, reuses tokens, and leaves durable work queued on transport failure", async () => {
  const env:Record<string,string>={FACE_WORK_QUEUE_ACCOUNT:"testaccount",FACE_WORK_QUEUE_NAME:"face-work",IDENTITY_ENDPOINT:"http://127.0.0.1/token",IDENTITY_HEADER:"test-local-header"};
  const calls:Array<{url:string;options:RequestInit}>=[];let fail=false;
  const api={} as {wakeFaceWorker:()=>Promise<{onDemand:boolean;wakeQueued:boolean}>};
  const js=transpileModule(readFileSync("lib/face-worker-wake.ts","utf8"),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(exports,require){${js}\n})`,{URL,AbortSignal,Date,process:{env},console:{warn:()=>{}},fetch:async(url:URL|string,options:RequestInit)=>{
    calls.push({url:String(url),options});
    if(fail)throw new Error("transport unavailable");
    return String(url).startsWith("http:")?Response.json({access_token:"test-bearer",expires_on:Date.now()/1000+3600}):new Response(null,{status:201});
  }})(api,(id:string)=>{assert.equal(id,"server-only");return{};});
  assert.equal((await api.wakeFaceWorker()).wakeQueued,true);assert.equal((await api.wakeFaceWorker()).wakeQueued,true);
  assert.equal(calls.filter(c=>c.url.startsWith("http:")).length,1);
  const wake=calls.find(c=>c.url.startsWith("https:"))!;
  assert.equal(wake.options.body,"<QueueMessage><MessageText>d2FrZQ==</MessageText></QueueMessage>");
  assert.equal(wake.options.redirect,"error");
  fail=true;assert.equal((await api.wakeFaceWorker()).wakeQueued,false);
});

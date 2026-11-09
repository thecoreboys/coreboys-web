import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { z } from "zod";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { FacePhotoCandidateActionSchema, FacePhotoCandidateSchema, safeFacePhotoSource } from "../lib/face-photo-candidates";

test("photo candidates cannot inject image URLs or imply enrollment permission",()=>{
  for(const url of ["javascript:alert(1)","data:image/svg+xml,test","//example.test/image","https://user:pass@example.test/image","https://example.test:9000/image"]){
    assert.equal(safeFacePhotoSource(url),null);
  }
  assert.equal(safeFacePhotoSource("https://example.test/a%20photo?q=%3Cscript%3E"),"https://example.test/a%20photo?q=%3Cscript%3E");
  const submit={action:"submit",identityId:"f3b2cf73-9034-4bee-9d33-c9ebf1a5608e",subjectApproved:true,rightsConfirmed:true,note:"release-photo-1"};
  assert.equal(FacePhotoCandidateActionSchema.safeParse(submit).success,true);
  for(const extra of [{subjectApproved:false},{rightsConfirmed:false},{note:""},{embedding:[1,2]},{autoEnroll:true}])assert.equal(FacePhotoCandidateActionSchema.safeParse({...submit,...extra}).success,false);
  assert.equal(FacePhotoCandidateSchema.shape.previewUrl.safeParse("https://external.test/photo.jpg").success,false);
  assert.equal(FacePhotoCandidateSchema.shape.previewUrl.safeParse("/api/admin/faces/photo-candidates/../../../secrets/image").success,false);
});

test("candidate submission requires admin and same origin, exact-photo acknowledgments and deployment flag",async()=>{
  let admin=false,sameOrigin=true,enabled=true,fail=false,copies=0,writes=0;
  const deleted:string[]=[];
  const id="f3b2cf73-9034-4bee-9d33-c9ebf1a5608e";
  const imports:Record<string,unknown>={
    zod:{z},
    "@/lib/admin-api":{requireAdmin:async()=>admin?{ok:true,id:"admin"}:{ok:false,response:Response.json({},{status:401})}},
    "@/lib/face-photo-candidates":{FacePhotoCandidateActionSchema},
    "@/lib/x/security":{requestHasSameOrigin:()=>sameOrigin},
    "@/lib/face-recognition-policy":{faceReferenceUploadsAreEnabled:()=>enabled},
    "@/lib/face-recognition-http":{facePrivateJson:(body:unknown,status=200)=>Response.json(body,{status}),facePrivateResponse:(r:Response)=>r,faceRequestId:()=>"fixture",faceStoreErrorResponse:()=>Response.json({error:"blocked"},{status:409})},
    "@/lib/face-recognition-store":{
      getFacePhotoCandidate:async()=>({state:"pending",storage_key:"original.webp",content_sha256:"a".repeat(64),source_url:"https://www.twitch.tv/fixture",canonical_slug:"fixture",byte_size:500,width:256,height:256}),
      registerFaceReference:async()=>{writes++;if(fail)throw new Error("Consent missing");return{id:"reference"};},
      dismissFacePhotoCandidate:async()=>({ok:true}),markFacePhotoCandidateFileDeleted:async()=>undefined,
    },
    "@/lib/face-reference-storage":{
      FaceReferenceStorageError:class extends Error{},copyFaceReferenceFile:async()=>{copies++;return"enrollment-copy.webp";},
      deleteFaceReferenceFile:async(key:string)=>{deleted.push(key);},
    },
  };
  const source=transpileModule(readFileSync("app/api/admin/faces/photo-candidates/[id]/route.ts","utf8"),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
  const api={} as {POST(request:Request,context:{params:Promise<{id:string}>}):Promise<Response>};
  vm.runInNewContext(`(function(exports, require){${source}\n})`,{console})(api,(key:string)=>{assert.ok(key in imports,key);return imports[key];});
  const body={action:"submit",identityId:id,subjectApproved:true,rightsConfirmed:true,note:"approved-photo-release"};
  const post=(data:unknown=body)=>api.POST(new Request(`https://thecoreboys.com/api/admin/faces/photo-candidates/${id}`,{method:"POST",body:JSON.stringify(data)}),{params:Promise.resolve({id})});
  assert.equal((await post()).status,401);
  admin=true;sameOrigin=false;
  assert.equal((await post()).status,403);
  sameOrigin=true;
  assert.equal((await post({...body,subjectApproved:false})).status,400);
  assert.equal((await post({...body,rightsConfirmed:false})).status,400);
  enabled=false;assert.equal((await post()).status,503);
  assert.equal(copies,0);assert.equal(writes,0);
  enabled=true;fail=true;
  assert.equal((await post()).status,409);
  assert.deepEqual(deleted,["enrollment-copy.webp"],"failed consent check removes the new copy and preserves research original");
  fail=false;assert.equal((await post()).status,201);
  assert.deepEqual(deleted,["enrollment-copy.webp","original.webp"],"successful submission retires research copy");
});

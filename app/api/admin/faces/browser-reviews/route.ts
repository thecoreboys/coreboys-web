import { requireAdmin } from "@/lib/admin-api";
import { BrowserVideoReviewInput } from "@/lib/browser-video-review";
import { prepareBrowserVideoReview } from "@/lib/face-recognition-store";
import { facePrivateJson,facePrivateResponse,faceRequestId,faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  if(!requestHasSameOrigin(request))return facePrivateJson({error:"invalid origin"},403);
  const auth=await requireAdmin();if(!auth.ok)return facePrivateResponse(auth.response);
  if(Number(request.headers.get("content-length")??0)>16384)return facePrivateJson({error:"Only small review metadata is accepted; the video stays on your computer."},413);
  const reader=request.body?.getReader();
  const chunks:Uint8Array[]=[];let size=0;
  if(reader)try{
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>16384){await reader.cancel();return facePrivateJson({error:"Only small review metadata is accepted."},413);}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  let body:unknown=null;try{body=JSON.parse(Buffer.concat(chunks,size).toString("utf8"));}catch{}
  const input=BrowserVideoReviewInput.safeParse(body);
  if(!input.success)return facePrivateJson({error:"Prepare a supported local video and choose its archive source."},400);
  try{return facePrivateJson(await prepareBrowserVideoReview(input.data,{actor:auth,requestId:faceRequestId(request)}));}
  catch(error){return faceStoreErrorResponse(error);}
}

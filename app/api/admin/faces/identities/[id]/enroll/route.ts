import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { queueFaceEnrollment } from "@/lib/face-recognition-store";
import { facePrivateJson, facePrivateResponse, faceRequestId, faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, {params}: {params: Promise<{id:string}>}) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({error:"invalid origin"},403);
  const auth=await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id=z.string().uuid().safeParse((await params).id);
  if (!id.success) return facePrivateJson({error:"Invalid person."},400);
  try {
    return facePrivateJson({job:await queueFaceEnrollment(id.data,{actor:auth,requestId:faceRequestId(request)})},202);
  } catch(error) {return faceStoreErrorResponse(error);}
}

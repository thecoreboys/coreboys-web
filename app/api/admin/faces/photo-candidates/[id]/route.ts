import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FacePhotoCandidateActionSchema } from "@/lib/face-photo-candidates";
import { facePrivateJson, facePrivateResponse, faceRequestId, faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { dismissFacePhotoCandidate, getFacePhotoCandidate, markFacePhotoCandidateFileDeleted, registerFaceReference } from "@/lib/face-recognition-store";
import { copyFaceReferenceFile, deleteFaceReferenceFile, FaceReferenceStorageError } from "@/lib/face-reference-storage";
import { faceReferenceUploadsAreEnabled } from "@/lib/face-recognition-policy";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: {params: Promise<{id: string}>}) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({error:"invalid origin"},403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const { id } = await params;
  const parsed = FacePhotoCandidateActionSchema.safeParse(await request.json().catch(()=>null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return facePrivateJson({error:"Review this photo and confirm its permission details."},400);
  const context = {actor:auth,requestId:faceRequestId(request)};
  let storageKey: string | null = null;
  try {
    if (parsed.data.action === "dismiss") {
      const candidate=await getFacePhotoCandidate(id);
      const result=await dismissFacePhotoCandidate(id,parsed.data.reason,context);
      if(candidate) await deleteCandidateCopy(id,candidate.storage_key);
      return facePrivateJson(result);
    }
    if (!faceReferenceUploadsAreEnabled()) return facePrivateJson({error:"Photo submission is temporarily unavailable."},503);
    const candidate = await getFacePhotoCandidate(id);
    if (!candidate || candidate.state !== "pending") return facePrivateJson({error:"This photo is no longer awaiting review."},409);
    storageKey = await copyFaceReferenceFile(candidate.storage_key,candidate.content_sha256);
    const result = await registerFaceReference({
      identityId:parsed.data.identityId,sourceKind:"licensed_archive",subjectApproved:true,
      storageKey,fileName:`researched-${candidate.canonical_slug}-${id}.webp`,
      contentSha256:candidate.content_sha256,contentType:"image/webp",byteSize:candidate.byte_size,
      width:candidate.width,height:candidate.height,
      notes:`${parsed.data.note}\nPhoto source: ${candidate.source_url}`.slice(0,1000),
    },context,id);
    // The enrollment copy now follows the existing consent/expiry purge policy.
    // Delete the research copy; maintenance retries any filesystem failure.
    await deleteCandidateCopy(id,candidate.storage_key);
    return facePrivateJson(result,201);
  } catch (error) {
    if (storageKey) await deleteFaceReferenceFile(storageKey).catch(()=>undefined);
    if (error instanceof FaceReferenceStorageError) return facePrivateJson({error:error.message},error.status);
    return faceStoreErrorResponse(error);
  }
}

async function deleteCandidateCopy(id: string, key: string) {
  try {
    await deleteFaceReferenceFile(key);
    await markFacePhotoCandidateFileDeleted(id);
  } catch { console.warn("[faces] photo-candidate deletion queued for maintenance",id); }
}

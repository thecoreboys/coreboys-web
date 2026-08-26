import { timingSafeEqual } from "node:crypto";
import { requireAdmin } from "@/lib/admin-api";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import {
  prepareExpiredFaceDataPurge,
  purgeExpiredFaceAudit,
  reviewFaceReference,
} from "@/lib/face-recognition-store";
import { deleteFaceReferenceFile, FaceReferenceStorageError } from "@/lib/face-reference-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidRetentionSecret(request: Request): boolean {
  const configured = process.env.FACE_RETENTION_CRON_SECRET?.trim();
  const supplied = request.headers.get("x-face-retention-secret")?.trim();
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const suppliedCronSecret = request.headers.has("x-face-retention-secret");
  const cronAuthorized = hasValidRetentionSecret(request);
  if (suppliedCronSecret && !cronAuthorized) {
    return facePrivateJson({ error: "invalid retention credential" }, 401);
  }
  let mutation;
  if (cronAuthorized) {
    mutation = {
      actor: { id: "face-retention-cron", email: null },
      actorType: "system" as const,
      requestId: faceRequestId(request),
    };
  } else {
    if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
    const auth = await requireAdmin();
    if (!auth.ok) return facePrivateResponse(auth.response);
    mutation = { actor: auth, actorType: "staff" as const, requestId: faceRequestId(request) };
  }
  try {
    const prepared = await prepareExpiredFaceDataPurge(mutation);
    let deleted = 0;
    let deletionPending = 0;
    for (const reference of prepared.pending) {
      try {
        if (reference.storageKey) await deleteFaceReferenceFile(reference.storageKey);
        await reviewFaceReference(reference.id, {
          action: "confirm_deleted",
          storageDeleted: true,
        }, mutation);
        deleted += 1;
      } catch (error) {
        deletionPending += 1;
        if (!(error instanceof FaceReferenceStorageError)) {
          console.error("[faces] retention purge failed", error);
        }
      }
    }
    const auditRowsPurged = await purgeExpiredFaceAudit();
    return facePrivateJson({
      ok: true,
      counts: {
        ...prepared.counts,
        referenceFilesDeleted: deleted,
        referenceFilesPending: deletionPending,
        auditRowsPurged,
      },
    }, deletionPending ? 202 : 200);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

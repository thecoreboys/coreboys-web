import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceReferenceActionSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import {
  faceIdentityHasPendingLocalTemplatePurge,
  getFaceReferenceForDeletion,
  reviewFaceReference,
} from "@/lib/face-recognition-store";
import { deleteFaceReferenceFile, FaceReferenceStorageError } from "@/lib/face-reference-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; referenceId: string }> };
const Uuid = z.string().uuid();
const DeleteBody = z.object({ confirmation: z.string().trim().min(1).max(240) }).strict();

export async function PATCH(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const { id, referenceId } = await params;
  const body = FaceReferenceActionSchema.safeParse(await request.json().catch(() => null));
  if (!Uuid.safeParse(id).success || !Uuid.safeParse(referenceId).success || !body.success) {
    return facePrivateJson({ error: "invalid reference action" }, 400);
  }
  const reference = await getFaceReferenceForDeletion(id, referenceId);
  if (!reference) return facePrivateJson({ error: "reference not found" }, 404);
  try {
    const mutation = {
      actor: auth,
      requestId: faceRequestId(request),
    };
    const result = await reviewFaceReference(referenceId, body.data, mutation);
    if (body.data.action === "reject") {
      try {
        if (reference.storageKey) await deleteFaceReferenceFile(reference.storageKey);
      } catch (error) {
        if (error instanceof FaceReferenceStorageError) {
          return facePrivateJson({ ok: true, id: referenceId, deletionPending: true }, 202);
        }
        throw error;
      }
      await reviewFaceReference(referenceId, { action: "confirm_deleted", storageDeleted: true }, mutation);
    }
    const localTemplatePurgePending = body.data.action === "reject"
      ? await faceIdentityHasPendingLocalTemplatePurge(id)
      : false;
    return facePrivateJson({ ...result, localTemplatePurgePending }, localTemplatePurgePending ? 202 : 200);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const { id, referenceId } = await params;
  const body = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!Uuid.safeParse(id).success || !Uuid.safeParse(referenceId).success || !body.success) {
    return facePrivateJson({ error: "invalid reference deletion" }, 400);
  }
  const reference = await getFaceReferenceForDeletion(id, referenceId);
  if (!reference) return facePrivateJson({ error: "reference not found" }, 404);
  if (body.data.confirmation !== reference.file_name) {
    return facePrivateJson({ error: "confirmation must exactly match the reference file name" }, 400);
  }
  const mutation = { actor: auth, requestId: faceRequestId(request) };
  try {
    await reviewFaceReference(referenceId, {
      action: "request_delete",
      reason: "Reference deletion confirmed by administrator.",
    }, mutation);
    try {
      if (reference.storageKey) await deleteFaceReferenceFile(reference.storageKey);
    } catch (error) {
      if (error instanceof FaceReferenceStorageError) {
        return facePrivateJson({ ok: true, id: referenceId, deletionPending: true }, 202);
      }
      throw error;
    }
    await reviewFaceReference(referenceId, { action: "confirm_deleted", storageDeleted: true }, mutation);
    const localTemplatePurgePending = await faceIdentityHasPendingLocalTemplatePurge(id);
    return facePrivateJson({
      ok: true,
      id: referenceId,
      deletionPending: false,
      localTemplatePurgePending,
    }, localTemplatePurgePending ? 202 : 200);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

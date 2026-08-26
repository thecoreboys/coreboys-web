import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceIdentityActionSchema, FaceUuidParamSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import {
  listFaceIdentities,
  listFaceReferenceStorageKeys,
  faceIdentityHasPendingLocalTemplatePurge,
  reviewFaceReference,
  updateFaceIdentity,
} from "@/lib/face-recognition-store";
import { deleteFaceReferenceFile, FaceReferenceStorageError } from "@/lib/face-reference-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const DeleteBody = z.object({ confirmation: z.string().trim().min(1).max(120) }).strict();

async function idFrom(context: Context) {
  return FaceUuidParamSchema.safeParse(await context.params);
}

export async function GET(_request: Request, context: Context) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const params = await idFrom(context);
  if (!params.success) return facePrivateJson({ error: "invalid identity id" }, 400);
  const identity = (await listFaceIdentities(params.data.id))[0];
  return identity
    ? facePrivateJson({ identity })
    : facePrivateJson({ error: "identity not found" }, 404);
}

export async function PATCH(request: Request, context: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const params = await idFrom(context);
  const body = FaceIdentityActionSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return facePrivateJson({ error: "invalid identity action" }, 400);
  try {
    const result = await updateFaceIdentity(params.data.id, body.data, {
      actor: auth,
      requestId: faceRequestId(request),
    });
    return facePrivateJson({ ok: true, ...result });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const params = await idFrom(context);
  const body = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return facePrivateJson({ error: "invalid deletion confirmation" }, 400);
  const identity = (await listFaceIdentities(params.data.id))[0];
  if (!identity) return facePrivateJson({ error: "identity not found" }, 404);
  if (body.data.confirmation !== identity.displayName) {
    return facePrivateJson({ error: "confirmation must exactly match the display name" }, 400);
  }
  const mutation = { actor: auth, requestId: faceRequestId(request) };
  try {
    await updateFaceIdentity(params.data.id, {
      action: "revoke_identity",
      reason: "Permanent biometric deletion confirmed by administrator.",
    }, mutation);
    const references = await listFaceReferenceStorageKeys(params.data.id);
    let deletionPending = false;
    for (const reference of references) {
      try {
        if (reference.storageKey) await deleteFaceReferenceFile(reference.storageKey);
        await reviewFaceReference(reference.id, { action: "confirm_deleted", storageDeleted: true }, mutation);
      } catch (error) {
        deletionPending = true;
        if (!(error instanceof FaceReferenceStorageError)) console.error("[faces] reference deletion failed", error);
      }
    }
    const localTemplatePurgePending = await faceIdentityHasPendingLocalTemplatePurge(params.data.id);
    return facePrivateJson({
      ok: true,
      id: params.data.id,
      deletionPending,
      localTemplatePurgePending,
      state: deletionPending || localTemplatePurgePending ? "purge_pending" : "purged",
    }, deletionPending || localTemplatePurgePending ? 202 : 200);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

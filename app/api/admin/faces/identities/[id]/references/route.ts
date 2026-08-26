import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceReferenceCreateSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { faceReferenceUploadsAreEnabled, FACE_REFERENCE_MAX_BYTES } from "@/lib/face-recognition-policy";
import { listFaceReferences, registerFaceReference } from "@/lib/face-recognition-store";
import {
  deleteFaceReferenceFile,
  FaceReferenceStorageError,
  storeFaceReferenceFile,
} from "@/lib/face-reference-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const Uuid = z.string().uuid();

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  if (!Uuid.safeParse(id).success) return facePrivateJson({ error: "invalid identity id" }, 400);
  return facePrivateJson({ references: await listFaceReferences(id) });
}

export async function POST(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  if (!faceReferenceUploadsAreEnabled()) {
    return facePrivateJson({ error: "Face-reference uploads are deployment-gated." }, 503);
  }
  const identityId = (await params).id;
  if (!Uuid.safeParse(identityId).success) return facePrivateJson({ error: "invalid identity id" }, 400);
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > FACE_REFERENCE_MAX_BYTES + 256 * 1024) {
    return facePrivateJson({ error: "reference upload is too large" }, 413);
  }
  const form = await request.formData().catch(() => null);
  if (!form) return facePrivateJson({ error: "invalid multipart reference upload" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return facePrivateJson({ error: "reference image is required" }, 400);
  const parsed = FaceReferenceCreateSchema.safeParse({
    identityId,
    sourceKind: form.get("sourceKind"),
    subjectApproved: form.get("subjectApproved") === "true",
    capturedAt: typeof form.get("capturedAt") === "string" && form.get("capturedAt")
      ? form.get("capturedAt")
      : undefined,
    notes: typeof form.get("notes") === "string" && form.get("notes")
      ? form.get("notes")
      : undefined,
  });
  if (!parsed.success) return facePrivateJson({ error: "invalid subject-approved reference metadata", detail: parsed.error.flatten() }, 400);
  let stored: Awaited<ReturnType<typeof storeFaceReferenceFile>> | null = null;
  try {
    stored = await storeFaceReferenceFile(file);
    const result = await registerFaceReference({ ...parsed.data, ...stored }, {
      actor: auth,
      requestId: faceRequestId(request),
    });
    return facePrivateJson({ ok: true, ...result }, 201);
  } catch (error) {
    if (stored) await deleteFaceReferenceFile(stored.storageKey).catch(() => undefined);
    if (error instanceof FaceReferenceStorageError) {
      return facePrivateJson({ error: error.message }, error.status);
    }
    return faceStoreErrorResponse(error);
  }
}

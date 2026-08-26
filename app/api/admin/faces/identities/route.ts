import { requireAdmin } from "@/lib/admin-api";
import { FaceIdentityCreateSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { createFaceIdentity, listFaceIdentities } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  return facePrivateJson({ identities: await listFaceIdentities() });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const parsed = FaceIdentityCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "invalid identity or consent", detail: parsed.error.flatten() }, 400);
  try {
    const result = await createFaceIdentity(parsed.data, {
      actor: auth,
      requestId: faceRequestId(request),
    });
    return facePrivateJson({ ok: true, ...result }, 201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

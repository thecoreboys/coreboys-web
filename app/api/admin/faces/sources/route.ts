import { requireAdmin } from "@/lib/admin-api";
import { FaceSourceCreateSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { createFaceSource, listFaceSources } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  return facePrivateJson({ sources: await listFaceSources() });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const parsed = FaceSourceCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "invalid source", detail: parsed.error.flatten() }, 400);
  try {
    const result = await createFaceSource(parsed.data, { actor: auth, requestId: faceRequestId(request) });
    return facePrivateJson({ ok: true, ...result }, 201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { reviewFaceTrack } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const Uuid = z.string().uuid();
const Body = z.object({
  public: z.literal(false),
  reason: z.string().trim().min(3).max(500),
}).strict();

export async function PATCH(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!Uuid.safeParse(id).success || !body.success) return facePrivateJson({ error: "invalid unpublish action" }, 400);
  try {
    const result = await reviewFaceTrack(id, { action: "withdraw", reason: body.data.reason }, {
      actor: auth,
      requestId: faceRequestId(request),
    });
    return facePrivateJson({ ok: true, ...result });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

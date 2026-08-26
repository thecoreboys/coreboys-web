import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { updateFaceJob } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const Body = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export async function POST(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success) return facePrivateJson({ error: "invalid job cancellation" }, 400);
  try {
    const result = await updateFaceJob(id, { action: "cancel", reason: body.data.reason }, {
      actor: auth,
      requestId: faceRequestId(request),
    });
    return facePrivateJson({ ok: true, ...result });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

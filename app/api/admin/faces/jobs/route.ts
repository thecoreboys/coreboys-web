import { requireAdmin } from "@/lib/admin-api";
import { FaceJobCreateSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { createFaceJob, listFaceJobs } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";
import { wakeFaceWorker } from "@/lib/face-worker-wake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const sourceId = new URL(request.url).searchParams.get("sourceId") ?? undefined;
  return facePrivateJson({ jobs: await listFaceJobs(sourceId) });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const parsed = FaceJobCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "invalid job", detail: parsed.error.flatten() }, 400);
  try {
    const result = await createFaceJob(parsed.data, { actor: auth, requestId: faceRequestId(request) });
    const wake=result.status==="queued"||result.status==="leased"||result.status==="running"?await wakeFaceWorker():{};
    return facePrivateJson({ ok: true, ...result,...wake }, result.reused?200:201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

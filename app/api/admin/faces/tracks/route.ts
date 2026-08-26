import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceTrackCreateSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import { createManualFaceTrack, listFaceTracks } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  sourceId: z.string().uuid().optional(),
  state: z.enum(["proposed", "unknown", "approved", "rejected", "published", "withdrawn"]).optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return facePrivateJson({ error: "invalid track filters" }, 400);
  return facePrivateJson({ tracks: await listFaceTracks(parsed.data) });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const parsed = FaceTrackCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "invalid manual track", detail: parsed.error.flatten() }, 400);
  try {
    const result = await createManualFaceTrack(parsed.data, { actor: auth, requestId: faceRequestId(request) });
    return facePrivateJson({ ok: true, ...result }, 201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

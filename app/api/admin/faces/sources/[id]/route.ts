import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceSourceActionSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import {
  configureFaceSource,
  listFaceSources,
  updateFaceSource,
} from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const Uuid = z.string().uuid();
const UiPatch = z.object({
  mode: z.enum(["manual_only", "review_only"]),
  recognitionEnabled: z.boolean(),
  allowedIdentityIds: z.array(Uuid).max(100),
  allVisiblePeopleConsented: z.boolean().optional(),
}).strict();

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  if (!Uuid.safeParse(id).success) return facePrivateJson({ error: "invalid source id" }, 400);
  const source = (await listFaceSources(id))[0];
  return source ? facePrivateJson({ source }) : facePrivateJson({ error: "source not found" }, 404);
}

export async function PATCH(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  if (!Uuid.safeParse(id).success) return facePrivateJson({ error: "invalid source id" }, 400);
  const raw = await request.json().catch(() => null);
  const generic = FaceSourceActionSchema.safeParse(raw);
  const ui = UiPatch.safeParse(raw);
  if (!generic.success && !ui.success) return facePrivateJson({ error: "invalid source action" }, 400);
  try {
    const mutation = { actor: auth, requestId: faceRequestId(request) };
    let result;
    if (generic.success) {
      result = await updateFaceSource(id, generic.data, mutation);
    } else {
      if (!ui.success) return facePrivateJson({ error: "invalid source action" }, 400);
      result = await configureFaceSource(id, {
          mode: ui.data.mode,
          recognitionEnabled: ui.data.mode === "manual_only" ? false : ui.data.recognitionEnabled,
          allowedIdentityIds: ui.data.allowedIdentityIds,
          state: "active",
          allVisiblePeopleConsented: ui.data.allVisiblePeopleConsented,
        }, mutation);
    }
    return facePrivateJson({ ok: true, ...result });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

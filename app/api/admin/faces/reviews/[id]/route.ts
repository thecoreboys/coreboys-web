import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import type { FaceTrackActionInput } from "@/lib/face-recognition-contracts";
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
  action: z.enum(["assign", "unknown", "approve", "reject", "publish", "unpublish"]),
  identityId: Uuid.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  publishedPresenceId: Uuid.nullable().optional(),
  sourceMomentVerified: z.literal(true).optional(),
}).strict();

export async function PATCH(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const id = (await params).id;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!Uuid.safeParse(id).success || !body.success) return facePrivateJson({ error: "invalid review action" }, 400);
  if (body.data.publishedPresenceId && body.data.publishedPresenceId !== id) {
    return facePrivateJson({ error: "published presence does not match this review" }, 409);
  }
  let action: FaceTrackActionInput;
  const note = body.data.note ?? undefined;
  if (body.data.action === "assign") {
    if (!body.data.identityId) return facePrivateJson({ error: "identity is required for assignment" }, 400);
    action = { action: "assign", identityId: body.data.identityId, note };
  } else if (body.data.action === "unknown") {
    action = { action: "unknown", note };
  } else if (body.data.action === "approve") {
    if (body.data.sourceMomentVerified !== true) {
      return facePrivateJson({ error: "the authorized source interval must be verified before approval" }, 422);
    }
    action = { action: "approve", sourceMomentVerified: true, confidenceBand: "reviewed", note };
  } else if (body.data.action === "reject") {
    action = { action: "reject", reason: note || "Rejected by administrator." };
  } else if (body.data.action === "publish") {
    action = { action: "publish" };
  } else {
    action = { action: "withdraw", reason: note || "Unpublished by administrator." };
  }
  try {
    const result = await reviewFaceTrack(id, action, { actor: auth, requestId: faceRequestId(request) });
    return facePrivateJson({ ok: true, ...result });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

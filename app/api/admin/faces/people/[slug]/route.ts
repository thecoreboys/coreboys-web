import { requireAdmin } from "@/lib/admin-api";
import { FaceGuestProfileSchema } from "@/lib/face-people";
import { facePrivateJson, facePrivateResponse, faceRequestId, faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { saveFaceGuestProfile } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const parsed = FaceGuestProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "Enter valid profile details.", detail: parsed.error.flatten() }, 400);
  if (parsed.data.slug !== (await params).slug) return facePrivateJson({ error: "A saved profile ID cannot be changed." }, 409);
  try {
    const person = await saveFaceGuestProfile(parsed.data, "update", { actor: auth, requestId: faceRequestId(request) });
    return facePrivateJson({ person });
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

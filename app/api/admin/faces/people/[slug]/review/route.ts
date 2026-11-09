import { requireAdmin } from "@/lib/admin-api";
import { FacePersonSlugSchema, FaceProfileReviewInput } from "@/lib/face-people";
import { facePrivateJson, facePrivateResponse, faceRequestId, faceStoreErrorResponse } from "@/lib/face-recognition-http";
import { reviewFaceGuestProfile } from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const slug = FacePersonSlugSchema.safeParse((await params).slug);
  const input = FaceProfileReviewInput.safeParse(await request.json().catch(() => null));
  if (!slug.success || !input.success) return facePrivateJson({ error: "Choose a review decision and add a short note." }, 400);
  try {
    return facePrivateJson(await reviewFaceGuestProfile(slug.data, input.data, { actor: auth, requestId: faceRequestId(request) }));
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

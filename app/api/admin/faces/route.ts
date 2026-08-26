import { requireAdmin } from "@/lib/admin-api";
import { facePrivateJson, facePrivateResponse } from "@/lib/face-recognition-http";
import { getFaceAdminOverview } from "@/lib/face-recognition-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  return facePrivateJson({ overview: await getFaceAdminOverview() });
}

import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { facePrivateJson, facePrivateResponse } from "@/lib/face-recognition-http";
import { getFaceReferenceForDeletion } from "@/lib/face-recognition-store";
import { FaceReferenceStorageError, readFaceReferenceFile } from "@/lib/face-reference-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; referenceId: string }> };
const Uuid = z.string().uuid();

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const { id, referenceId } = await params;
  if (!Uuid.safeParse(id).success || !Uuid.safeParse(referenceId).success) {
    return facePrivateJson({ error: "invalid reference" }, 400);
  }
  const reference = await getFaceReferenceForDeletion(id, referenceId);
  if (!reference || !reference.storageKey || reference.state === "deleted") {
    return facePrivateJson({ error: "reference image not found" }, 404);
  }
  try {
    const image = await readFaceReferenceFile(reference.storageKey);
    return new Response(new Uint8Array(image), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline; filename=reference.webp",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": "image/webp",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FaceReferenceStorageError) {
      return facePrivateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}

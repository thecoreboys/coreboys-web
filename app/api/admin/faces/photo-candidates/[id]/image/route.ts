import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { facePrivateJson, facePrivateResponse } from "@/lib/face-recognition-http";
import { getFacePhotoCandidate } from "@/lib/face-recognition-store";
import { FaceReferenceStorageError, readFaceReferenceFile } from "@/lib/face-reference-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: {params: Promise<{id: string}>}) {
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return facePrivateJson({error:"invalid photo"},400);
  const candidate = await getFacePhotoCandidate(id);
  if (!candidate || candidate.state !== "pending") return facePrivateJson({error:"photo not found"},404);
  try {
    const image = await readFaceReferenceFile(candidate.storage_key);
    return new Response(new Uint8Array(image),{headers:{
      "Cache-Control":"private, no-store, max-age=0",
      "Content-Disposition":"inline; filename=photo-candidate.webp",
      "Content-Security-Policy":"default-src 'none'; sandbox",
      "Content-Type":"image/webp",
      "Cross-Origin-Resource-Policy":"same-origin",
      "X-Content-Type-Options":"nosniff",
    }});
  } catch (error) {
    if (error instanceof FaceReferenceStorageError) return facePrivateJson({error:error.message},error.status);
    throw error;
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  readPostcardReviewAsset,
  verifyPersistedPostcardProof,
} from "@/lib/postcard-admin-proof";
import { getPostcardOrder } from "@/lib/postcard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ id: z.string().uuid() });
const Face = z.enum(["front", "back"]);
const Asset = z.union([
  z.literal("signature"),
  z.string().regex(/^slot-[0-5]$/),
]);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: PRIVATE_HEADERS },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsedParams = Params.safeParse(await params);
  if (!parsedParams.success) return errorResponse("invalid order id", 400);

  const url = new URL(request.url);
  const face = url.searchParams.get("face");
  const asset = url.searchParams.get("asset");
  if (Number(Boolean(face)) + Number(Boolean(asset)) !== 1) {
    return errorResponse("Choose one proof face or source asset.", 400);
  }

  const order = await getPostcardOrder(parsedParams.data.id);
  if (!order || !order.hasCustomArt) return errorResponse("Postcard proof not found.", 404);

  if (face) {
    const parsedFace = Face.safeParse(face);
    if (!parsedFace.success) return errorResponse("invalid proof face", 400);
    const verified = verifyPersistedPostcardProof(order);
    if (!verified.ok) return errorResponse(verified.error, 409);
    const html = parsedFace.data === "front"
      ? verified.proof.snapshot.frontHtml
      : verified.proof.snapshot.backHtml;
    return new NextResponse(html, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Postcard-Creative-Hash": verified.proof.hash,
      },
    });
  }

  const parsedAsset = Asset.safeParse(asset);
  if (!parsedAsset.success) return errorResponse("invalid source asset", 400);
  const source = readPostcardReviewAsset(
    order,
    parsedAsset.data as `slot-${number}` | "signature",
  );
  if (!source) return errorResponse("Source asset not found.", 404);
  const body = new ArrayBuffer(source.bytes.byteLength);
  new Uint8Array(body).set(source.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": source.contentType,
      "Content-Length": String(source.bytes.byteLength),
      "Content-Disposition": "inline",
    },
  });
}

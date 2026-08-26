import { NextResponse } from "next/server";
import { getPostcardOrder } from "@/lib/postcard-store";
import {
  isPostcardOrderId,
  verifyPostcardStatusToken,
} from "@/lib/postcard-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight polling endpoint so the frontend can flip to "Postcard
 *  sent!" once the webhook has fulfilled the order. */
export async function GET(req: Request) {
  const search = new URL(req.url).searchParams;
  const orderId = search.get("orderId") ?? "";
  const statusToken = search.get("statusToken") ?? "";
  if (!isPostcardOrderId(orderId) || !statusToken) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const order = await getPostcardOrder(orderId);
    if (
      !order
      || !order.statusTokenHash
      || !verifyPostcardStatusToken(statusToken, order.statusTokenHash)
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const proofUrl = order.status === "proof" && order.providerMode === "test"
      ? safeHttpsUrl(order.providerUrl)
      : null;
    return NextResponse.json({
      orderId: order.id,
      status: order.status,
      providerMode: order.providerMode,
      amountCents: order.amountCents,
      ...(proofUrl ? { proofUrl } : {}),
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

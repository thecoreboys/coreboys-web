import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isMissingPostcardStudioSchema,
  loadFanPostcardPackCatalog,
} from "@/lib/postcard-fan-pack-store";
import { isPostcardPackRecipient } from "@/lib/postcard-fan-packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  // Release-window checks are time-sensitive; do not serve a drop after its
  // authoritative end time from an intermediary cache.
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest) {
  const recipientSlug = request.nextUrl.searchParams.get("recipient") ?? "";
  if (!isPostcardPackRecipient(recipientSlug)) {
    return NextResponse.json(
      { error: "Choose a valid postcard recipient." },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }

  try {
    const catalog = await loadFanPostcardPackCatalog(recipientSlug);
    return NextResponse.json(catalog, { headers: SAFE_HEADERS });
  } catch (error) {
    if (isMissingPostcardStudioSchema(error)) {
      // Deployments can safely serve the original creator catalog while the
      // additive Postcard Studio migration is still rolling out.
      return NextResponse.json(
        { available: false, recipientSlug, packs: [] },
        { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
      );
    }
    console.error("[postcard] published pack catalog unavailable", error);
    return NextResponse.json(
      { available: false, recipientSlug, packs: [] },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
}

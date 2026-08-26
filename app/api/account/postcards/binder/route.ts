import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  getPrivatePostcardBinder,
  PostcardCollectibleInfrastructureError,
} from "@/lib/postcard-collectible-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ownerUserId = await getCurrentFanUserId();
  if (!ownerUserId) {
    return NextResponse.json(
      { error: "Sign in to open your postcard binder." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const binder = await getPrivatePostcardBinder(ownerUserId);
    return NextResponse.json(
      { available: true, ...binder },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PostcardCollectibleInfrastructureError) {
      return NextResponse.json(
        { available: false, reason: "not_configured", items: [], progress: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error("[postcard] private binder lookup failed", error);
    return NextResponse.json(
      { error: "Your postcard binder is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { postcardIdentityFor } from "@/lib/postcard-identities";
import {
  listEligiblePostcardCollectibles,
  PostcardCollectibleInfrastructureError,
} from "@/lib/postcard-collectible-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ownerUserId = await getCurrentFanUserId();
  if (!ownerUserId) {
    return NextResponse.json(
      { error: "Sign in to choose a collectible release.", authRequired: true },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const url = new URL(request.url);
  const memberSlug = url.searchParams.get("recipient")?.trim() ?? "";
  const designId = url.searchParams.get("design")?.trim() ?? "";
  const identity = postcardIdentityFor(memberSlug);
  if (!identity || !identity.frontDesigns.some((design) => design.id === designId)) {
    return NextResponse.json(
      { error: "Pick a valid recipient and design." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const releases = await listEligiblePostcardCollectibles(memberSlug, designId);
    return NextResponse.json(
      { available: true, releases },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PostcardCollectibleInfrastructureError) {
      return NextResponse.json(
        { available: false, reason: "not_configured", releases: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error("[postcard] collectible catalog lookup failed", error);
    return NextResponse.json(
      { error: "Collectible releases are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

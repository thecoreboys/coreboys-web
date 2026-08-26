import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import {
  describePostcardReviewAssets,
  verifyPersistedPostcardProof,
} from "@/lib/postcard-admin-proof";
import { listPostcardOrdersForReview } from "@/lib/postcard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The artwork itself is private order data, so this endpoint deliberately sits
 * behind the live admin-session check. Only the fields needed to make the
 * safety decision are returned; addresses, status tokens, base64 artwork, and
 * print HTML never join this list payload. The UI streams those through the
 * authenticated, order-scoped creative endpoint instead.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const pending = await listPostcardOrdersForReview();
  const orders = pending
    .filter((order) => order.hasCustomArt)
    .map((order) => {
      const proof = verifyPersistedPostcardProof(order);
      const inventory = describePostcardReviewAssets(order);
      return {
        id: order.id,
        recipientSlug: order.recipientSlug,
        recipientName: MEMBERS_BY_SLUG[order.recipientSlug]?.stageName ?? order.recipientSlug,
        message: order.message,
        designId: order.designId,
        hasCustomArt: order.hasCustomArt,
        assetCount: order.assetCount,
        senderName: order.senderName,
        providerMode: order.providerMode,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        fulfillmentAttempts: order.fulfillmentAttempts,
        lastFulfillmentError: order.lastFulfillmentError,
        createdAt: order.createdAt,
        proofVerified: proof.ok,
        proofHash: proof.ok ? proof.proof.hash : null,
        proofError: proof.ok ? null : proof.error,
        sourceAssets: inventory.assets,
        expectedPhotoCount: inventory.expectedPhotoCount,
        sourceAssetsComplete: inventory.complete,
      };
    });

  return NextResponse.json(
    { orders },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

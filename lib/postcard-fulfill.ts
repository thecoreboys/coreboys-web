/**
 * One-shot fulfilment coordinator shared by the Stripe webhook and keyless
 * local sandbox. Provider-mode authorization happens before an atomic DB
 * claim, so duplicate webhooks cannot create duplicate physical cards.
 */
import { PostcardPermanentFulfillmentError, sendPostcard } from "./print-mail";
import { resolvePostcardProviderMode } from "./postcard-mode";
import {
  claimPostcardFulfillment,
  getPostcardOrder,
  releasePostcardFulfillment,
  setOrderStatus,
  type PostcardOrder,
} from "./postcard-store";
import {
  isPostcardCollectibleReadyForFulfillment,
  issuePostcardCollectibleForOrder,
} from "./postcard-collectible-store";

export type FulfillOrderOptions = {
  /** A signature-verified successful Stripe PaymentIntent id. */
  verifiedPaymentIntentId?: string;
};

export async function fulfillOrder(
  order: PostcardOrder,
  options: FulfillOrderOptions = {},
): Promise<{ ok: boolean; status: string; providerId?: string; claimed?: boolean }> {
  const configuration = resolvePostcardProviderMode();
  if (!configuration.ok) {
    console.error("[postcard] refusing fulfilment:", configuration.reason);
    return { ok: false, status: order.status, claimed: false };
  }
  if (order.providerMode !== configuration.mode) {
    console.error(
      `[postcard] refusing fulfilment for ${order.id}: order mode ${order.providerMode}, current mode ${configuration.mode}`,
    );
    return { ok: false, status: order.status, claimed: false };
  }

  const isSandbox = configuration.mode === "sandbox";
  const isAuthorized = isSandbox
    ? order.status === "created" && !order.stripePaymentIntent && !options.verifiedPaymentIntentId
    : (order.status === "paid" || order.status === "fulfilling")
      && Boolean(order.stripePaymentIntent)
      && options.verifiedPaymentIntentId === order.stripePaymentIntent;

  if (!isAuthorized) {
    console.error(`[postcard] refusing unauthorized ${configuration.mode} fulfilment for ${order.id}`);
    return { ok: false, status: order.status, claimed: false };
  }

  if (
    configuration.mode === "live"
    && !(await isPostcardCollectibleReadyForFulfillment(order.id, order.fanUserId))
  ) {
    // Never hand a card to Lob and only then discover that its collectible
    // inventory was not secured at payment confirmation.
    await setOrderStatus(order.id, "failed");
    return { ok: false, status: "failed", claimed: false };
  }

  const claimed = await claimPostcardFulfillment(order.id, [isSandbox ? "created" : "paid"]);
  if (!claimed) {
    const current = await getPostcardOrder(order.id);
    const safelyCompleted = Boolean(current && [
      "proof",
      "printing",
      "mailed",
      "sent",
    ].includes(current.status));
    return {
      ok: safelyCompleted,
      status: current?.status ?? order.status,
      providerId: current?.providerId ?? undefined,
      claimed: false,
    };
  }

  try {
    const result = await sendPostcard({
      id: order.id,
      recipientSlug: order.recipientSlug,
      message: order.message,
      designId: order.designId,
      imageDataUrl: order.imageUrl,
      senderName: order.senderName ?? undefined,
      returnAddress: order.returnAddress,
      variationSeed: order.variationSeed ?? order.id,
      draft: order.draftCreative,
    }, configuration.mode, {
      identityId: order.identityId,
      identityVersion: order.identityVersion,
      archetypeId: order.archetypeId,
      templateId: order.templateId,
      rendererVersion: order.rendererVersion,
      variationAlgorithmVersion: order.variationAlgorithmVersion,
      resolvedVariation: order.resolvedVariation,
      snapshotVersion: order.snapshotVersion,
      frontHtml: order.creativeFrontHtml,
      backHtml: order.creativeBackHtml,
      creativeHash: order.creativeHash,
    });
    const status = result.mode === "live" ? "printing" : result.mode === "test" ? "proof" : "sent";
    await setOrderStatus(order.id, status, result.id, result.url ?? null);
    if (result.mode === "live") {
      try {
        // The database function is idempotent and is the only authority that
        // allocates serials. It runs only after Lob accepted the live print.
        await issuePostcardCollectibleForOrder(order.id, order.fanUserId);
      } catch (issuanceError) {
        // Lob already accepted the physical card, so never retry fulfilment and
        // create a duplicate mailing. The requested intent remains visible to
        // operations for a safe idempotent issuance retry.
        console.error(`[postcard] collectible issuance needs retry for ${order.id}`, issuanceError);
      }
    }
    return { ok: true, status, providerId: result.id, claimed: true };
  } catch (error) {
    console.error(`[postcard] fulfilment failed for ${order.id}`, error);
    if (isSandbox || error instanceof PostcardPermanentFulfillmentError) {
      await setOrderStatus(order.id, "failed");
      return { ok: false, status: "failed", claimed: true };
    }

    // A provider timeout may have succeeded remotely. Return the order to
    // `paid` and let Stripe retry with the same Lob idempotency key instead
    // of converting a temporary/unknown response into a permanent failure.
    const released = await releasePostcardFulfillment(
      order.id,
      error instanceof Error ? error.message : "Unknown print-provider failure.",
    );
    return { ok: false, status: released ? "paid" : "fulfilling", claimed: true };
  }
}

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import {
  deleteConnectionByProviderUser,
} from "@/lib/oauth/connections";
import { tiktokAppCredentials } from "@/lib/oauth/providers";
import { fetchTikTokFeedResult, SOCIAL_FEED_CACHE_TAG } from "@/lib/social-feed";
import { credentialStateForOfficialFeed } from "@/lib/social-ingestion-health";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import {
  completeWebhookReceipt,
  failWebhookReceipt,
  recordSocialEvent,
  recordWebhookReceipt,
  socialEventFromFeedItem,
  upsertSocialSource,
} from "@/lib/social-events";
import { matchesTikTokHmac } from "@/lib/social-webhooks";
import { creatorHandleForProviderUserId } from "@/lib/watch/social-credentials";
import { normalizeCreatorProviderUserId } from "@/lib/watch/social-credential-map";
import { creatorSocialOwner } from "@/lib/watch/social-source-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
type TikTokBody = {
  client_key?: string;
  event?: string;
  create_time?: number;
  user_openid?: string;
  content?: string;
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const appCredentials = tiktokAppCredentials();
  if (!appCredentials) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  if (!matchesTikTokHmac(appCredentials.clientSecret, raw, request.headers.get("tiktok-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let body: TikTokBody;
  try {
    body = JSON.parse(raw) as TikTokBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const configuredClientKey = appCredentials.clientKey;
  const suppliedClientKey = typeof body.client_key === "string" ? body.client_key.trim() : "";
  if (configuredClientKey && suppliedClientKey !== configuredClientKey) {
    return NextResponse.json({ error: "invalid_client_key" }, { status: 403 });
  }
  const externalId = createHash("sha256").update(raw).digest("hex");
  const eventType = typeof body.event === "string" && body.event.trim()
    ? body.event.trim().toLowerCase()
    : "tiktok";
  const receipt = await recordWebhookReceipt({
    provider: "tiktok",
    externalEventId: externalId,
    eventType,
    signatureValid: true,
    payload: body,
  });

  if (receipt.shouldProcess && receipt.id && receipt.attempt) {
    const receiptId = receipt.id;
    const receiptAttempt = receipt.attempt;
    after(async () => {
      try {
        const providerUserId = normalizeCreatorProviderUserId(body.user_openid);
        if (providerUserId) {
          const configuredHandle = creatorHandleForProviderUserId("tiktok", providerUserId);
          const owner = creatorSocialOwner("tiktok", configuredHandle);
          const accountRef = owner?.handle ?? providerUserId;
          const removed = eventType === "authorization.removed";
          if (removed) await deleteConnectionByProviderUser("tiktok", providerUserId);
          if (!owner || removed) {
            await upsertSocialSource({
              provider: "tiktok",
              accountRef,
              memberSlug: owner?.memberSlug ?? null,
              accountLabel: owner?.accountLabel ?? "TikTok",
              credentialState: removed ? "expired" : "unknown",
              webhookState: "verified",
              cursor: externalId,
              error: removed ? "authorization_removed" : "tiktok_unmapped_provider_user_id",
              received: true,
            });
          } else {
            const feed = await fetchTikTokFeedResult(
              owner.handle,
              owner.memberSlug,
              owner.accountLabel,
              12,
            );
            const credentialState = credentialStateForOfficialFeed(feed.state);
            await upsertSocialSource({
              provider: "tiktok",
              accountRef,
              memberSlug: owner.memberSlug,
              accountLabel: owner.accountLabel,
              credentialState,
              webhookState: "verified",
              cursor: externalId,
              error: credentialState === "healthy" ? null : `tiktok_${feed.state}`,
              received: true,
            });
            let recordedEvents = 0;
            for (const item of feed.items) {
              const event = socialEventFromFeedItem(item);
              if (!event) continue;
              await recordSocialEvent(event);
              recordedEvents += 1;
            }
            if (recordedEvents > 0) await drainSocialNotificationDeliveries(100);
          }
          revalidateTag(SOCIAL_FEED_CACHE_TAG);
        }
        await completeWebhookReceipt(receiptId, receiptAttempt);
      } catch (error) {
        await failWebhookReceipt(receiptId, receiptAttempt, error).catch((receiptError) => {
          console.error("tiktok webhook receipt failure update failed", receiptError);
        });
        console.error("tiktok webhook processing failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}

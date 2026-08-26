import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import {
  deleteConnectionByProviderUser,
} from "@/lib/oauth/connections";
import { fetchTikTokFeed, SOCIAL_FEED_CACHE_TAG } from "@/lib/social-feed";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import {
  recordSocialEvent,
  recordWebhookReceipt,
  socialEventFromFeedItem,
  upsertSocialSource,
} from "@/lib/social-events";
import { matchesTikTokHmac } from "@/lib/social-webhooks";
import { creatorHandleForProviderUserId } from "@/lib/watch/social-credentials";
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
  if (!matchesTikTokHmac(process.env.TIKTOK_CLIENT_SECRET, raw, request.headers.get("tiktok-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let body: TikTokBody;
  try {
    body = JSON.parse(raw) as TikTokBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const configuredClientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  if (configuredClientKey && body.client_key !== configuredClientKey) {
    return NextResponse.json({ error: "invalid_client_key" }, { status: 403 });
  }
  const externalId = createHash("sha256").update(raw).digest("hex");
  const receipt = await recordWebhookReceipt({
    provider: "tiktok",
    externalEventId: externalId,
    eventType: String(body.event ?? "tiktok"),
    signatureValid: true,
    payload: body,
  });

  if (receipt.created) {
    after(async () => {
      const providerUserId = body.user_openid?.trim();
      if (!providerUserId) return;
      try {
        const configuredHandle = creatorHandleForProviderUserId("tiktok", providerUserId);
        const owner = creatorSocialOwner("tiktok", configuredHandle);
        const accountRef = owner?.handle ?? providerUserId;
        const removed = body.event === "authorization.removed";
        if (removed) await deleteConnectionByProviderUser("tiktok", providerUserId);
        await upsertSocialSource({
          provider: "tiktok",
          accountRef,
          memberSlug: owner?.memberSlug ?? null,
          accountLabel: owner?.accountLabel ?? "TikTok",
          credentialState: removed ? "expired" : owner ? "healthy" : "unknown",
          webhookState: "verified",
          cursor: externalId,
          error: removed ? "authorization_removed" : null,
          received: true,
        });

        if (owner && !removed) {
          const items = await fetchTikTokFeed(owner.handle, owner.memberSlug, owner.accountLabel, 12);
          let createdEvents = 0;
          for (const item of items) {
            const event = socialEventFromFeedItem(item);
            if (!event) continue;
            const result = await recordSocialEvent(event);
            if (result.created) createdEvents += 1;
          }
          if (createdEvents > 0) await drainSocialNotificationDeliveries(100);
          revalidateTag(SOCIAL_FEED_CACHE_TAG);
        }
      } catch (error) {
        console.error("tiktok webhook processing failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { fetchInstagramFeedResult, SOCIAL_FEED_CACHE_TAG } from "@/lib/social-feed";
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
import { matchesHmac } from "@/lib/social-webhooks";
import { resolveMetaWebhookAppSecret } from "@/lib/social-webhook-config";
import { creatorHandleForProviderUserId } from "@/lib/watch/social-credentials";
import { normalizeCreatorProviderUserId } from "@/lib/watch/social-credential-map";
import { creatorSocialOwner } from "@/lib/watch/social-source-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
type MetaBody = {
  object?: string;
  entry?: Array<{ id?: string; time?: number; changes?: unknown[] }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const configured = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (
    configured
    && url.searchParams.get("hub.mode") === "subscribe"
    && url.searchParams.get("hub.verify_token") === configured
  ) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ error: "invalid_challenge" }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const appSecret = resolveMetaWebhookAppSecret({
    metaAppSecret: process.env.META_APP_SECRET,
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
    instagramClientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
  });
  if (!matchesHmac(appSecret ?? undefined, raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let body: MetaBody;
  try {
    body = JSON.parse(raw) as MetaBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const externalId = createHash("sha256").update(raw).digest("hex");
  const objectType = typeof body.object === "string" && body.object.trim()
    ? body.object.trim().toLowerCase()
    : "meta";
  const receipt = await recordWebhookReceipt({
    provider: "instagram",
    externalEventId: externalId,
    eventType: objectType,
    signatureValid: true,
    payload: body,
  });
  if (receipt.shouldProcess && receipt.id && receipt.attempt) {
    const receiptId = receipt.id;
    const receiptAttempt = receipt.attempt;
    after(async () => {
      try {
        let recordedEvents = 0;
        const sourceFailures: unknown[] = [];
        const providerUserIds = new Set(
          (Array.isArray(body.entry) ? body.entry : [])
            .map((entry) => normalizeCreatorProviderUserId(entry?.id))
            .filter((id): id is string => Boolean(id)),
        );
        for (const providerUserId of providerUserIds) {
          try {
            const configuredHandle = creatorHandleForProviderUserId("instagram", providerUserId);
            const owner = creatorSocialOwner("instagram", configuredHandle);
            if (!owner) {
              await upsertSocialSource({
                provider: "instagram",
                accountRef: providerUserId,
                memberSlug: null,
                accountLabel: "Instagram",
                credentialState: "unknown",
                webhookState: "verified",
                cursor: externalId,
                error: "instagram_unmapped_provider_user_id",
                received: true,
              });
            } else {
              // Meta change payloads intentionally omit the complete media row.
              // Fetch the bounded official account window without the normal
              // cache so the new Reel/photo can reach the catalog immediately.
              const feed = await fetchInstagramFeedResult(
                owner.handle,
                owner.memberSlug,
                owner.accountLabel,
                12,
                { fresh: true },
              );
              const credentialState = credentialStateForOfficialFeed(feed.state);
              await upsertSocialSource({
                provider: "instagram",
                accountRef: owner.handle,
                memberSlug: owner.memberSlug,
                accountLabel: owner.accountLabel,
                credentialState,
                webhookState: "verified",
                cursor: externalId,
                error: credentialState === "healthy" ? null : `instagram_${feed.state}`,
                received: true,
              });
              for (const item of feed.items) {
                const event = socialEventFromFeedItem(item);
                if (!event) continue;
                await recordSocialEvent(event);
                recordedEvents += 1;
              }
            }
          } catch (error) {
            sourceFailures.push(error);
            console.error("instagram webhook source update failed", error);
          }
        }
        if (sourceFailures.length > 0) throw sourceFailures[0];
        if (recordedEvents > 0) await drainSocialNotificationDeliveries(100);
        revalidateTag(SOCIAL_FEED_CACHE_TAG);
        await completeWebhookReceipt(receiptId, receiptAttempt);
      } catch (error) {
        await failWebhookReceipt(receiptId, receiptAttempt, error).catch((receiptError) => {
          console.error("instagram webhook receipt failure update failed", receiptError);
        });
        console.error("instagram webhook processing failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { fetchInstagramFeed, SOCIAL_FEED_CACHE_TAG } from "@/lib/social-feed";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import {
  recordSocialEvent,
  recordWebhookReceipt,
  socialEventFromFeedItem,
  upsertSocialSource,
} from "@/lib/social-events";
import { matchesHmac } from "@/lib/social-webhooks";
import { creatorHandleForProviderUserId } from "@/lib/watch/social-credentials";
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
  const appSecret = process.env.META_APP_SECRET
    || process.env.FACEBOOK_APP_SECRET
    || process.env.INSTAGRAM_CLIENT_SECRET;
  if (!matchesHmac(appSecret, raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let body: MetaBody;
  try {
    body = JSON.parse(raw) as MetaBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const externalId = createHash("sha256").update(raw).digest("hex");
  const receipt = await recordWebhookReceipt({
    provider: "instagram",
    externalEventId: externalId,
    eventType: String(body.object ?? "meta"),
    signatureValid: true,
    payload: body,
  });
  if (receipt.created) {
    after(async () => {
      let createdEvents = 0;
      for (const providerUserId of new Set((body.entry ?? []).map((entry) => entry.id).filter(Boolean) as string[])) {
        try {
          const configuredHandle = creatorHandleForProviderUserId("instagram", providerUserId);
          const owner = creatorSocialOwner("instagram", configuredHandle);
          await upsertSocialSource({
            provider: "instagram",
            accountRef: owner?.handle ?? providerUserId,
            memberSlug: owner?.memberSlug ?? null,
            accountLabel: owner?.accountLabel ?? "Instagram",
            credentialState: owner ? "healthy" : "unknown",
            webhookState: "verified",
            cursor: externalId,
            received: true,
          });
          if (owner) {
            // Meta change payloads intentionally omit the complete media row.
            // Fetch the bounded official account window without the normal
            // cache so the new Reel/photo can reach the catalog immediately.
            const items = await fetchInstagramFeed(
              owner.handle,
              owner.memberSlug,
              owner.accountLabel,
              12,
              { fresh: true },
            );
            for (const item of items) {
              const event = socialEventFromFeedItem(item);
              if (!event) continue;
              const result = await recordSocialEvent(event);
              if (result.created) createdEvents += 1;
            }
          }
        } catch (error) {
          console.error("instagram webhook source update failed", error);
        }
      }
      if (createdEvents > 0) await drainSocialNotificationDeliveries(100);
      revalidateTag(SOCIAL_FEED_CACHE_TAG);
    });
  }
  return NextResponse.json({ ok: true });
}

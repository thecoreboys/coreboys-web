import { after, NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { fetchUserIdsByLogin } from "@/lib/twitch";
import {
  completeWebhookReceipt,
  failWebhookReceipt,
  recordSocialEvent,
  recordWebhookReceipt,
  upsertSocialSource,
} from "@/lib/social-events";
import { freshTimestamp, matchesHmac } from "@/lib/social-webhooks";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
type EventSubBody = {
  challenge?: string;
  subscription?: {
    type?: string;
    status?: string;
    condition?: Record<string, unknown>;
  };
  event?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const id = request.headers.get("twitch-eventsub-message-id");
  const timestamp = request.headers.get("twitch-eventsub-message-timestamp");
  const messageType = request.headers.get("twitch-eventsub-message-type") ?? "notification";
  const signature = request.headers.get("twitch-eventsub-message-signature");
  const valid = Boolean(
    id
    && freshTimestamp(timestamp)
    && matchesHmac(process.env.TWITCH_EVENTSUB_SECRET, `${id}${timestamp ?? ""}${raw}`, signature),
  );
  if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 403 });

  let body: EventSubBody;
  try {
    body = JSON.parse(raw) as EventSubBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (messageType === "webhook_callback_verification") {
    const challenge = body.challenge ?? "";
    const broadcasterId = String(body.subscription?.condition?.broadcaster_user_id ?? "");
    if (challenge && broadcasterId) {
      after(async () => {
        try {
          const ids = await fetchUserIdsByLogin(MEMBERS.map((member) => member.twitchLogin));
          const member = MEMBERS.find(
            (entry) => ids[entry.twitchLogin.toLowerCase()] === broadcasterId,
          );
          if (!member) return;
          await upsertSocialSource({
            provider: "twitch",
            accountRef: member.twitchLogin.toLowerCase(),
            memberSlug: member.slug,
            accountLabel: member.stageName,
            credentialState: "healthy",
            webhookState: "verified",
            cursor: id,
            received: true,
          });
        } catch (error) {
          console.error("twitch webhook verification update failed", error);
        }
      });
    }
    return new NextResponse(challenge, {
      status: challenge ? 200 : 400,
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": String(Buffer.byteLength(challenge)),
        "Cache-Control": "no-store",
      },
    });
  }

  const subscriptionType = body.subscription?.type ?? messageType;
  const receipt = await recordWebhookReceipt({
    provider: "twitch",
    externalEventId: id,
    eventType: subscriptionType,
    signatureValid: true,
    payload: body,
  });
  if (receipt.shouldProcess && receipt.id && receipt.attempt) {
    const receiptId = receipt.id;
    const receiptAttempt = receipt.attempt;
    after(async () => {
      try {
        const event = body.event;
        const login = String(event?.broadcaster_user_login ?? "").toLowerCase();
        const member = MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === login);
        if (member) {
          await upsertSocialSource({
            provider: "twitch",
            accountRef: login,
            memberSlug: member.slug,
            accountLabel: member.stageName,
            credentialState: "healthy",
            webhookState: messageType === "revocation" ? "error" : "verified",
            cursor: id,
            error: messageType === "revocation" ? body.subscription?.status ?? "revoked" : null,
            received: true,
          });
        }
        if (subscriptionType === "stream.online" && event && member) {
          await recordSocialEvent({
            provider: "twitch",
            memberSlug: member.slug,
            contentType: "live",
            canonicalId: `twitch:${String(event.id ?? login)}`,
            title: String(event.title ?? "") || `${member.stageName} is live`,
            body: "Twitch live now",
            href: `https://www.twitch.tv/${login}`,
            publishedAt: String(event.started_at ?? new Date().toISOString()),
            platformPayload: event,
          });
          await drainSocialNotificationDeliveries(100);
        }
        await completeWebhookReceipt(receiptId, receiptAttempt);
      } catch (error) {
        await failWebhookReceipt(receiptId, receiptAttempt, error).catch((receiptError) => {
          console.error("twitch webhook receipt failure update failed", receiptError);
        });
        console.error("twitch webhook processing failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}

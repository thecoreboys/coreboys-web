import { after, NextResponse } from "next/server";
import { configuredXFeedAccounts } from "@/lib/x-feed-upstream";
import { appendXFeedSnapshotItems, purgeRemovedXFeedSnapshotItems } from "@/lib/x-feed-snapshot";
import { filterAvailableContent, recordContentRemoval } from "@/lib/content-availability";
import { recordSocialEvent, socialEventFromFeedItem, upsertSocialSource } from "@/lib/social-events";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import { parseXActivityAccountBindings, parseXDeleteWebhook, parseXStreamWebhook, readXWebhookBody, verifyXWebhookSignature, xWebhookCrcResponse } from "@/lib/x-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secrets() {
  return { clientSecret: process.env.X_CLIENT_SECRET, consumerSecret: process.env.X_API_SECRET };
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const configured = secrets();
  if (!configured.clientSecret?.trim() && !configured.consumerSecret?.trim()) return reply({ error: "webhook_not_configured" }, 503);
  const token = xWebhookCrcResponse(new URL(request.url).searchParams.get("crc_token"), configured);
  return token ? reply({ response_token: token }) : reply({ error: "invalid_crc_token" }, 400);
}

export async function POST(request: Request) {
  const configured = secrets();
  if (!configured.clientSecret?.trim() && !configured.consumerSecret?.trim()) return reply({ error: "webhook_not_configured" }, 503);
  const raw = await readXWebhookBody(request);
  if (!raw) return reply({ error: "payload_too_large" }, 413);
  if (!verifyXWebhookSignature(raw, request.headers, configured)) return reply({ error: "invalid_signature" }, 403);

  const accounts = configuredXFeedAccounts();
  let bindings;
  try {
    bindings = parseXActivityAccountBindings(process.env.X_ACTIVITY_ACCOUNT_BINDINGS, accounts);
  } catch {
    return reply({ error: "invalid_x_activity_configuration" }, 503);
  }
  let items;
  let deleted;
  try {
    const payload = JSON.parse(Buffer.from(raw).toString("utf8"));
    deleted = parseXDeleteWebhook(payload, bindings);
    items = deleted ? [] : parseXStreamWebhook(payload, accounts, bindings);
  } catch {
    return reply({ error: "invalid_x_stream_payload" }, 400);
  }
  try {
    if (deleted) {
      await recordContentRemoval({ provider: "x", providerId: deleted.statusId,
        sourceUrl: deleted.sourceUrl, reason: "deleted", evidence: "provider_webhook" });
      // Fresh registry checks hide the post immediately. Snapshot cleanup must
      // not delay X's acknowledgement behind an in-progress shared refresh.
      after(async () => {
        try { await purgeRemovedXFeedSnapshotItems(); }
        catch { /* The durable removal outbox retries cleanup. */ }
      });
      return reply({ received: true, accepted: 0, removed: 1 });
    }
    items = await filterAvailableContent(items);
    if (!items.length) return reply({ received: true, accepted: 0 });
    // Acknowledge only after durable writes. If a write/fanout fails, X retries;
    // canonical event IDs and delivery uniqueness prevent duplicate alerts.
    // This never performs an outbound X request or waits for the polling gate.
    await appendXFeedSnapshotItems(items);
    const uniqueEvents = new Map(items.flatMap((item) => {
      const event = socialEventFromFeedItem(item);
      return event ? [[event.canonicalId, event] as const] : [];
    }));
    for (const event of uniqueEvents.values()) await recordSocialEvent(event);
    const item = items[0]!;
    await upsertSocialSource({
      provider: "x",
      accountRef: item.x!.authorHandle.toLowerCase().replace(/^@/, ""),
      memberSlug: item.authorSlug,
      accountLabel: item.authorLabel,
      credentialState: "healthy",
      webhookState: "verified",
      cursor: item.x!.statusId,
      received: true,
    });
    // The durable delivery queue owns retries; outbound push/email is kept
    // outside X's ten-second acknowledgement window.
    after(async () => { await drainSocialNotificationDeliveries(100); });
    return reply({ received: true, accepted: uniqueEvents.size });
  } catch {
    return reply({ error: "x_stream_persistence_unavailable" }, 503);
  }
}

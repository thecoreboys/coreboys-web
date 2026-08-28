import { after, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHash } from "node:crypto";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import {
  completeWebhookReceipt,
  failWebhookReceipt,
  recordSocialEvent,
  recordWebhookReceipt,
  upsertSocialSource,
} from "@/lib/social-events";
import { configuredYouTubeWebhookChannels, SOCIAL_FEED_CACHE_TAG } from "@/lib/social-feed";
import { matchesSha1Hmac } from "@/lib/social-webhooks";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import { fetchYouTubeMetadata } from "@/lib/youtube-duration";
import { isLikelyYouTubeShort } from "@/lib/youtube-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

function xmlValue(value: string, pattern: RegExp): string {
  return value.match(pattern)?.[1]
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim() ?? "";
}

function atomEvent(raw: string) {
  const entry = raw.match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1] ?? raw;
  return {
    channelId: xmlValue(entry, /<yt:channelId>([^<]+)<\/yt:channelId>/i),
    videoId: xmlValue(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/i),
    title: xmlValue(entry, /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i),
    published: xmlValue(entry, /<published>([^<]+)<\/published>/i)
      || xmlValue(entry, /<updated>([^<]+)<\/updated>/i),
  };
}

function configuredOwner(channelId: string): { memberSlug: string | null; label: string } | null {
  const channel = configuredYouTubeWebhookChannels().find((entry) => entry.channelId === channelId);
  if (channel) return { memberSlug: channel.memberSlug, label: channel.accountLabel };

  try {
    const parsed = JSON.parse(process.env.YOUTUBE_WEBHOOK_CHANNEL_OWNERS_JSON ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const slug = (parsed as Record<string, unknown>)[channelId];
    if (slug === "core") return { memberSlug: null, label: GROUP.name };
    if (typeof slug !== "string") return null;
    const mapped = MEMBERS.find((entry) => entry.slug === slug);
    return mapped ? { memberSlug: mapped.slug, label: mapped.stageName } : null;
  } catch {
    return null;
  }
}

function topicChannelId(rawTopic: string | null): string | null {
  if (!rawTopic) return null;
  try {
    const topic = new URL(rawTopic);
    if (topic.protocol !== "https:" || topic.hostname !== "www.youtube.com" || topic.pathname !== "/feeds/videos.xml") {
      return null;
    }
    const channelId = topic.searchParams.get("channel_id")?.trim() ?? "";
    return /^[A-Za-z0-9_-]{12,80}$/.test(channelId) ? channelId : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const channelId = topicChannelId(url.searchParams.get("hub.topic"));
  const verifyToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN?.trim();
  if (
    (mode !== "subscribe" && mode !== "unsubscribe")
    || !challenge
    || !channelId
    || (verifyToken && url.searchParams.get("hub.verify_token") !== verifyToken)
  ) {
    return NextResponse.json({ error: "invalid_challenge" }, { status: 403 });
  }
  const owner = configuredOwner(channelId);
  after(async () => {
    try {
      await upsertSocialSource({
        provider: "youtube",
        accountRef: channelId,
        memberSlug: owner?.memberSlug ?? null,
        accountLabel: owner?.label ?? "YouTube",
        credentialState: "healthy",
        webhookState: "verified",
        cursor: challenge,
        received: true,
      });
    } catch (error) {
      console.error("youtube webhook verification update failed", error);
    }
  });
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  if (!matchesSha1Hmac(secret, raw, request.headers.get("x-hub-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const event = atomEvent(raw);
  const publishedAt = Number.isFinite(Date.parse(event.published))
    ? new Date(event.published).toISOString()
    : new Date().toISOString();
  const owner = configuredOwner(event.channelId);
  const receipt = await recordWebhookReceipt({
    provider: "youtube",
    // Distinct feed updates (including title edits) should refresh source
    // health; canonical content-event dedupe still prevents duplicate alerts.
    externalEventId: createHash("sha256").update(raw).digest("hex"),
    eventType: "feed",
    signatureValid: true,
    payload: { ...event, published: publishedAt },
  });

  if (receipt.shouldProcess && receipt.id && receipt.attempt) {
    const receiptId = receipt.id;
    const receiptAttempt = receipt.attempt;
    after(async () => {
      try {
        await upsertSocialSource({
          provider: "youtube",
          accountRef: event.channelId || "unknown",
          memberSlug: owner?.memberSlug ?? null,
          accountLabel: owner?.label ?? "YouTube",
          credentialState: "healthy",
          webhookState: "verified",
          cursor: event.videoId || null,
          received: true,
        });
        if (event.videoId && owner) {
          // WebSub's Atom entry has no duration or explicit Shorts flag. Ask
          // the first-party videos endpoint once for this new id, while
          // preserving the title hint when quota/configuration is unavailable.
          const metadata = (await fetchYouTubeMetadata(
            [event.videoId],
            { [event.videoId]: event.title },
            { fresh: true },
          ))[event.videoId];
          const short = metadata?.isShort ?? isLikelyYouTubeShort({ title: event.title });
          await recordSocialEvent({
            provider: "youtube",
            memberSlug: owner.memberSlug,
            contentType: short ? "short" : "video",
            canonicalId: `youtube:${event.videoId}`,
            title: event.title || `New video from ${owner.label}`,
            href: short
              ? `https://www.youtube.com/shorts/${event.videoId}`
              : `https://www.youtube.com/watch?v=${event.videoId}`,
            artworkUrl: `https://i.ytimg.com/vi/${event.videoId}/hqdefault.jpg`,
            orientation: short ? "portrait" : "landscape",
            publishedAt,
            platformPayload: {
              channelId: event.channelId,
              videoId: event.videoId,
              durationSeconds: metadata?.durationSeconds,
              liveBroadcastContent: metadata?.liveBroadcastContent,
            },
          });
          await drainSocialNotificationDeliveries(100);
        }
        revalidateTag(SOCIAL_FEED_CACHE_TAG);
        await completeWebhookReceipt(receiptId, receiptAttempt);
      } catch (error) {
        await failWebhookReceipt(receiptId, receiptAttempt, error).catch((receiptError) => {
          console.error("youtube webhook receipt failure update failed", receiptError);
        });
        console.error("youtube webhook processing failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}

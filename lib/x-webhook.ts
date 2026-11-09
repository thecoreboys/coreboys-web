import { createHmac, timingSafeEqual } from "node:crypto";
import type { FeedItem } from "@/components/feed/types";
import { parseXRecentSearchResponse, type XFeedAccount } from "@/lib/x-feed-request";

export type XWebhookSecrets = { clientSecret?: string; consumerSecret?: string };
export const X_WEBHOOK_MAX_BODY_BYTES = 1_000_000;

function signature(secret: string, raw: string | Uint8Array): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("base64")}`;
}

export function xWebhookCrcResponse(token: string | null, secrets: XWebhookSecrets): string | null {
  const secret = secrets.clientSecret?.trim() || secrets.consumerSecret?.trim();
  if (!secret || !token || token.length > 1024) return null;
  return signature(secret, token);
}

/** X signs the original bytes. A bad OAuth2 signature never downgrades to OAuth1. */
export function verifyXWebhookSignature(raw: Uint8Array, headers: Headers, secrets: XWebhookSecrets): boolean {
  const oauth2 = headers.get("x-twitter-webhooks-signature-oauth2");
  const supplied = oauth2 ?? headers.get("x-twitter-webhooks-signature");
  const secret = oauth2 !== null ? secrets.clientSecret?.trim() : secrets.consumerSecret?.trim();
  if (!supplied || !secret) return false;
  const expected = Buffer.from(signature(secret, raw), "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Bound streamed bodies too, including requests without Content-Length. */
export async function readXWebhookBody(request: Request): Promise<Uint8Array | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > X_WEBHOOK_MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > X_WEBHOOK_MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

/** Accept self-serve Activity post.create and legacy filtered-stream deliveries. */
export function parseXStreamWebhook(payload: unknown, accounts: readonly XFeedAccount[]): FeedItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_x_stream_payload");
  const body = payload as Record<string, unknown>;
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new Error("invalid_x_stream_post");
  const data = body.data as Record<string, unknown>;
  let post = data;
  let includes = body.includes;
  if ("event_type" in data) {
    if (data.event_type !== "post.create") throw new Error("unsupported_x_activity_event");
    if (!data.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) throw new Error("invalid_x_activity_post");
    post = data.payload as Record<string, unknown>;
    includes = data.includes;
    // The subscription filter must not disagree with the hydrated author.
    // The normal parser also enforces the canonical account allowlist.
    if (data.filter !== undefined) {
      if (!data.filter || typeof data.filter !== "object" || Array.isArray(data.filter)) throw new Error("invalid_x_activity_filter");
      const userId = (data.filter as Record<string, unknown>).user_id;
      if (typeof userId !== "string" || userId !== post.author_id) throw new Error("x_activity_author_mismatch");
    }
  }
  // Keep the webhook and scheduled-search surfaces identical even if a
  // misconfigured stream rule accidentally also matches replies or reposts.
  const references = post.referenced_tweets;
  if (post.in_reply_to_tweet_id || post.retweeted_tweet_id) return [];
  if (Array.isArray(references) && references.some((entry) => entry && typeof entry === "object"
    && ((entry as Record<string, unknown>).type === "replied_to" || (entry as Record<string, unknown>).type === "retweeted"))) return [];
  return parseXRecentSearchResponse({ data: [post], includes }, accounts);
}

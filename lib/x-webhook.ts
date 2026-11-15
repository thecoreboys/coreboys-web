import { createHmac, timingSafeEqual } from "node:crypto";
import type { FeedItem } from "@/components/feed/types";
import { normalizeXFeedAccounts, normalizeXHandle, parseXRecentSearchResponse, type XFeedAccount } from "@/lib/x-feed-request";

export type XWebhookSecrets = { clientSecret?: string; consumerSecret?: string };
export const X_WEBHOOK_MAX_BODY_BYTES = 1_000_000;

export type XActivityAccountBindings = ReadonlyMap<string, XFeedAccount>;

export type XDeletedPost = { statusId: string; authorId: string; account: XFeedAccount; sourceUrl: string };

/** Only a signed, provisioned account can remove an X object. Tags are not authority. */
export function parseXDeleteWebhook(payload: unknown, bindings: XActivityAccountBindings): XDeletedPost | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const event = data as Record<string, unknown>;
  if (event.event_type !== "post.delete") return null;
  const post = event.payload as Record<string, unknown> | undefined;
  const filter = event.filter as Record<string, unknown> | undefined;
  if (!post || Array.isArray(post) || !filter || Array.isArray(filter)
    || typeof post.id !== "string" || !/^[1-9]\d{4,24}$/.test(post.id)
    || typeof post.author_id !== "string" || filter.user_id !== post.author_id) {
    throw new Error("invalid_x_delete_payload");
  }
  const account = bindings.get(post.author_id);
  if (!account) throw new Error("unbound_x_delete_author");
  return { statusId: post.id, authorId: post.author_id, account,
    sourceUrl: `https://x.com/${normalizeXHandle(account.handle)}/status/${post.id}` };
}

/** Provisioned numeric X IDs are public configuration, never inferred from tags. */
export function parseXActivityAccountBindings(raw: string | undefined, accounts: readonly XFeedAccount[]): XActivityAccountBindings {
  if (raw === undefined || raw === "") return new Map();
  if (raw.length > 20_000) throw new Error("invalid_x_activity_bindings");
  if (!raw.trim()) return new Map();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("invalid_x_activity_bindings"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_x_activity_bindings");
  const entries = Object.entries(value);
  if (entries.length > 256) throw new Error("invalid_x_activity_bindings");
  const byOwner = new Map(normalizeXFeedAccounts(accounts).map((account) => [account.authorSlug ?? "core", account]));
  const seenOwners = new Set<string>();
  const bindings = new Map<string, XFeedAccount>();
  for (const [userId, owner] of entries) {
    if (!/^[1-9]\d{0,24}$/.test(userId) || typeof owner !== "string") throw new Error("invalid_x_activity_bindings");
    const account = byOwner.get(owner);
    if (!account || seenOwners.has(owner)) throw new Error("invalid_x_activity_bindings");
    bindings.set(userId, account);
    seenOwners.add(owner);
  }
  return bindings;
}

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
export function parseXStreamWebhook(
  payload: unknown,
  accounts: readonly XFeedAccount[],
  bindings: XActivityAccountBindings = new Map(),
): FeedItem[] {
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
    let filterUserId: string | undefined;
    if (data.filter !== undefined) {
      if (!data.filter || typeof data.filter !== "object" || Array.isArray(data.filter)) throw new Error("invalid_x_activity_filter");
      const userId = (data.filter as Record<string, unknown>).user_id;
      if (typeof userId !== "string" || userId !== post.author_id) throw new Error("x_activity_author_mismatch");
      filterUserId = userId;
    }
    const boundAccount = typeof post.author_id === "string" ? bindings.get(post.author_id) : undefined;
    if (boundAccount) {
      if (includes !== undefined && (!includes || typeof includes !== "object" || Array.isArray(includes))) throw new Error("invalid_x_activity_includes");
      const expanded = (includes ?? {}) as Record<string, unknown>;
      if (expanded.users !== undefined && !Array.isArray(expanded.users)) throw new Error("invalid_x_activity_users");
      const users = (expanded.users ?? []) as unknown[];
      const authors = users.filter((user) => user && typeof user === "object" && !Array.isArray(user)
        && (user as Record<string, unknown>).id === post.author_id) as Record<string, unknown>[];
      if (authors.length > 1) throw new Error("x_activity_author_mismatch");
      const author = authors[0];
      if (author) {
        if (typeof author.username !== "string" || normalizeXHandle(author.username)?.toLowerCase() !== normalizeXHandle(boundAccount.handle)?.toLowerCase()) throw new Error("x_activity_binding_mismatch");
      } else {
        if (!filterUserId || filterUserId !== post.author_id) throw new Error("x_activity_author_mismatch");
        // X may omit author expansions. Use only the explicitly provisioned
        // ID-to-roster binding, without inventing avatars or verification.
        includes = { ...expanded, users: [...users, {
          id: post.author_id,
          username: normalizeXHandle(boundAccount.handle),
          name: boundAccount.authorLabel.replace(/\s*·.*$/, "").trim(),
        }] };
      }
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

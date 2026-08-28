import "server-only";

import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { configuredYouTubeWebhookChannels } from "@/lib/social-feed";
import { upsertSocialSource } from "@/lib/social-events";
import { fetchUserIdsByLogin, getAppAccessToken } from "@/lib/twitch";

type ProvisionResult = {
  provider: "twitch" | "youtube";
  account: string;
  event?: string;
  state: "enabled" | "pending" | "created" | "skipped" | "error";
  detail?: string;
};

type TwitchSubscription = {
  status?: string;
  type?: string;
  condition?: { broadcaster_user_id?: string };
  transport?: { method?: string; callback?: string };
};

const YOUTUBE_SUBSCRIPTION_CONCURRENCY = 4;
const YOUTUBE_SUBSCRIPTION_ATTEMPTS = 3;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestYouTubeSubscription(body: URLSearchParams): Promise<Response> {
  let response: Response | null = null;
  for (let attempt = 1; attempt <= YOUTUBE_SUBSCRIPTION_ATTEMPTS; attempt += 1) {
    response = await fetch("https://pubsubhubbub.appspot.com/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    if (attempt < YOUTUBE_SUBSCRIPTION_ATTEMPTS) await wait(250 * attempt);
  }
  if (!response) throw new Error("websub_subscription_request_not_attempted");
  return response;
}

function webhookOrigin(): URL | null {
  const raw = process.env.SOCIAL_WEBHOOK_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const loopbackOrPrivate =
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      /^127(?:\.\d{1,3}){3}$/.test(host) ||
      /^10(?:\.\d{1,3}){3}$/.test(host) ||
      /^192\.168(?:\.\d{1,3}){2}$/.test(host) ||
      /^169\.254(?:\.\d{1,3}){2}$/.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host) ||
      /^(?:127(?:-\d{1,3}){3}|localhost)\.sslip\.io$/.test(host);
    if (loopbackOrPrivate) return null;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function twitchHeaders(clientId: string, token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": clientId,
    "Content-Type": "application/json",
  };
}

async function listTwitchSubscriptions(clientId: string, token: string): Promise<TwitchSubscription[]> {
  const subscriptions: TwitchSubscription[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL("https://api.twitch.tv/helix/eventsub/subscriptions");
    if (cursor) url.searchParams.set("after", cursor);
    const response = await fetch(url, {
      headers: twitchHeaders(clientId, token),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`eventsub_list_${response.status}`);
    const payload = await response.json() as {
      data?: TwitchSubscription[];
      pagination?: { cursor?: string };
    };
    subscriptions.push(...(payload.data ?? []));
    cursor = payload.pagination?.cursor ?? "";
    if (!cursor) break;
  }
  return subscriptions;
}

export async function provisionTwitchSubscriptions(): Promise<ProvisionResult[]> {
  const origin = webhookOrigin();
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  const secret = process.env.TWITCH_EVENTSUB_SECRET?.trim();
  if (!origin || !clientId || !clientSecret || !secret || secret.length < 10 || secret.length > 100) {
    return [{
      provider: "twitch",
      account: "roster",
      state: "skipped",
      detail: !origin ? "public_https_origin_missing" : "eventsub_credentials_missing",
    }];
  }

  const callback = new URL("/api/social/webhooks/twitch", origin).toString();
  try {
    const token = await getAppAccessToken();
    const ids = await fetchUserIdsByLogin(MEMBERS.map((member) => member.twitchLogin));
    const existing = await listTwitchSubscriptions(clientId, token);
    const results: ProvisionResult[] = [];

    for (const member of MEMBERS) {
      const login = member.twitchLogin.toLowerCase();
      const broadcasterId = ids[login];
      if (!broadcasterId) {
        results.push({ provider: "twitch", account: login, state: "error", detail: "broadcaster_not_found" });
        continue;
      }
      for (const event of ["stream.online", "stream.offline"] as const) {
        const current = existing.find((subscription) =>
          subscription.type === event
          && subscription.condition?.broadcaster_user_id === broadcasterId
          && subscription.transport?.method === "webhook"
          && subscription.transport.callback === callback
          && (subscription.status === "enabled" || subscription.status === "webhook_callback_verification_pending"));
        if (current) {
          results.push({
            provider: "twitch",
            account: login,
            event,
            state: current.status === "enabled" ? "enabled" : "pending",
          });
          continue;
        }

        const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
          method: "POST",
          headers: twitchHeaders(clientId, token),
          body: JSON.stringify({
            type: event,
            version: "1",
            condition: { broadcaster_user_id: broadcasterId },
            transport: { method: "webhook", callback, secret },
          }),
          cache: "no-store",
        });
        if (response.status === 202) {
          results.push({ provider: "twitch", account: login, event, state: "created" });
        } else {
          const detail = (await response.text()).slice(0, 240);
          results.push({ provider: "twitch", account: login, event, state: "error", detail: `eventsub_create_${response.status}:${detail}` });
        }
      }
      const memberResults = results.filter((entry) => entry.account === login);
      const failed = memberResults.find((entry) => entry.state === "error");
      await upsertSocialSource({
        provider: "twitch",
        accountRef: login,
        memberSlug: member.slug,
        accountLabel: member.stageName,
        credentialState: "healthy",
        webhookState: failed ? "error" : memberResults.every((entry) => entry.state === "enabled") ? "verified" : "pending",
        error: failed?.detail ?? null,
      });
    }
    return results;
  } catch (error) {
    return [{
      provider: "twitch",
      account: "roster",
      state: "error",
      detail: error instanceof Error ? error.message.slice(0, 240) : "eventsub_provision_failed",
    }];
  }
}

export async function provisionYouTubeSubscriptions(): Promise<ProvisionResult[]> {
  const origin = webhookOrigin();
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET?.trim();
  const verifyToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!origin || !secret) {
    return [{
      provider: "youtube",
      account: "roster",
      state: "skipped",
      detail: !origin ? "public_https_origin_missing" : "webhook_secret_missing",
    }];
  }

  const callback = new URL("/api/social/webhooks/youtube", origin).toString();
  const channels = configuredYouTubeWebhookChannels();
  const provisionChannel = async (channel: (typeof channels)[number]): Promise<ProvisionResult> => {
    const body = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.topic": `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channelId)}`,
      "hub.callback": callback,
      "hub.verify": "async",
      "hub.secret": secret,
      "hub.lease_seconds": "864000",
    });
    if (verifyToken) body.set("hub.verify_token", verifyToken);
    try {
      const response = await requestYouTubeSubscription(body);
      const state = response.ok ? "pending" : "error";
      const detail = response.ok ? undefined : `websub_subscribe_${response.status}:${(await response.text()).slice(0, 200)}`;
      await upsertSocialSource({
        provider: "youtube",
        accountRef: channel.channelId,
        memberSlug: channel.memberSlug,
        accountLabel: channel.accountLabel,
        credentialState: "healthy",
        webhookState: response.ok ? "pending" : "error",
        error: detail ?? null,
      });
      return { provider: "youtube", account: channel.channelId, state, detail };
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 240) : "websub_provision_failed";
      await upsertSocialSource({
        provider: "youtube",
        accountRef: channel.channelId,
        memberSlug: channel.memberSlug,
        accountLabel: channel.accountLabel,
        credentialState: "healthy",
        webhookState: "error",
        error: detail,
      });
      return {
        provider: "youtube",
        account: channel.channelId,
        state: "error",
        detail,
      };
    }
  };

  // PubSubHubbub occasionally returns transient 503s when all roster channels
  // are renewed in one burst. Keep a small concurrency window and retry only
  // explicitly transient responses so one channel cannot strand the lease.
  const results: ProvisionResult[] = [];
  for (let index = 0; index < channels.length; index += YOUTUBE_SUBSCRIPTION_CONCURRENCY) {
    results.push(...await Promise.all(
      channels.slice(index, index + YOUTUBE_SUBSCRIPTION_CONCURRENCY).map(provisionChannel),
    ));
  }
  if (!channels.length) {
    results.push({ provider: "youtube", account: GROUP.name, state: "skipped", detail: "no_channel_ids" });
  }
  return results;
}

export async function provisionSocialSubscriptions() {
  const [twitch, youtube] = await Promise.all([
    provisionTwitchSubscriptions(),
    provisionYouTubeSubscriptions(),
  ]);
  return [...twitch, ...youtube];
}

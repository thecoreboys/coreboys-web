import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { accessTokenFor } from "@/lib/oauth/refresh";
import { awardPoints, POINTS } from "@/lib/points";
import { setLoyalty } from "@/lib/oauth/loyalty";
import { memberTargets } from "@/lib/oauth/roster";
import { fetchUsersByLogin } from "@/lib/twitch";
import { providerHasScope } from "@/lib/oauth/providers";

const MIN_GAP_MS = 2000;
const DAILY_POINT_CAP = 20;
const MAX_LEN = 500;

export type ChatSendResult = {
  ok: boolean;
  error?: string;
  channel: string;
  dropReason?: string;
  retryAfterMs?: number;
};

export type ChatSendOptions = {
  /** Queue behind this fan's previous send instead of rejecting it. */
  waitForRateLimit?: boolean;
  /** Native Twitch reply parent. Only valid inside the target channel. */
  replyParentMessageId?: string;
};

export async function sendTwitchChat(
  userId: string,
  channelLogin: string,
  message: string,
  options: ChatSendOptions = {},
): Promise<ChatSendResult> {
  const channel = channelLogin.trim().toLowerCase();
  const text = message.trim();
  if (!text) return { ok: false, channel, error: "Message is empty." };
  if (text.length > MAX_LEN) return { ok: false, channel, error: `Keep it under ${MAX_LEN} characters.` };

  const member = memberTargets().find((candidate) => candidate.twitchLogin === channel);
  if(member){
    const freeze=await query<{frozen:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM passport_channel_controls c WHERE c.channel_slug=$1 AND c.chat_frozen
        AND (c.scope_key='*' OR EXISTS(
          SELECT 1 FROM passport_events e WHERE e.id::text=c.scope_key AND e.channel_slug=$1 AND e.state='live'
        ))
    ) AS frozen`,[member.slug]);
    if(freeze.rows[0]?.frozen)return{ok:false,channel,error:"Chat is temporarily paused by the CORE moderation team.",dropReason:"passport_chat_frozen"};
  }

  await ensureFanOauthSchema();
  const { rows: recent } = await query<{ created_at: Date }>(
    `SELECT created_at FROM fan_chat_sends
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (recent[0]) {
    const age = Date.now() - new Date(recent[0].created_at).getTime();
    if (age < MIN_GAP_MS) {
      const retryAfterMs = MIN_GAP_MS - age + 75;
      if (options.waitForRateLimit) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      } else {
        return {
          ok: false,
          channel,
          error: "Slow down — wait two seconds between messages.",
          retryAfterMs,
        };
      }
    }
  }

  const pair = await accessTokenFor(userId, "twitch");
  if (!pair) return { ok: false, channel, error: "Connect Twitch to send chat." };
  if (!providerHasScope(pair.row.scopes, "user:write:chat")) {
    return {
      ok: false,
      channel,
      error: "Reconnect Twitch to approve the live-chat permission.",
    };
  }
  const senderId = pair.row.provider_user_id;
  if (!senderId) return { ok: false, channel, error: "Twitch identity missing — reconnect." };

  const users = await fetchUsersByLogin([channel]);
  const broadcaster = users[channel];
  if (!broadcaster) return { ok: false, channel, error: `Unknown channel ${channel}.` };

  const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pair.token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: broadcaster.id,
      sender_id: senderId,
      message: text,
      ...(options.replyParentMessageId
        ? { reply_parent_message_id: options.replyParentMessageId }
        : {}),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403) {
      return { ok: false, channel, error: "Twitch blocked that send (banned, followers-only, or missing scope)." };
    }
    if (res.status === 429) return { ok: false, channel, error: "Twitch rate-limited you. Try again in a moment." };
    return { ok: false, channel, error: `Twitch rejected the message (${res.status}).`, dropReason: body.slice(0, 200) };
  }

  const json = (await res.json()) as {
    data?: Array<{ is_sent?: boolean; drop_reason?: { message?: string } }>;
  };
  const sent = json.data?.[0];
  if (sent && sent.is_sent === false) {
    return { ok: false, channel, error: sent.drop_reason?.message ?? "Twitch dropped the message." };
  }

  await query(
    `INSERT INTO fan_chat_sends (user_id, channel_login) VALUES ($1,$2)`,
    [userId, channel],
  );

  if (member) {
    await setLoyalty({ userId, platform: "site", subject: member.slug, kind: "chat", value: true });
  }

  const { rows: today } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM fan_points
      WHERE user_id = $1 AND reason = 'chat_send'
        AND created_at > now() - interval '1 day'`,
    [userId],
  );
  if (Number(today[0]?.n ?? 0) < DAILY_POINT_CAP) {
    await awardPoints(userId, POINTS.chat_send, "chat_send", "chat", `${Date.now()}`, member?.slug ?? null);
  }

  return { ok: true, channel };
}

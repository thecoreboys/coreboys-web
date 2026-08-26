import { query } from "@/lib/db";
import { providerHasScope } from "@/lib/oauth/providers";
import { accessTokenFor } from "@/lib/oauth/refresh";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";

const WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const MIN_GAP_MS = 2_000;
const MAX_MESSAGE_LENGTH = 200;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,32}$/;

export type YoutubeInteractionAction = "comment" | "live_chat";

export type YoutubeInteractionResult = {
  ok: boolean;
  action: YoutubeInteractionAction;
  error?: string;
  needsReconnect?: boolean;
  retryAfterMs?: number;
};

function failed(
  action: YoutubeInteractionAction,
  error: string,
  extra: Pick<YoutubeInteractionResult, "needsReconnect" | "retryAfterMs"> = {},
): YoutubeInteractionResult {
  return { ok: false, action, error, ...extra };
}

async function youtubeError(
  response: Response,
  action: YoutubeInteractionAction,
): Promise<YoutubeInteractionResult> {
  if (response.status === 401) {
    return failed(action, "Your YouTube connection expired. Reconnect YouTube and try again.", {
      needsReconnect: true,
    });
  }
  if (response.status === 429) {
    return failed(action, "YouTube is rate-limiting messages. Try again in a moment.");
  }

  // Google includes stable reason codes in the error response. Map only the
  // handful that help the viewer; never return the upstream body or token.
  let reason = "";
  try {
    const body = (await response.json()) as {
      error?: { errors?: Array<{ reason?: string }> };
    };
    reason = body.error?.errors?.[0]?.reason ?? "";
  } catch {
    // A provider proxy can return HTML or an empty response.
  }
  if (reason === "commentsDisabled") {
    return failed(action, "Comments are disabled for this video.");
  }
  if (reason === "liveChatDisabled" || reason === "liveChatEnded") {
    return failed(action, "This live chat is not accepting messages.");
  }
  if (reason === "quotaExceeded") {
    return failed(action, "The YouTube API quota is temporarily exhausted. Try again later.");
  }
  if (reason === "insufficientPermissions" || response.status === 403) {
    return failed(
      action,
      "YouTube did not allow that action. Reconnect YouTube if permissions changed.",
      { needsReconnect: reason === "insufficientPermissions" },
    );
  }
  if (response.status === 404) {
    return failed(action, "That YouTube video is no longer available.");
  }
  return failed(action, `YouTube rejected the ${action === "live_chat" ? "chat message" : "comment"}.`);
}

async function youtubeGet<T>(path: string, token: string): Promise<{ response: Response; body: T | null }> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return { response, body: null };
  return { response, body: (await response.json()) as T };
}

/**
 * Send one deliberate viewer-authored action through YouTube Data API v3.
 * The message itself is sent directly to Google and is never persisted in CORE.
 */
export async function sendYoutubeInteraction(
  userId: string,
  input: { action: YoutubeInteractionAction; videoId: string; message: string },
): Promise<YoutubeInteractionResult> {
  const action = input.action;
  const videoId = input.videoId.trim();
  const message = input.message.trim();
  if (!VIDEO_ID.test(videoId)) return failed(action, "Invalid YouTube video.");
  if (!message) return failed(action, "Message is empty.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return failed(action, `Keep it under ${MAX_MESSAGE_LENGTH} characters.`);
  }

  await ensureFanOauthSchema();
  const { rows: recent } = await query<{ created_at: Date }>(
    `SELECT created_at FROM fan_social_actions
      WHERE user_id = $1 AND provider = 'youtube'
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (recent[0]) {
    const age = Date.now() - new Date(recent[0].created_at).getTime();
    if (age < MIN_GAP_MS) {
      const retryAfterMs = MIN_GAP_MS - age + 75;
      return failed(action, "Slow down — wait two seconds between YouTube messages.", {
        retryAfterMs,
      });
    }
  }

  const pair = await accessTokenFor(userId, "youtube");
  if (!pair) {
    return failed(action, "Connect YouTube to send this message.", { needsReconnect: true });
  }
  if (!providerHasScope(pair.row.scopes, WRITE_SCOPE)) {
    return failed(action, "Reconnect YouTube to approve comments and live chat.", {
      needsReconnect: true,
    });
  }

  if (action === "comment") {
    const lookup = await youtubeGet<{
      items?: Array<{ snippet?: { channelId?: string } }>;
    }>(`videos?part=snippet&id=${encodeURIComponent(videoId)}`, pair.token);
    if (!lookup.response.ok) return youtubeError(lookup.response, action);
    const channelId = lookup.body?.items?.[0]?.snippet?.channelId;
    if (!channelId) return failed(action, "That YouTube video is no longer available.");

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pair.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            channelId,
            videoId,
            topLevelComment: { snippet: { textOriginal: message } },
          },
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return youtubeError(response, action);
  } else {
    const lookup = await youtubeGet<{
      items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>;
    }>(`videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`, pair.token);
    if (!lookup.response.ok) return youtubeError(lookup.response, action);
    const liveChatId = lookup.body?.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!liveChatId) return failed(action, "This video does not have an active YouTube live chat.");

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pair.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            liveChatId,
            type: "textMessageEvent",
            textMessageDetails: { messageText: message },
          },
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return youtubeError(response, action);
  }

  await query(
    `INSERT INTO fan_social_actions (user_id, provider, action, target_ref)
      VALUES ($1, 'youtube', $2, $3)`,
    [userId, action, videoId],
  );
  return { ok: true, action };
}

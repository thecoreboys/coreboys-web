import { accessTokenFor } from "@/lib/oauth/refresh";
import { providerHasScope } from "@/lib/oauth/providers";

export type TwitchPickerEmote = {
  code: string;
  url: string;
  provider: "twitch";
};

export type TwitchUserEmoteResult = {
  emotes: TwitchPickerEmote[];
  reconnectRequired: boolean;
  unavailable: boolean;
};

type TwitchUserEmote = {
  id?: unknown;
  name?: unknown;
  format?: unknown;
  scale?: unknown;
  theme_mode?: unknown;
};

type TwitchUserEmotePage = {
  data?: TwitchUserEmote[];
  template?: string;
  pagination?: { cursor?: string };
};

const MAX_PAGES = 10;

function preferred(values: unknown, wanted: string, fallback: string): string {
  if (!Array.isArray(values)) return fallback;
  const strings = values.filter((value): value is string => typeof value === "string");
  return strings.includes(wanted) ? wanted : strings[0] ?? fallback;
}

export function twitchUserEmoteUrl(
  template: string | undefined,
  emote: TwitchUserEmote,
): string | null {
  const id = typeof emote.id === "string" ? emote.id.trim() : "";
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const format = preferred(emote.format, "animated", "static");
  const theme = preferred(emote.theme_mode, "dark", "dark");
  const scale = preferred(emote.scale, "2.0", "2.0");
  const source = template?.includes("{{id}}")
    ? template
    : "https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}";
  return source
    .replaceAll("{{id}}", encodeURIComponent(id))
    .replaceAll("{{format}}", encodeURIComponent(format))
    .replaceAll("{{theme_mode}}", encodeURIComponent(theme))
    .replaceAll("{{scale}}", encodeURIComponent(scale));
}

/**
 * Loads the exact native Twitch emotes available to the connected viewer.
 * Tokens never leave the server; the client receives only public image URLs
 * and emote codes that Twitch says this user can send.
 */
export async function fetchUserTwitchEmotes(userId: string): Promise<TwitchUserEmoteResult> {
  const pair = await accessTokenFor(userId, "twitch");
  if (!pair) return { emotes: [], reconnectRequired: true, unavailable: false };
  if (!providerHasScope(pair.row.scopes, "user:read:emotes")) {
    return { emotes: [], reconnectRequired: true, unavailable: false };
  }
  const twitchUserId = pair.row.provider_user_id?.trim();
  if (!twitchUserId) return { emotes: [], reconnectRequired: true, unavailable: false };

  const emotes = new Map<string, TwitchPickerEmote>();
  let after = "";
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL("https://api.twitch.tv/helix/chat/emotes/user");
      url.searchParams.set("user_id", twitchUserId);
      url.searchParams.set("first", "100");
      if (after) url.searchParams.set("after", after);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${pair.token}`,
          "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
        },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        return { emotes: [], reconnectRequired: true, unavailable: false };
      }
      if (!response.ok) return { emotes: [], reconnectRequired: false, unavailable: true };
      const body = (await response.json()) as TwitchUserEmotePage;
      for (const item of body.data ?? []) {
        const code = typeof item.name === "string" ? item.name.trim() : "";
        const imageUrl = twitchUserEmoteUrl(body.template, item);
        if (!code || !imageUrl) continue;
        emotes.set(code, { code, url: imageUrl, provider: "twitch" });
      }
      const cursor = body.pagination?.cursor?.trim() ?? "";
      if (!cursor || cursor === after) break;
      after = cursor;
    }
    return { emotes: [...emotes.values()], reconnectRequired: false, unavailable: false };
  } catch {
    return { emotes: [], reconnectRequired: false, unavailable: true };
  }
}

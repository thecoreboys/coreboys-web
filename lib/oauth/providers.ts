/**
 * OAuth provider registry. Scopes are the minimum needed for loyalty +
 * in-hub chat. We do not request tweet.write or YouTube upload.
 */
export const OAUTH_PROVIDERS = ["twitch", "youtube", "x", "tiktok", "instagram"] as const;
export type OauthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Requested only by the explicit X interaction step-up flow. */
export const X_INTERACTION_SCOPES = [
  "tweet.read",
  "users.read",
  "follows.read",
  "offline.access",
  "like.read",
  "like.write",
  "tweet.write",
  "follows.write",
] as const;

/**
 * Minimum grants for an authorized TikTok account to power a public creator
 * rail. `user.info.profile` is intentionally included: TikTok protects the
 * exact @username behind that scope, and the server uses it to bind a grant to
 * the matching roster account instead of guessing from a display name.
 */
export const TIKTOK_CREATOR_FEED_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "video.list",
] as const;

export function isOauthProvider(v: string): v is OauthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

export type ProviderPublic = {
  key: OauthProvider;
  label: string;
  color: string;
  connectable: boolean;
  why: string;
  scopes: string[];
  /** Actions the signed-in viewer can take inside CORE with these scopes. */
  interaction: "twitch-chat" | "youtube-write" | "read-only";
  interactionLabel: string;
  interactionNote?: string;
  watchHistorySync: {
    supported: boolean;
    label: string;
    detail: string;
  };
};

export const PROVIDER_CATALOG: readonly ProviderPublic[] = [
  {
    key: "twitch",
    label: "Twitch",
    color: "#9146FF",
    connectable: true,
    why: "Sync follows/subscriptions, load your available Twitch emotes, and send chat only when you press Send.",
    scopes: [
      "user:read:email",
      "user:read:follows",
      "user:read:subscriptions",
      "user:read:emotes",
      "user:write:chat",
    ],
    interaction: "twitch-chat",
    interactionLabel: "Twitch live chat",
    watchHistorySync: {
      supported: false,
      label: "Provider watch history unavailable",
      detail: "Twitch does not expose a viewer's stream attendance, leave time, VOD position, or watched duration to connected third-party apps. CORE still saves playback measured on this site.",
    },
  },
  {
    key: "youtube",
    label: "YouTube",
    color: "#FF0033",
    connectable: true,
    why: "Sync CORE subscriptions/likes and send a comment or live-chat message only when you submit it.",
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
    interaction: "youtube-write",
    interactionLabel: "YouTube comments + live chat",
    interactionNote: "Requires Google OAuth verification before general production use.",
    watchHistorySync: {
      supported: false,
      label: "Provider watch history unavailable",
      detail: "YouTube's API returns empty watch-history lists, even for the signed-in owner. CORE still saves YouTube progress and duration measured on this site.",
    },
  },
  {
    key: "x",
    label: "X",
    color: "#d4d4d8",
    connectable: true,
    why: "Sync CORE follows. We do not request permission to post, reply, or like as you.",
    scopes: ["tweet.read", "users.read", "follows.read", "offline.access"],
    interaction: "read-only",
    interactionLabel: "Read-only sync",
    interactionNote: "Writing would require tweet.write and may incur X API usage charges, so it is disabled.",
    watchHistorySync: {
      supported: false,
      label: "No provider viewing history",
      detail: "X does not provide auditable per-post watch duration for this connection. CORE stores playback measured on this site only.",
    },
  },
  {
    key: "tiktok",
    label: "TikTok",
    color: "#FE2C55",
    connectable: true,
    why: "Sync your profile and public videos. TikTok does not provide comment-writing access here.",
    // `video.list` is user-authorized: there is no app-only Display API
    // feed. Existing connections must reauthorize after this scope change.
    scopes: [...TIKTOK_CREATOR_FEED_SCOPES],
    interaction: "read-only",
    interactionLabel: "Read-only media sync",
    interactionNote: "TikTok Display API does not provide comment or live-chat publishing.",
    watchHistorySync: {
      supported: false,
      label: "No provider viewing history",
      detail: "TikTok Display API exposes the connected creator's media, not the viewer's watch history or duration. CORE stores playback measured on this site only.",
    },
  },
  {
    key: "instagram",
    label: "Instagram",
    color: "#E1306C",
    connectable: true,
    why: "Sync media from an eligible professional Instagram account. No commenting or posting as you.",
    scopes: ["instagram_business_basic"],
    interaction: "read-only",
    interactionLabel: "Read-only media sync",
    interactionNote: "Comment management requires Meta review for instagram_business_manage_comments and is not enabled yet.",
    watchHistorySync: {
      supported: false,
      label: "No provider viewing history",
      detail: "Instagram's API does not expose the connected viewer's Reel or video watch history. CORE stores playback measured on this site only.",
    },
  },
];

/** Provider responses and older rows may delimit scopes with spaces or commas. */
export function grantedScopeSet(scopes: string | readonly string[] | null | undefined): Set<string> {
  const values = Array.isArray(scopes) ? scopes : String(scopes ?? "").split(/[\s,]+/);
  return new Set(values.map((scope) => scope.trim()).filter(Boolean));
}

export function providerHasScope(
  scopes: string | readonly string[] | null | undefined,
  required: string,
): boolean {
  return grantedScopeSet(scopes).has(required);
}

export function twitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function xConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

export function tiktokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export function instagramConfigured(): boolean {
  return Boolean(
    (process.env.INSTAGRAM_CLIENT_ID || process.env.FACEBOOK_APP_ID) &&
      (process.env.INSTAGRAM_CLIENT_SECRET || process.env.FACEBOOK_APP_SECRET),
  );
}

export function providerConfigured(p: OauthProvider): boolean {
  if (p === "twitch") return twitchConfigured();
  if (p === "youtube") return youtubeConfigured();
  if (p === "x") return xConfigured();
  if (p === "tiktok") return tiktokConfigured();
  return instagramConfigured();
}

export function callbackPath(provider: OauthProvider): string {
  return `/api/oauth/${provider}/callback`;
}

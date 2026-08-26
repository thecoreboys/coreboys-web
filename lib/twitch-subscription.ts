export const DEFAULT_TWITCH_TIER_ONE_PRICE_LABEL = "US $5.99";
export const TWITCH_TIER_ONE_PRICE_NOTE = "U.S. web reference price; Twitch local pricing may vary.";

export function twitchTierOnePriceLabel(configured: string | null | undefined): string {
  return configured?.trim() || DEFAULT_TWITCH_TIER_ONE_PRICE_LABEL;
}

export type TwitchSubscriptionVerification =
  | {
      status: "subscribed";
      tier: "1000" | "2000" | "3000" | null;
      gift: boolean;
    }
  | { status: "not_subscribed" }
  | { status: "unknown"; reason: string };

const TWITCH_LOGIN = /^[a-z0-9_]{1,25}$/i;

export function normalizeTwitchLogin(value: string | null | undefined): string | null {
  const login = value?.trim().replace(/^@/, "").toLowerCase() ?? "";
  return TWITCH_LOGIN.test(login) ? login : null;
}

export function twitchSubscribeHref(value: string | null | undefined): string | null {
  const login = normalizeTwitchLogin(value);
  return login ? `https://www.twitch.tv/subs/${encodeURIComponent(login)}` : null;
}

/**
 * Interpret Twitch's Check User Subscription response conservatively.
 * Only the documented 404 means "not subscribed"; authorization, rate-limit,
 * and provider failures remain unknown so the UI never hides a CTA based on a
 * guessed false value.
 */
export function parseTwitchSubscriptionResponse(
  status: number,
  payload: unknown,
): TwitchSubscriptionVerification {
  if (status === 404) return { status: "not_subscribed" };
  if (status !== 200 || !payload || typeof payload !== "object") {
    return { status: "unknown", reason: `helix_${status}` };
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || !data.length || !data[0] || typeof data[0] !== "object") {
    return { status: "unknown", reason: "helix_empty" };
  }

  const entry = data[0] as { tier?: unknown; is_gift?: unknown };
  const tier = entry.tier === "1000" || entry.tier === "2000" || entry.tier === "3000"
    ? entry.tier
    : null;
  return {
    status: "subscribed",
    tier,
    gift: entry.is_gift === true,
  };
}

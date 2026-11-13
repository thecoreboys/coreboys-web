/**
 * Query parameters the OAuth callback hands back to Account settings. Values
 * are short codes only: provider error descriptions and tokens never reach
 * the redirect URL.
 */
export type OauthCallbackReason =
  | "unknown-provider"
  | "missing-code"
  | "expired-state"
  | "bad-state"
  | "session"
  | "provider"
  | "exchange"
  | "no-channel"
  | "missing-scopes"
  | "no-identity";

/** `error=` values providers send when the fan cancels or declines consent. */
const DENIED_ERRORS = new Set(["access_denied", "user_denied", "user_cancelled", "user_canceled"]);

/**
 * Map a provider's `error=` callback parameter. Declining consent is a
 * cancellation; anything else (redirect_uri mismatch, invalid_scope, a
 * provider outage) is a configuration or provider failure, not "you
 * cancelled".
 */
export function providerCallbackError(error: string): { oauth: "denied" } | { oauth: "error"; reason: OauthCallbackReason } {
  return DENIED_ERRORS.has(error.trim().toLowerCase())
    ? { oauth: "denied" }
    : { oauth: "error", reason: "provider" };
}

export type SocialSourceCredentialState = "healthy" | "missing" | "unknown" | "expired";

/** Translate a token-backed provider read into the source registry state. */
export function credentialStateForOfficialFeed(state: string): SocialSourceCredentialState {
  if (state === "ok" || state === "empty") return "healthy";
  if (state === "unauthorized" || state === "forbidden") return "expired";
  if (state === "not_configured" || state === "invalid_account_ref") return "missing";
  return "unknown";
}

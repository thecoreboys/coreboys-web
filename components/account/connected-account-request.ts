import { ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";

type ErrorPayload = {
  error?: unknown;
  message?: unknown;
};

function payloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as ErrorPayload;
  for (const value of [candidate.message, candidate.error]) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/[_-]+/g, " ");
    if (normalized) return normalized.slice(0, 180);
  }
  return null;
}

/**
 * Parse an account API response without allowing an error page, an expired
 * session, or malformed JSON to masquerade as a successful empty payload.
 */
export async function readConnectedAccountResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Sign in again, then retry.");
    }
    const detail = payloadMessage(payload);
    throw new Error(detail ? `${fallbackMessage} ${detail}.` : fallbackMessage);
  }
  if (!payload || typeof payload !== "object") throw new Error(fallbackMessage);
  return payload as T;
}

export function connectedAccountError(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallbackMessage;
}

export type OauthFlashNotice = {
  message: string;
  tone: "success" | "error";
};

const OAUTH_ERROR_REASONS: Record<string, (label: string) => string> = {
  "expired-state": (label) => `The ${label} sign-in took too long or was started in another tab. Try connecting again.`,
  "bad-state": (label) => `The ${label} sign-in could not be verified. Try connecting again from this page.`,
  session: (label) => `Your CORE session changed during the ${label} sign-in. Sign in again, then reconnect.`,
  provider: (label) => `${label} returned an error before finishing the connection. Try again later.`,
  "missing-code": (label) => `${label} did not return a sign-in code. Try connecting again.`,
  "no-channel": (label) => `This Google account has no ${label} channel. Create one on ${label}, then connect again.`,
  "missing-scopes": (label) => `${label} did not grant every permission CORE needs. Connect again and leave all permissions checked.`,
  "no-identity": (label) => `${label} did not return your account details. Try connecting again.`,
};

/**
 * Message for the `?oauth=` result the OAuth start/callback routes redirect
 * back with. `labelFor` turns a provider key into its display name.
 */
export function oauthFlashNotice(
  params: Pick<URLSearchParams, "get">,
  labelFor: (provider: string) => string | undefined = () => undefined,
): OauthFlashNotice | null {
  const oauth = params.get("oauth");
  if (!oauth) return null;
  const key = params.get("provider") ?? "";
  const provider = labelFor(key) ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "account");
  const error = (message: string): OauthFlashNotice => ({ message, tone: "error" });
  if (oauth === "ok") return { message: `Connected ${provider} and completed the first sync.`, tone: "success" };
  if (oauth === "account-changed") return error(ACCOUNT_CHANGED_MESSAGE);
  if (oauth === "sync-error")
    return error(`Connected ${provider}, but its first sync failed. Use Sync now or reconnect if the error persists.`);
  if (oauth === "denied") return error(`You cancelled the ${provider} connect. Nothing was changed.`);
  if (oauth === "linked")
    return error(`That ${provider} account is already linked to another CORE profile. Sign in there, or disconnect it first.`);
  if (oauth === "unconfigured") return error(`${provider} isn’t available on this site right now (missing app credentials).`);
  if (oauth === "x-actions-disabled") return error("X posting actions are not enabled on this site.");
  if (oauth === "error") {
    const reason = OAUTH_ERROR_REASONS[params.get("reason") ?? ""];
    return error(reason ? reason(provider) : `Couldn’t finish the ${provider} connect. Try again.`);
  }
  return null;
}

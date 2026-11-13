import { ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";

export type AccountApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; fields: Record<string, string>; retryAfterSeconds?: number };

/**
 * JSON request to an /api/account route scoped to the rendered account. Error
 * results carry a user-facing message; malformed or HTML responses never read
 * as success.
 */
export async function accountRequest<T>(
  url: string,
  accountId: string,
  init: { method?: string; body?: unknown } = {},
  fallbackError = "Something went wrong. Try again.",
): Promise<AccountApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "x-core-account-id": accountId,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: "You appear to be offline. Check your connection and try again.", fields: {} };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && payload && typeof payload === "object") return { ok: true, status: response.status, data: payload as T };
  const retryHeader = Number(response.headers.get("Retry-After"));
  const fields = payload && typeof payload.fields === "object" && payload.fields ? (payload.fields as Record<string, string>) : {};
  let error = fallbackError;
  if (response.status === 401) error = "Your session expired. Sign in again, then retry.";
  else if (payload?.error === "account_changed") error = ACCOUNT_CHANGED_MESSAGE;
  else if (typeof payload?.error === "string" && /\s/.test(payload.error)) error = payload.error;
  return {
    ok: false,
    status: response.status,
    error,
    fields,
    retryAfterSeconds: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined,
  };
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

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

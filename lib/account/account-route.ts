import "server-only";
import { NextResponse } from "next/server";
import { ACCOUNT_CHANGED_MESSAGE, accountRequestMatches } from "@/lib/account-request";
import { getCurrentFanUserId } from "@/lib/fan-auth";

export function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

/** Resolve the signed-in fan for an account route, or the response to return instead. */
export async function requireAccountSession(
  request: Request,
): Promise<{ userId: string; response?: never } | { userId?: never; response: NextResponse }> {
  let userId: string | null;
  try {
    userId = await getCurrentFanUserId();
  } catch {
    return { response: privateJson({ error: "Your account is temporarily unavailable. Try again in a moment." }, { status: 503 }) };
  }
  if (!userId) return { response: privateJson({ error: "Sign in to continue." }, { status: 401 }) };
  if (!accountRequestMatches(request, userId)) {
    return { response: privateJson({ error: "account_changed", message: ACCOUNT_CHANGED_MESSAGE }, { status: 409 }) };
  }
  return { userId };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

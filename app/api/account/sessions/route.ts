import { z } from "zod";
import { privateJson, readJsonBody, requireAccountSession } from "@/lib/account/account-route";
import { limitAccountAction } from "@/lib/account/account-rate-limit";
import { revokeFanAccountSessions } from "@/lib/account/fan-account";
import { buildFanSessionCookie, signFanSessionToken } from "@/lib/fan-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RevokeBody = z.object({ scope: z.literal("others") }).strict();

/** Sign out every other device; this device receives a fresh session cookie. */
export async function POST(request: Request) {
  const session = await requireAccountSession(request);
  if (session.response) return session.response;

  if (!RevokeBody.safeParse(await readJsonBody(request)).success) {
    return privateJson({ error: "Invalid request." }, { status: 400 });
  }

  const limited = await limitAccountAction(request, "sessions", session.userId);
  if (limited) return limited;

  try {
    const version = await revokeFanAccountSessions(session.userId);
    if (version === null) return privateJson({ error: "Sign in to continue." }, { status: 401 });
    const response = privateJson({ ok: true });
    response.headers.set("Set-Cookie", buildFanSessionCookie(await signFanSessionToken(session.userId, version)));
    return response;
  } catch (error) {
    console.error("account session revocation failed", error);
    return privateJson({ error: "Other devices couldn’t be signed out. Try again." }, { status: 500 });
  }
}

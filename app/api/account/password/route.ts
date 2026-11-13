import { privateJson, readJsonBody, requireAccountSession } from "@/lib/account/account-route";
import { limitAccountAction } from "@/lib/account/account-rate-limit";
import { changePasswordSchema, fieldErrors } from "@/lib/account/account-schemas";
import { AccountPasswordError, changeFanAccountPassword } from "@/lib/account/fan-account";
import { buildFanSessionCookie, signFanSessionToken } from "@/lib/fan-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAccountSession(request);
  if (session.response) return session.response;

  const parsed = changePasswordSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return privateJson({ error: Object.values(fields)[0] ?? "Check your password details.", fields }, { status: 400 });
  }

  // Count every attempt, including wrong current passwords, before bcrypt work.
  const limited = await limitAccountAction(request, "password", session.userId);
  if (limited) return limited;

  try {
    const version = await changeFanAccountPassword(session.userId, parsed.data.currentPassword, parsed.data.newPassword);
    const response = privateJson({ ok: true });
    // Keep this device signed in on the new session version; other devices are revoked.
    response.headers.set("Set-Cookie", buildFanSessionCookie(await signFanSessionToken(session.userId, version)));
    return response;
  } catch (error) {
    if (error instanceof AccountPasswordError) {
      return privateJson(
        { error: error.message, fields: error.field ? { [error.field]: error.message } : undefined },
        { status: error.status },
      );
    }
    console.error("account password change failed", error);
    return privateJson({ error: "Your password couldn’t be changed. Try again." }, { status: 500 });
  }
}

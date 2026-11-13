import { privateJson, readJsonBody, requireAccountSession } from "@/lib/account/account-route";
import { limitAccountAction } from "@/lib/account/account-rate-limit";
import { fieldErrors, profileUpdateSchema } from "@/lib/account/account-schemas";
import { AccountProfileError, getFanAccountProfile, updateFanAccountProfile } from "@/lib/account/fan-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAccountSession(request);
  if (session.response) return session.response;
  const profile = await getFanAccountProfile(session.userId);
  if (!profile) return privateJson({ error: "Sign in to continue." }, { status: 401 });
  return privateJson({ profile });
}

export async function PATCH(request: Request) {
  const session = await requireAccountSession(request);
  if (session.response) return session.response;

  const parsed = profileUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return privateJson({ error: Object.values(fields)[0] ?? "Check your profile details.", fields }, { status: 400 });
  }

  const limited = await limitAccountAction(request, "profile", session.userId);
  if (limited) return limited;

  try {
    const profile = await updateFanAccountProfile(session.userId, parsed.data);
    return privateJson({ ok: true, profile });
  } catch (error) {
    if (error instanceof AccountProfileError) {
      return privateJson(
        { error: error.message, fields: error.field ? { [error.field]: error.message } : undefined },
        { status: error.status },
      );
    }
    console.error("account profile update failed", error);
    return privateJson({ error: "Your profile couldn’t be saved. Try again." }, { status: 500 });
  }
}

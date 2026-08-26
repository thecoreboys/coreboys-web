import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { PassportError } from "@/lib/passport/policy";
import { PassportActionSchema } from "@/lib/passport/schemas";
import { performPassportAction } from "@/lib/passport/store";

export async function handlePassportAction(req: Request): Promise<NextResponse> {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PassportActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const result = await performPassportAction(userId, parsed.data);
    const response = NextResponse.json({ ok: true, result });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof PassportError) {
      return NextResponse.json({ error: error.code, details: error.message }, { status: error.status });
    }
    console.error("Passport action failed", error);
    return NextResponse.json({ error: "passport_unavailable" }, { status: 500 });
  }
}

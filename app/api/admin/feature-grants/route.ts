import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  FeatureGrantError,
  grantFeatureAccess,
  listFeatureGrants,
  revokeFeatureAccess,
} from "@/lib/subscriptions/feature-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    email: z.string().trim().email().max(320),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("revoke"),
    userId: z.string().trim().min(1).max(200),
  }),
]);

function isUndefinedTable(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ grants: await listFeatureGrants() }, { headers: noStore });
  } catch (error) {
    if (isUndefinedTable(error)) {
      return NextResponse.json({ grants: [], migrationRequired: true }, { headers: noStore });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400, headers: noStore });
  }
  try {
    if (parsed.data.action === "grant") {
      await grantFeatureAccess({
        email: parsed.data.email,
        expiresAt: parsed.data.expiresAt,
        note: parsed.data.note,
        staffId: auth.id,
      });
    } else {
      await revokeFeatureAccess({ userId: parsed.data.userId, staffId: auth.id });
    }
    return NextResponse.json({ grants: await listFeatureGrants() }, { headers: noStore });
  } catch (error) {
    if (error instanceof FeatureGrantError) {
      const message = error.code === "account_not_found"
        ? "No fan account uses that email. Ask them to sign up first."
        : "Choose an expiry date in the future, or leave it blank for no expiry.";
      return NextResponse.json({ error: message }, { status: error.code === "account_not_found" ? 404 : 400, headers: noStore });
    }
    throw error;
  }
}

import { NextResponse } from "next/server";
import { cancelAccountDeletion, getAccountDeletionRequest, requestAccountDeletion } from "@/lib/account-deletion";
import { getCurrentFanUserId } from "@/lib/fan-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ request: await getAccountDeletionRequest(userId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  try {
    if (body.action === "cancel") {
      await cancelAccountDeletion(userId);
      return NextResponse.json({ request: null, cancelled: true });
    }
    return NextResponse.json({ request: await requestAccountDeletion(userId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account deletion could not be scheduled." }, { status: 409 });
  }
}

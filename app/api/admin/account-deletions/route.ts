import { NextResponse } from "next/server";
import { listAccountDeletionRequests, scheduleAccountDeletionByAdmin } from "@/lib/account-deletion";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ requests: await listAccountDeletionRequests() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  try {
    const id = await scheduleAccountDeletionByAdmin(body.userId);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deletion could not be scheduled." }, { status: 409 });
  }
}

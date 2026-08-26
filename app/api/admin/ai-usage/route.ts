import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { getAiUsageDashboard, updateAiProviderControl } from "@/lib/ai-usage";

const Body = z.object({
  provider: z.enum(["anthropic", "elevenlabs"]),
  enabled: z.boolean(),
  dailyRequestLimit: z.number().int().min(0).max(100_000),
  subjectHourlyLimit: z.number().int().min(0).max(10_000),
  monthlyBudgetCents: z.number().int().min(0).max(10_000_000),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ providers: await getAiUsageDashboard() });
  } catch {
    return NextResponse.json({ error: "AI controls are unavailable. Apply migration 034 first." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider limits." }, { status: 400 });
  try {
    await updateAiProviderControl({ ...parsed.data, actorId: auth.id });
    return NextResponse.json({ providers: await getAiUsageDashboard() });
  } catch {
    return NextResponse.json({ error: "Unable to save AI controls. Apply migration 034 first." }, { status: 503 });
  }
}

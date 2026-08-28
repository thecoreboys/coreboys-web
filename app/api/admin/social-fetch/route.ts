import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  getSocialFetchBudgetStatus,
  updateSocialFetchBudgetSettings,
  type SocialFetchBudgetStatus,
} from "@/lib/social-fetch-budget";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateBody = z.object({
  enabled: z.boolean(),
  monthlyCreditCap: z.number().int().min(0).max(1_000_000),
}).strict();

type PrivateBudgetStatus = SocialFetchBudgetStatus & {
  currentPeriodUtc: string;
  cutoffReason: "paused" | "monthly_cap_reached" | null;
};

function currentUtcPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function adminBudgetStatus(status: SocialFetchBudgetStatus): PrivateBudgetStatus {
  return {
    ...status,
    currentPeriodUtc: currentUtcPeriod(),
    cutoffReason: !status.enabled
      ? "paused"
      : status.creditsRemaining <= 0
        ? "monthly_cap_reached"
        : null,
  };
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return privateJson({ budget: adminBudgetStatus(await getSocialFetchBudgetStatus()) });
  } catch {
    return privateJson({ error: "Social Fetch budget controls are unavailable. Apply migration 043 first." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestHasSameOrigin(request)) {
    return privateJson({ error: "invalid origin" }, 403);
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: "Enter a whole-number monthly credit cap from 0 to 1,000,000." }, 400);
  }

  try {
    const budget = await updateSocialFetchBudgetSettings({
      ...parsed.data,
      actorId: auth.id,
    });
    return privateJson({ budget: adminBudgetStatus(budget) });
  } catch {
    return privateJson({ error: "Unable to save Social Fetch budget controls." }, 503);
  }
}

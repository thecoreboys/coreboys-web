import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { listXPostNominationsForAdmin, moderateXPostNomination } from "@/lib/x/nominations";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "denied"]),
  featured: z.boolean().default(false),
  denialReason: z.string().trim().max(240).optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const raw = new URL(request.url).searchParams.get("status");
  const status = raw === "all" || raw === "approved" || raw === "denied" ? raw : "pending";
  return privateJson({ nominations: await listXPostNominationsForAdmin(status) });
}

export async function PATCH(request: Request) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid moderation decision" }, 400);
  const nomination = await moderateXPostNomination({
    ...parsed.data,
    actorEmail: auth.email,
  });
  return nomination ? privateJson({ nomination }) : privateJson({ error: "not found" }, 404);
}

function privateJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

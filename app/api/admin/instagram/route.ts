import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  getAllInstagramSources,
  setInstagramSourceEnabled,
} from "@/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin API for the Instagram source toggle.
 *
 *   GET   — list every source (enabled + disabled).
 *   POST  — toggle/set `enabled` for one source by id or handle.
 *   PATCH — alias for POST.
 *
 * Guarded by the shared admin session via requireAdmin(), exactly like
 * the other /api/admin/* routes.
 */

const ToggleBody = z
  .object({
    id: z.number().int().positive().optional(),
    handle: z.string().min(1).max(120).optional(),
    enabled: z.boolean(),
  })
  .refine((b) => b.id !== undefined || b.handle !== undefined, {
    message: "id or handle is required",
  });

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const sources = await getAllInstagramSources();
  return NextResponse.json({ sources });
}

async function toggle(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof ToggleBody>;
  try {
    body = ToggleBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const updated = await setInstagramSourceEnabled(
    { id: body.id, handle: body.handle },
    body.enabled,
  );
  if (!updated) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  return NextResponse.json({ source: updated });
}

export const POST = toggle;
export const PATCH = toggle;

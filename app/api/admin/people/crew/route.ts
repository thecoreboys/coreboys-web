import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    slug: string; display_name: string | null; role: string | null;
    works_with_slugs: string[] | null; hidden: boolean;
    socials: unknown; updated_at: string;
  }>(
    `SELECT slug, display_name, role, works_with_slugs,
            hidden, socials, updated_at::text
     FROM editable_crew_overrides ORDER BY slug`,
  );
  return NextResponse.json({ overrides: r.rows });
}

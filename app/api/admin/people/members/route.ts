import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Member overrides — backs the admin Members editor. The editable
 *  layer is `editable_member_overrides` (slug PK). Static fields like
 *  the canonical name still come from @coreboys/shared at render time;
 *  the override layer wins where present. */

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    slug: string; stage_name: string | null; real_name: string | null;
    bio: string | null; birth_date: string | null;
    twitch_login: string | null; comm_name: string | null;
    accent_color: string | null;
    po_recipient: string | null; po_lines: string[] | null;
    po_city: string | null; po_region: string | null;
    po_postal_code: string | null; po_country: string | null;
    youtube_channel_id: string | null; hidden: boolean;
    updated_at: string;
  }>(
    `SELECT slug, stage_name, real_name, bio, birth_date::text,
            twitch_login, comm_name, accent_color,
            po_recipient, po_lines, po_city, po_region, po_postal_code, po_country,
            youtube_channel_id, hidden, updated_at::text
     FROM editable_member_overrides ORDER BY slug`,
  );
  return NextResponse.json({ overrides: r.rows });
}

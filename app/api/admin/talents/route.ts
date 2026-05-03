import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** External people / talents — backs the admin Talents tool. Stored in
 *  `external_people` (richer than `collab_people`, has avatar + bio). */

const Social = z.object({
  platform: z.string().min(1).max(40),
  url: z.string().url(),
  handle: z.string().optional(),
  label: z.string().optional(),
});
const CreateBody = z.object({
  name: z.string().min(1).max(120),
  twitchLogin: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().optional(),
  socials: z.array(Social).default([]),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    id: string; name: string; avatar_url: string | null; bio: string | null;
    socials: unknown; created_at: string; updated_at: string;
  }>(
    `SELECT id::text, name, avatar_url, bio, socials,
            created_at::text, updated_at::text
     FROM external_people
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`,
  );
  return NextResponse.json({ talents: r.rows });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  const r = await query<{ id: string }>(
    `INSERT INTO external_people (name, avatar_url, bio, socials)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id::text`,
    [body.name, body.avatarUrl ?? null, body.bio ?? null, JSON.stringify(body.socials)],
  );
  return NextResponse.json({ id: r.rows[0]!.id }, { status: 201 });
}

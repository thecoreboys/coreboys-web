import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Social = z.object({
  platform: z.string().min(1).max(40),
  url: z.string().url(),
  handle: z.string().optional(),
  label: z.string().optional(),
});
const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().nullable().optional(),
  socials: z.array(Social).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  const sets: string[] = [];
  const params2: unknown[] = [id];
  if (body.name !== undefined) {
    params2.push(body.name);
    sets.push(`name = $${params2.length}`);
  }
  if (body.avatarUrl !== undefined) {
    params2.push(body.avatarUrl);
    sets.push(`avatar_url = $${params2.length}`);
  }
  if (body.bio !== undefined) {
    params2.push(body.bio);
    sets.push(`bio = $${params2.length}`);
  }
  if (body.socials !== undefined) {
    params2.push(JSON.stringify(body.socials));
    sets.push(`socials = $${params2.length}::jsonb`);
  }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  await query(
    `UPDATE external_people SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    params2,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await query(
    "UPDATE external_people SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
    [id],
  );
  return NextResponse.json({ ok: true });
}

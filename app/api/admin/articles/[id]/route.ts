import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).max(240).optional(),
  dek: z.string().nullable().optional(),
  category: z.string().min(1).max(60).optional(),
  bodyHtml: z.string().optional(),
  bodyJson: z.unknown().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await query<{
    id: string; slug: string; title: string; dek: string | null;
    category: string | null; body_html: string; body_json: unknown;
    cover_image_url: string | null; status: string;
    published_at: string | null; updated_at: string;
  }>(
    `SELECT id::text, slug, title, dek, category, body_html, body_json,
            NULL AS cover_image_url,
            status, published_at::text, updated_at::text
     FROM articles WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(r.rows[0]);
}

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
  const p: unknown[] = [id];
  const push = (frag: string, value: unknown) => {
    p.push(value);
    sets.push(`${frag} = $${p.length}`);
  };
  if (body.slug !== undefined) push("slug", body.slug);
  if (body.title !== undefined) push("title", body.title);
  if (body.dek !== undefined) push("dek", body.dek);
  if (body.category !== undefined) push("category", body.category);
  if (body.bodyHtml !== undefined) push("body_html", body.bodyHtml);
  if (body.bodyJson !== undefined) {
    p.push(JSON.stringify(body.bodyJson));
    sets.push(`body_json = $${p.length}::jsonb`);
  }
  if (body.status !== undefined) {
    push("status", body.status);
    if (body.status === "published") {
      sets.push("published_at = COALESCE(published_at, NOW())");
    }
  }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  await query(
    `UPDATE articles SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    p,
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
  await query("DELETE FROM articles WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

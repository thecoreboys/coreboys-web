import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Articles CRUD — backs the admin Articles list + editor. Schema lives
 *  in the api repo (articles table); we read/write via shared
 *  Postgres. body_json holds the Tiptap doc; body_html the rendered
 *  output for SSR. */

const PostBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  title: z.string().min(1).max(240),
  dek: z.string().optional(),
  category: z.string().min(1).max(60),
  bodyHtml: z.string().default(""),
  bodyJson: z.unknown().optional(),
  coverImageUrl: z.string().url().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    id: string; slug: string; title: string; dek: string | null;
    category: string | null; status: string;
    published_at: string | null; updated_at: string;
  }>(
    `SELECT id::text, slug, title, dek, category, status,
            published_at::text, updated_at::text
     FROM articles
     ORDER BY COALESCE(published_at, updated_at) DESC`,
  );
  return NextResponse.json({ articles: r.rows });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const publishedAt = body.status === "published" ? new Date() : null;
  const r = await query<{ id: string }>(
    `INSERT INTO articles
       (slug, title, dek, category, body_html, body_json, status, published_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING id::text`,
    [
      body.slug,
      body.title,
      body.dek ?? "",
      body.category,
      body.bodyHtml,
      body.bodyJson ? JSON.stringify(body.bodyJson) : "{}",
      body.status,
      publishedAt,
    ],
  );
  return NextResponse.json({ id: r.rows[0]!.id }, { status: 201 });
}

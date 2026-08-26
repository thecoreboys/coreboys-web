import "server-only";
import { query } from "@/lib/db";

export type PublicArticle = {
  slug: string;
  title: string;
  dek: string;
  category: string;
  bodyHtml: string;
  publishedAt: string;
};

export async function getPublishedArticles(): Promise<PublicArticle[]> {
  try {
    const r = await query<{
      slug: string;
      title: string;
      dek: string | null;
      category: string | null;
      body_html: string;
      published_at: string | null;
    }>(
      `SELECT slug, title, dek, category, body_html, published_at::text
       FROM articles
       WHERE status = 'published'
       ORDER BY published_at DESC NULLS LAST`,
    );
    return r.rows.map(toPublic);
  } catch {
    return [];
  }
}

export async function getPublishedArticle(slug: string): Promise<PublicArticle | null> {
  try {
    const r = await query<{
      slug: string;
      title: string;
      dek: string | null;
      category: string | null;
      body_html: string;
      published_at: string | null;
    }>(
      `SELECT slug, title, dek, category, body_html, published_at::text
       FROM articles
       WHERE status = 'published' AND slug = $1
       LIMIT 1`,
      [slug],
    );
    const row = r.rows[0];
    return row ? toPublic(row) : null;
  } catch {
    return null;
  }
}

function toPublic(row: {
  slug: string;
  title: string;
  dek: string | null;
  category: string | null;
  body_html: string;
  published_at: string | null;
}): PublicArticle {
  return {
    slug: row.slug,
    title: row.title,
    dek: row.dek ?? "",
    category: row.category ?? "House",
    bodyHtml: row.body_html,
    publishedAt: row.published_at ?? new Date().toISOString(),
  };
}

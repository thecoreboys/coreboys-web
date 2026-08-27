import "server-only";
import { query } from "@/lib/db";

export type CoreOriginal = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  posterUrl: string;
  enabled: boolean;
  sortOrder: number;
};

export type CoreOriginalItem = {
  id: string;
  originalId: string;
  sourceUrl: string;
  platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "other";
  title: string;
  subtitle: string | null;
  posterUrl: string | null;
  format: "auto" | "long" | "short" | "photo";
  status: "pending" | "approved" | "rejected";
  recommendationNote: string | null;
  sortOrder: number;
};

export type CoreOriginalSnapshot = { originals: CoreOriginal[]; items: CoreOriginalItem[] };

const SEEDS = [
  ["core-rug", "CORE Rug", "/brand/events-series-challenges/core-rug.png"],
  ["basketball-segments", "Basketball Segments", "/brand/events-series-challenges/basketball-segments.png"],
  ["hot-ones", "Hot Ones", "/brand/events-series-challenges/hot-ones.png"],
  ["caretakers", "Caretakers", "/brand/events-series-challenges/caretakers.png"],
  ["stable-99-kill-lead", "StableRonaldo: 99 Kill Lead", "/brand/events-series-challenges/stable-99-kill-lead.png"],
  ["jason-the-ween", "JasonTheWeen: Island Survivor", "/brand/events-series-challenges/jason-the-ween.png"],
  ["core-environment", "CORE Environment", "/brand/events-series-challenges/core-environment.png"],
  ["core-po-box-openings", "CORE PO Box Openings", "/brand/events-series-challenges/core-po-box-openings.webp"],
] as const;

let schema: Promise<void> | null = null;

export function ensureCoreOriginalsSchema() {
  if (schema) return schema;
  schema = query(`
    CREATE TABLE IF NOT EXISTS core_originals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, summary TEXT, poster_url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 100,
      created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS core_original_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), original_id UUID NOT NULL REFERENCES core_originals(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL, platform TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, poster_url TEXT,
      format TEXT NOT NULL DEFAULT 'auto', status TEXT NOT NULL DEFAULT 'pending', recommendation_note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100, submitted_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS core_original_items_collection_status_idx ON core_original_items (original_id, status, sort_order, created_at DESC);
  `).then(async () => {
    for (const [slug, title, posterUrl] of SEEDS) {
      await query(`INSERT INTO core_originals (slug,title,poster_url,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING`, [slug, title, posterUrl, SEEDS.findIndex((seed) => seed[0] === slug)]);
    }
  }).catch((error) => { schema = null; throw error; });
  return schema;
}

function mapOriginal(row: Record<string, unknown>): CoreOriginal {
  return { id: String(row.id), slug: String(row.slug), title: String(row.title), summary: row.summary ? String(row.summary) : null, posterUrl: String(row.poster_url), enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order) };
}
function mapItem(row: Record<string, unknown>): CoreOriginalItem {
  return { id: String(row.id), originalId: String(row.original_id), sourceUrl: String(row.source_url), platform: String(row.platform) as CoreOriginalItem["platform"], title: String(row.title), subtitle: row.subtitle ? String(row.subtitle) : null, posterUrl: row.poster_url ? String(row.poster_url) : null, format: String(row.format) as CoreOriginalItem["format"], status: String(row.status) as CoreOriginalItem["status"], recommendationNote: row.recommendation_note ? String(row.recommendation_note) : null, sortOrder: Number(row.sort_order) };
}

export async function getCoreOriginalSnapshot(includeUnpublished = false): Promise<CoreOriginalSnapshot> {
  await ensureCoreOriginalsSchema();
  const [originals, items] = await Promise.all([
    query(`SELECT id::text,slug,title,summary,poster_url,enabled,sort_order FROM core_originals ${includeUnpublished ? "" : "WHERE enabled"} ORDER BY sort_order,created_at`),
    query(`SELECT id::text,original_id::text,source_url,platform,title,subtitle,poster_url,format,status,recommendation_note,sort_order FROM core_original_items ${includeUnpublished ? "" : "WHERE status='approved'"} ORDER BY sort_order,created_at DESC`),
  ]);
  return { originals: originals.rows.map(mapOriginal), items: items.rows.map(mapItem) };
}

export async function getCoreOriginal(slug: string) {
  try {
    const snapshot = await getCoreOriginalSnapshot();
    const original = snapshot.originals.find((entry) => entry.slug === slug) ?? null;
    return original ? { original, items: snapshot.items.filter((item) => item.originalId === original.id) } : null;
  } catch {
    const seedIndex = SEEDS.findIndex(([seedSlug]) => seedSlug === slug);
    const seed = SEEDS[seedIndex];
    if (!seed) return null;
    const [seedSlug, title, posterUrl] = seed;
    return {
      original: {
        id: `seed:${seedSlug}`,
        slug: seedSlug,
        title,
        summary: null,
        posterUrl,
        enabled: true,
        sortOrder: seedIndex,
      },
      items: [],
    };
  }
}

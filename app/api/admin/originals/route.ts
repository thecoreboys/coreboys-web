import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { getCoreOriginalSnapshot, ensureCoreOriginalsSchema } from "@/lib/core-originals";
import { query } from "@/lib/db";
import { getWatchCatalog } from "@/lib/watch/catalog";

export const runtime = "nodejs";
const platform = z.enum(["youtube", "tiktok", "instagram", "twitch", "x", "other"]);
const original = z.object({ slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().trim().min(1).max(120), summary: z.string().trim().max(500).nullable().optional(), posterUrl: z.string().min(1).max(1000), enabled: z.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(10_000).default(100) });
const item = z.object({ originalId: z.string().uuid(), sourceUrl: z.string().url(), platform, title: z.string().trim().min(1).max(240), subtitle: z.string().trim().max(160).nullable().optional(), posterUrl: z.string().url().nullable().optional(), format: z.enum(["auto", "long", "short", "photo"]).default("auto"), recommendationNote: z.string().trim().max(500).nullable().optional(), sortOrder: z.coerce.number().int().min(0).max(10_000).default(100), status: z.enum(["pending", "approved"]).default("approved") });

function replyError(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 }); }

export async function GET() {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  try { return NextResponse.json(await getCoreOriginalSnapshot(true)); } catch (error) { return replyError(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  try {
    await ensureCoreOriginalsSchema();
    const body = await request.json() as { action?: string };
    if (body.action === "create-original") {
      const input = original.parse(body);
      await query(`INSERT INTO core_originals (slug,title,summary,poster_url,enabled,sort_order,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [input.slug, input.title, input.summary ?? null, input.posterUrl, input.enabled, input.sortOrder, auth.id]);
    } else if (body.action === "add-item") {
      const input = item.parse(body);
      await query(`INSERT INTO core_original_items (original_id,source_url,platform,title,subtitle,poster_url,format,status,recommendation_note,sort_order,submitted_by,reviewed_by,reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $8='approved' THEN NOW() ELSE NULL END)`, [input.originalId, input.sourceUrl, input.platform, input.title, input.subtitle ?? null, input.posterUrl ?? null, input.format, input.status, input.recommendationNote ?? null, input.sortOrder, auth.id, input.status === "approved" ? auth.id : null]);
    } else if (body.action === "find-recommendations") {
      const input = z.object({ originalId: z.string().uuid(), query: z.string().trim().min(2).max(120) }).parse(body);
      const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      const catalog = await getWatchCatalog();
      const matches = catalog.all.filter((candidate) => candidate.kind !== "post" && candidate.format !== "photo" && words.every((word) => `${candidate.title} ${candidate.subtitle ?? ""} ${candidate.memberLabel}`.toLowerCase().includes(word))).slice(0, 12);
      for (const candidate of matches) {
        const candidatePlatform = platform.safeParse(candidate.platform).success ? candidate.platform : "other";
        const sourceUrl = candidate.sourceUrl ?? candidate.href;
        if (!/^https?:\/\//.test(sourceUrl)) continue;
        await query(`INSERT INTO core_original_items (original_id,source_url,platform,title,subtitle,poster_url,format,status,recommendation_note,submitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) ON CONFLICT DO NOTHING`, [input.originalId, sourceUrl, candidatePlatform, candidate.title, candidate.subtitle ?? null, candidate.poster ?? null, candidate.format === "short" ? "short" : "long", `Finder match for “${input.query}”`, auth.id]);
      }
    } else { throw new Error("Unknown action"); }
    return NextResponse.json(await getCoreOriginalSnapshot(true), { status: 201 });
  } catch (error) { return replyError(error); }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  try {
    await ensureCoreOriginalsSchema();
    const body = await request.json() as { action?: string };
    if (body.action === "review-item") {
      const input = z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected"]) }).parse(body);
      await query(`UPDATE core_original_items SET status=$2,reviewed_by=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1`, [input.id, input.status, auth.id]);
    } else if (body.action === "update-original") {
      const input = original.extend({ id: z.string().uuid() }).parse(body);
      await query(`UPDATE core_originals SET slug=$2,title=$3,summary=$4,poster_url=$5,enabled=$6,sort_order=$7,updated_at=NOW() WHERE id=$1`, [input.id, input.slug, input.title, input.summary ?? null, input.posterUrl, input.enabled, input.sortOrder]);
    } else { throw new Error("Unknown action"); }
    return NextResponse.json(await getCoreOriginalSnapshot(true));
  } catch (error) { return replyError(error); }
}

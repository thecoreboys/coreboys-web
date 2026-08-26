import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { query } from "@/lib/db";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { getPrivateFanPhoto } from "@/lib/fanzone-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  await ensureFanzoneSchema();
  const result = await query<{
    storage_key: string | null;
    thumb_storage_key: string | null;
    file_url: string;
    thumb_url: string | null;
  }>(
    `SELECT storage_key, thumb_storage_key, file_url, thumb_url
       FROM fan_submissions WHERE id = $1`,
    [parsed.data],
  );
  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const useThumb = new URL(req.url).searchParams.get("size") === "thumb";
  const key = useThumb ? row.thumb_storage_key ?? row.storage_key : row.storage_key;
  if (!key) {
    const legacy = useThumb ? row.thumb_url ?? row.file_url : row.file_url;
    if (isAllowedLegacyImage(legacy)) return NextResponse.redirect(legacy, 307);
    return NextResponse.json({ error: "image unavailable" }, { status: 404 });
  }
  try {
    const object = await getPrivateFanPhoto(key);
    return new Response(Buffer.from(object.bytes), {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "image unavailable" }, { status: 404 });
  }
}

function isAllowedLegacyImage(value: string): boolean {
  try {
    const url = new URL(value);
    const configured = process.env.SPACES_CDN_ENDPOINT
      ? new URL(process.env.SPACES_CDN_ENDPOINT).hostname
      : null;
    return (
      url.protocol === "https:" &&
      (url.hostname === configured ||
        url.hostname === "coreboys-media.nyc3.cdn.digitaloceanspaces.com" ||
        url.hostname === "coreboys-media.nyc3.digitaloceanspaces.com")
    );
  } catch {
    return false;
  }
}

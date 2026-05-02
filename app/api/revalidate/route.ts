import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { REVALIDATE_TAGS } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook receiver for cache invalidation events from coreboys-api.
 *
 * The api signs each payload with HMAC-SHA256 over the raw body using
 * `WEB_REVALIDATE_SECRET` (header `X-CoreBoys-Signature: sha256=<hex>`).
 *
 * Body shape:
 *   { paths: string[], deliveredAt: string }
 *
 * For each path, we both `revalidatePath()` and revalidate the matching
 * cache tags so SWR-style fetches in `lib/blog.ts` re-pull from origin.
 */
export async function POST(req: Request) {
  const secret = process.env.WEB_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const sigHeader = req.headers.get("x-coreboys-signature") ?? "";
  if (!sigHeader.startsWith("sha256=")) {
    return NextResponse.json({ error: "missing_signature" }, { status: 401 });
  }
  const provided = sigHeader.slice("sha256=".length);

  const raw = await req.text();
  const expected = createHmac("sha256", secret).update(raw).digest("hex");

  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let body: { paths?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];

  // Bust per-path Next caches.
  for (const p of paths) {
    revalidatePath(p);
    if (p.startsWith("/blog/")) {
      const slug = p.replace("/blog/", "");
      revalidateTag(`${REVALIDATE_TAGS.post}:${slug}`);
    }
  }
  // Bust the blog-wide cache so the index re-fetches.
  revalidateTag(REVALIDATE_TAGS.blog);

  return NextResponse.json({ ok: true, paths });
}

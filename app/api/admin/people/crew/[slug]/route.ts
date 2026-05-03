import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  displayName: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  worksWithSlugs: z.array(z.string()).nullable().optional(),
  hidden: z.boolean().optional(),
  socials: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string().url(),
        handle: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
});

const COL: Record<string, string> = {
  displayName: "display_name",
  role: "role",
  worksWithSlugs: "works_with_slugs",
  hidden: "hidden",
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const cols: string[] = [];
  const values: unknown[] = [slug];
  const placeholders: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === "socials") {
      cols.push("socials");
      values.push(JSON.stringify(v));
      placeholders.push(`$${values.length}::jsonb`);
    } else if (k in COL) {
      cols.push(COL[k]!);
      values.push(v);
      placeholders.push(`$${values.length}`);
    }
  }
  if (cols.length === 0) return NextResponse.json({ ok: true });

  const updateSets = cols.map((c, i) => `${c} = ${placeholders[i]}`).join(", ");
  const insertCols = ["slug", ...cols].join(", ");
  const insertValues = ["$1", ...placeholders].join(", ");
  await query(
    `INSERT INTO editable_crew_overrides (${insertCols})
     VALUES (${insertValues})
     ON CONFLICT (slug) DO UPDATE
       SET ${updateSets}, updated_at = NOW()`,
    values,
  );

  return NextResponse.json({ ok: true });
}

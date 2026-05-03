import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  stageName: z.string().nullable().optional(),
  realName: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  twitchLogin: z.string().nullable().optional(),
  commName: z.string().nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  hidden: z.boolean().optional(),
  poRecipient: z.string().nullable().optional(),
  poLines: z.array(z.string()).nullable().optional(),
  poCity: z.string().nullable().optional(),
  poRegion: z.string().nullable().optional(),
  poPostalCode: z.string().nullable().optional(),
  poCountry: z.string().nullable().optional(),
  youtubeChannelId: z.string().nullable().optional(),
});

const COL: Record<keyof z.infer<typeof PatchBody>, string> = {
  stageName: "stage_name",
  realName: "real_name",
  bio: "bio",
  birthDate: "birth_date",
  twitchLogin: "twitch_login",
  commName: "comm_name",
  accentColor: "accent_color",
  hidden: "hidden",
  poRecipient: "po_recipient",
  poLines: "po_lines",
  poCity: "po_city",
  poRegion: "po_region",
  poPostalCode: "po_postal_code",
  poCountry: "po_country",
  youtubeChannelId: "youtube_channel_id",
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
  const placeholders: string[] = [];
  const values: unknown[] = [slug];
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    cols.push(COL[k as keyof typeof COL]);
    values.push(v);
    placeholders.push(`$${values.length}`);
  }
  if (cols.length === 0) return NextResponse.json({ ok: true });

  // Upsert into editable_member_overrides keyed by slug. INSERT path
  // sets only the columns the admin sent + slug + hidden default; the
  // ON CONFLICT update rewrites just those.
  const updateSets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const insertCols = ["slug", "hidden", ...cols].join(", ");
  const insertValues = [
    "$1",
    body.hidden === undefined ? "FALSE" : `$${values.indexOf(body.hidden) + 1}`,
    ...placeholders,
  ].join(", ");
  await query(
    `INSERT INTO editable_member_overrides (${insertCols})
     VALUES (${insertValues})
     ON CONFLICT (slug) DO UPDATE
       SET ${updateSets}, updated_at = NOW()`,
    values,
  );

  return NextResponse.json({ ok: true });
}

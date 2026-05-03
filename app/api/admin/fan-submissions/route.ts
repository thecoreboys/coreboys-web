import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fan-wall photo submissions. The /fanzone public form POSTs anonymously
 *  (no admin auth) so an external visitor can submit; everything else
 *  requires admin auth. */

const PostBody = z.object({
  fileUrl: z.string().url(),
  thumbUrl: z.string().url().optional(),
  caption: z.string().optional(),
  submitterFirstName: z.string().min(1).max(40),
  submitterLastName: z.string().min(1).max(60),
  submitterEmail: z.string().email(),
  memberSlugs: z.array(z.string()).default([]),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    id: string; file_url: string; thumb_url: string | null; caption: string | null;
    submitter_first_name: string; submitter_last_name: string;
    submitter_email: string; member_slugs: string[];
    status: string; denial_reason: string | null;
    created_at: string;
  }>(
    `SELECT id::text, file_url, thumb_url, caption,
            submitter_first_name, submitter_last_name, submitter_email,
            member_slugs, status, denial_reason, created_at::text
     FROM fan_submissions ORDER BY created_at DESC`,
  );
  return NextResponse.json({ submissions: r.rows });
}

/** Public submission endpoint — no admin auth required. Anyone with the
 *  /fanzone form can post. We trust the email as a contact channel. */
export async function POST(req: Request) {
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  const r = await query<{ id: string }>(
    `INSERT INTO fan_submissions
       (file_url, thumb_url, caption, submitter_first_name, submitter_last_name,
        submitter_email, member_slugs)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [
      body.fileUrl,
      body.thumbUrl ?? null,
      body.caption ?? null,
      body.submitterFirstName,
      body.submitterLastName,
      body.submitterEmail.toLowerCase(),
      body.memberSlugs,
    ],
  );
  return NextResponse.json({ id: r.rows[0]!.id }, { status: 201 });
}

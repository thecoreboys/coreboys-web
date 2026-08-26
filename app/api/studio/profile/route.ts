import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-api";
import { query } from "@/lib/db";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { staffMemberScope } from "@/lib/staff-policy";
import {
  nullableProfileValue,
  StudioProfilePatch,
  type StudioProfile,
} from "@/lib/studio-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverrideRow = {
  bio: string | null;
  comm_name: string | null;
  favorite_game: string | null;
  description: string | null;
  nickname: string | null;
};

function requestedMember(req: Request): string | null {
  return new URL(req.url).searchParams.get("member");
}

function profileFor(slug: string, row: OverrideRow | undefined): StudioProfile {
  const member = MEMBERS_BY_SLUG[slug]!;
  return {
    slug,
    stageName: member.stageName,
    bio: row?.bio ?? member.bio ?? "",
    commName: row?.comm_name ?? member.comm.name ?? "",
    favoriteGame: row?.favorite_game ?? member.favoriteGame ?? "",
    description: row?.description ?? member.description ?? "",
    nickname: row?.nickname ?? member.nickname ?? "",
  };
}

async function loadProfile(slug: string): Promise<StudioProfile> {
  const result = await query<OverrideRow>(
    `SELECT bio, comm_name, favorite_game, description, nickname
       FROM editable_member_overrides
      WHERE slug = $1
      LIMIT 1`,
    [slug],
  );
  return profileFor(slug, result.rows[0]);
}

export async function GET(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const slug = staffMemberScope(auth, requestedMember(req), MEMBER_SLUGS);
  if (!slug) return NextResponse.json({ error: "member scope required" }, { status: 403 });
  return NextResponse.json({ profile: await loadProfile(slug) });
}

export async function PATCH(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const slug = staffMemberScope(auth, requestedMember(req), MEMBER_SLUGS);
  if (!slug) return NextResponse.json({ error: "member scope required" }, { status: 403 });

  const parsed = StudioProfilePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid payload" },
      { status: 400 },
    );
  }

  const current = await loadProfile(slug);
  const next = {
    bio: parsed.data.bio !== undefined ? parsed.data.bio : current.bio,
    commName: parsed.data.commName !== undefined ? parsed.data.commName : current.commName,
    favoriteGame: parsed.data.favoriteGame !== undefined ? parsed.data.favoriteGame : current.favoriteGame,
    description: parsed.data.description !== undefined ? parsed.data.description : current.description,
    nickname: parsed.data.nickname !== undefined ? parsed.data.nickname : current.nickname,
  };

  await query(
    `INSERT INTO editable_member_overrides
       (slug, bio, comm_name, favorite_game, description, nickname, hidden, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, now())
     ON CONFLICT (slug) DO UPDATE SET
       bio = EXCLUDED.bio,
       comm_name = EXCLUDED.comm_name,
       favorite_game = EXCLUDED.favorite_game,
       description = EXCLUDED.description,
       nickname = EXCLUDED.nickname,
       updated_at = now()`,
    [
      slug,
      nullableProfileValue(next.bio),
      nullableProfileValue(next.commName),
      nullableProfileValue(next.favoriteGame),
      nullableProfileValue(next.description),
      nullableProfileValue(next.nickname),
    ],
  );

  return NextResponse.json({ profile: await loadProfile(slug) });
}

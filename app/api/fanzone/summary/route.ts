import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { getPointsTotal, tierFor } from "@/lib/points";
import { MEMBERS } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentFanUserId();
  await ensureFanzoneSchema();
  const publicCounts = await query<{ photos: string; open_polls: string }>(
    `SELECT
       (SELECT COUNT(*) FROM fan_submissions WHERE status = 'approved')::text AS photos,
       (SELECT COUNT(*) FROM polls
         WHERE status = 'open' AND (closes_at IS NULL OR closes_at > now()))::text AS open_polls`,
  );
  const publicRow = publicCounts.rows[0];
  if (!userId) {
    return NextResponse.json({
      signedIn: false,
      wallPhotos: Number(publicRow?.photos ?? 0),
      openPolls: Number(publicRow?.open_polls ?? 0),
    });
  }

  const [points, counts, days, favorite] = await Promise.all([
    getPointsTotal(userId),
    query<{
      submissions: string;
      approved: string;
      submissions_week: string;
      poll_votes_week: string;
      reactions_week: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM fan_submissions WHERE user_id = $1)::text AS submissions,
         (SELECT COUNT(*) FROM fan_submissions WHERE user_id = $1 AND status = 'approved')::text AS approved,
         (SELECT COUNT(*) FROM fan_submissions WHERE user_id = $1 AND created_at >= date_trunc('week', now()))::text AS submissions_week,
         (SELECT COUNT(*) FROM poll_votes WHERE user_id = $1 AND created_at >= date_trunc('week', now()))::text AS poll_votes_week,
         (SELECT COUNT(*) FROM fan_photo_reactions WHERE user_id = $1 AND created_at >= date_trunc('week', now()))::text AS reactions_week`,
      [userId],
    ),
    query<{ day: string }>(
      `SELECT DISTINCT day::text FROM (
         SELECT created_at::date AS day FROM fan_points WHERE user_id = $1
         UNION ALL
         SELECT created_at::date AS day FROM fan_photo_reactions WHERE user_id = $1
         UNION ALL
         SELECT created_at::date AS day FROM fan_submissions WHERE user_id = $1
       ) activity
       WHERE day >= current_date - 45
       ORDER BY day::text DESC`,
      [userId],
    ),
    query<{ favorite_member: string | null }>(
      `SELECT favorite_member FROM fan_users WHERE id = $1`,
      [userId],
    ).catch(() => ({ rows: [] as Array<{ favorite_member: string | null }> })),
  ]);
  const row = counts.rows[0];
  const pollVotes = Number(row?.poll_votes_week ?? 0);
  const reactions = Number(row?.reactions_week ?? 0);
  const submissions = Number(row?.submissions ?? 0);
  const submissionsWeek = Number(row?.submissions_week ?? 0);
  const approved = Number(row?.approved ?? 0);
  const { tier, nextTierAt } = tierFor(points);
  const favoriteSlug = favorite.rows[0]?.favorite_member ?? null;
  const favoriteMember = MEMBERS.find((member) => member.slug === favoriteSlug)?.stageName ?? null;
  return NextResponse.json(
    {
      signedIn: true,
      wallPhotos: Number(publicRow?.photos ?? 0),
      openPolls: Number(publicRow?.open_polls ?? 0),
      points,
      tier,
      nextTierAt,
      streak: activityStreak(days.rows.map((entry) => entry.day)),
      submissions,
      approved,
      favoriteMember,
      missions: [
        { id: "vote", label: "Vote in a poll", progress: Math.min(1, pollVotes), goal: 1, href: "/fanzone#polls" },
        { id: "react", label: "CORE three wall posts", progress: Math.min(3, reactions), goal: 3, href: "/fanzone#wall" },
        { id: "submit", label: "Share a photo or artwork", progress: Math.min(1, submissionsWeek), goal: 1, href: "/fanzone#wall" },
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function activityStreak(values: string[]): number {
  const active = new Set(values);
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  const today = cursor.toISOString().slice(0, 10);
  if (!active.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (active.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

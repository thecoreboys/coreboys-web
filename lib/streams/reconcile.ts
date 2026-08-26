import "server-only";
import { query } from "@/lib/db";
import { MEMBERS } from "@/lib/members";
import { refreshAirtimeDailyArchive } from "@/lib/watch/airtime-archive";
import type { LiveEntry } from "@/lib/twitch";

export type LivePulse = {
  slug: string;
  login: string;
  isLive: boolean;
  streamId?: string | null;
  startedAt?: string;
  viewerCount?: number;
  title?: string;
  game?: string;
  thumbnailUrl?: string;
};

let lastPass = 0;
let schemaReady: Promise<void> | null = null;

function ensureStreamSessionSchema(): Promise<void> {
  schemaReady ??= query(
    `ALTER TABLE stream_sessions ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`,
  ).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function maybeRecordLiveSessions(entries: LiveEntry[]): Promise<void> {
  const now = Date.now();
  if (now - lastPass < 90_000) return;
  lastPass = now;
  const pulses: LivePulse[] = MEMBERS.map((m) => {
    const e = entries.find((x) => x.login.toLowerCase() === m.twitchLogin.toLowerCase());
    return {
      slug: m.slug,
      login: m.twitchLogin.toLowerCase(),
      isLive: Boolean(e?.isLive),
      streamId: e?.streamId ?? null,
      startedAt: e?.startedAt,
      viewerCount: e?.viewerCount,
      title: e?.title,
      game: e?.game,
      thumbnailUrl: e?.thumbnailUrl,
    };
  });
  await reconcileLiveSessions(pulses);
}

export async function reconcileLiveSessions(pulses: LivePulse[]): Promise<{
  opened: number;
  updated: number;
  closed: number;
}> {
  await ensureStreamSessionSchema();
  const openRes = await query<{
    member_slug: string;
    started_at: string;
    twitch_stream_id: string | null;
  }>(`SELECT member_slug, started_at::text, twitch_stream_id FROM stream_sessions WHERE ended_at IS NULL`);
  const openBySlug = new Map(openRes.rows.map((r) => [r.member_slug, r]));

  let opened = 0;
  let updated = 0;
  let closed = 0;

  for (const p of pulses) {
    const open = openBySlug.get(p.slug);
    const live = p.isLive && p.startedAt;

    if (live && open && p.streamId && open.twitch_stream_id && p.streamId !== open.twitch_stream_id) {
      await closeSession(p.slug);
      closed++;
      await openSession(p);
      opened++;
      continue;
    }

    if (live && !open) {
      await openSession(p);
      opened++;
    } else if (live && open) {
      await query(
        `UPDATE stream_sessions SET
            peak_viewers = GREATEST(peak_viewers, $1),
            sum_viewers = sum_viewers + $1,
            sample_count = sample_count + 1,
            total_minutes = GREATEST(
              total_minutes,
              CAST(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 AS INTEGER)
            ),
            title = COALESCE($2, title),
            game = COALESCE($3, game),
            thumbnail_url = COALESCE($5, thumbnail_url),
            last_polled_at = NOW()
         WHERE member_slug = $4 AND ended_at IS NULL`,
        [p.viewerCount ?? 0, p.title ?? null, p.game ?? null, p.slug, p.thumbnailUrl ?? null],
      );
      updated++;
    } else if (!p.isLive && open) {
      await closeSession(p.slug);
      closed++;
    }
  }

  // Keep a compact, durable day-level ledger beside the detailed live
  // sessions. The archive writer is migration-safe and best-effort, so a
  // deployment awaiting it can still reconcile the actual live stream state.
  await refreshAirtimeDailyArchive({ days: 3 });

  return { opened, updated, closed };
}

async function openSession(p: LivePulse) {
  const started = p.startedAt ?? new Date().toISOString();
  await query(
    `INSERT INTO stream_sessions
       (member_slug, twitch_login, twitch_stream_id, started_at,
        peak_viewers, sum_viewers, sample_count, total_minutes,
        title, game, last_polled_at, thumbnail_url)
     VALUES ($1,$2,$3,$4,$5,$6,1,
             GREATEST(0, CAST(EXTRACT(EPOCH FROM (NOW() - $4::timestamptz)) / 60 AS INTEGER)),
             $7,$8,NOW(),$9)
     ON CONFLICT DO NOTHING`,
    [
      p.slug,
      p.login,
      p.streamId ?? null,
      started,
      p.viewerCount ?? 0,
      p.viewerCount ?? 0,
      p.title ?? null,
      p.game ?? null,
      p.thumbnailUrl ?? null,
    ],
  );
}

async function closeSession(slug: string) {
  await query(
    `UPDATE stream_sessions SET
        ended_at = NOW(),
        total_minutes = GREATEST(
          0,
          CAST(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 AS INTEGER)
        )
     WHERE member_slug = $1 AND ended_at IS NULL`,
    [slug],
  );
}

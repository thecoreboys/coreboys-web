import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";

export type ProgressRow = {
  ref: string;
  kind: string;
  subject: string | null;
  hoverCount: number;
  seconds: number;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  positionUpdatedAt: string | null;
  completed: boolean;
  completionSource: "playback" | "manual" | "provider" | null;
  updatedAt: string;
};

export type ProgressMergeInput = Partial<
  Pick<
    ProgressRow,
    | "kind"
    | "subject"
    | "hoverCount"
    | "seconds"
    | "progress"
    | "positionSeconds"
    | "durationSeconds"
    | "positionUpdatedAt"
    | "completed"
    | "completionSource"
    | "updatedAt"
  >
> & { ref: string };

export async function listProgress(userId: string): Promise<ProgressRow[]> {
  await ensureFanOauthSchema();
  const { rows } = await query<{
    item_ref: string;
    kind: string;
    subject: string | null;
    hover_count: number;
    seconds: number;
    progress: number;
    position_seconds: number;
    duration_seconds: number;
    position_updated_at: Date | null;
    completed: boolean;
    completion_source: "playback" | "manual" | "provider" | null;
    updated_at: Date;
  }>(
    `SELECT item_ref, kind, subject, hover_count, seconds, progress,
            position_seconds, duration_seconds, position_updated_at, completed,
            completion_source, updated_at
       FROM fan_watch_progress
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    ref: r.item_ref,
    kind: r.kind,
    subject: r.subject,
    hoverCount: r.hover_count,
    seconds: r.seconds,
    progress: Math.min(1, Math.max(0, Number(r.progress) || 0)),
    positionSeconds: Math.max(0, Number(r.position_seconds) || 0),
    durationSeconds: Math.max(0, Number(r.duration_seconds) || 0),
    positionUpdatedAt: r.position_updated_at
      ? r.position_updated_at instanceof Date
        ? r.position_updated_at.toISOString()
        : String(r.position_updated_at)
      : null,
    completed: Boolean(r.completed),
    completionSource: r.completion_source,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export async function upsertProgress(input: {
  userId: string;
  ref: string;
  kind: string;
  subject?: string | null;
  event: "hover" | "tick" | "complete" | "mark_watched";
  seconds?: number;
  progress?: number;
  positionSeconds?: number;
  durationSeconds?: number;
  observedAt?: string;
}): Promise<number | null> {
  await ensureFanOauthSchema();
  const ref = input.ref.slice(0, 200);
  if (input.event === "hover") {
    await query(
      `INSERT INTO fan_watch_progress (user_id, item_ref, kind, subject, hover_count, last_hover_at, updated_at)
       VALUES ($1,$2,$3,$4,1, now(), now())
       ON CONFLICT (user_id, item_ref) DO UPDATE SET
         hover_count = fan_watch_progress.hover_count + 1,
         last_hover_at = now(),
         kind = EXCLUDED.kind,
         subject = COALESCE(EXCLUDED.subject, fan_watch_progress.subject),
         updated_at = now()`,
      [input.userId, ref, input.kind, input.subject ?? null],
    );
    return null;
  }
  if (input.event === "complete" || input.event === "mark_watched") {
    const position = Math.max(0, input.positionSeconds ?? 0);
    const duration = Math.max(0, input.durationSeconds ?? 0);
    const completionSource = input.event === "mark_watched" ? "manual" : "playback";
    await query(
      `INSERT INTO fan_watch_progress
         (user_id, item_ref, kind, subject, progress, position_seconds,
          duration_seconds, position_updated_at, completed, completion_source, updated_at)
       VALUES ($1,$2,$3,$4,1,$5,$6,now(),true,$7,now())
       ON CONFLICT (user_id, item_ref) DO UPDATE SET
         progress = 1,
         position_seconds = CASE
           WHEN EXCLUDED.duration_seconds > 0 THEN EXCLUDED.duration_seconds
           WHEN EXCLUDED.position_seconds > 0 THEN EXCLUDED.position_seconds
           ELSE fan_watch_progress.position_seconds
         END,
         duration_seconds = GREATEST(fan_watch_progress.duration_seconds, EXCLUDED.duration_seconds),
         position_updated_at = now(),
         completed = true,
         completion_source = CASE
           WHEN EXCLUDED.completion_source = 'playback' THEN 'playback'
           ELSE COALESCE(fan_watch_progress.completion_source, EXCLUDED.completion_source)
         END,
         kind = EXCLUDED.kind,
         subject = COALESCE(EXCLUDED.subject, fan_watch_progress.subject),
         updated_at = now()`,
      [input.userId, ref, input.kind, input.subject ?? null, position, duration, completionSource],
    );
    return null;
  }
  const add = Math.max(0, Math.min(input.seconds ?? 15, 120));
  const p = Math.min(1, Math.max(0, input.progress ?? 0));
  const position = input.positionSeconds == null
    ? null
    : Math.max(0, input.positionSeconds);
  const duration = Math.max(0, input.durationSeconds ?? 0);
  const observedAt = input.observedAt && Number.isFinite(Date.parse(input.observedAt))
    ? input.observedAt
    : new Date().toISOString();
  const result = await query<{ seconds: number }>(
    `INSERT INTO fan_watch_progress
       (user_id, item_ref, kind, subject, seconds, progress, position_seconds,
        duration_seconds, position_updated_at, completed, completion_source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::real,COALESCE($7::real,0::real),$8::real,
             CASE WHEN $7::real IS NULL THEN NULL ELSE LEAST($9::timestamptz, now()) END,
             $6::real >= 0.9::real,
             CASE WHEN $6::real >= 0.9::real THEN 'playback' ELSE NULL END, now())
     ON CONFLICT (user_id, item_ref) DO UPDATE SET
       seconds = fan_watch_progress.seconds + EXCLUDED.seconds,
       progress = GREATEST(fan_watch_progress.progress, EXCLUDED.progress),
       position_seconds = CASE
         WHEN EXCLUDED.position_updated_at IS NOT NULL
          AND (fan_watch_progress.position_updated_at IS NULL
               OR EXCLUDED.position_updated_at >= fan_watch_progress.position_updated_at)
           THEN EXCLUDED.position_seconds
         ELSE fan_watch_progress.position_seconds
       END,
       duration_seconds = GREATEST(fan_watch_progress.duration_seconds, EXCLUDED.duration_seconds),
       position_updated_at = CASE
         WHEN EXCLUDED.position_updated_at IS NOT NULL
          AND (fan_watch_progress.position_updated_at IS NULL
               OR EXCLUDED.position_updated_at >= fan_watch_progress.position_updated_at)
           THEN EXCLUDED.position_updated_at
         ELSE fan_watch_progress.position_updated_at
       END,
       completed = fan_watch_progress.completed OR EXCLUDED.progress >= 0.9,
       completion_source = CASE
         WHEN EXCLUDED.progress >= 0.9 THEN 'playback'
         ELSE fan_watch_progress.completion_source
       END,
       kind = EXCLUDED.kind,
       subject = COALESCE(EXCLUDED.subject, fan_watch_progress.subject),
       updated_at = now()
     RETURNING seconds`,
    [input.userId, ref, input.kind, input.subject ?? null, add, p, position, duration, observedAt],
  );
  if (add > 0) {
    await query(
      `INSERT INTO fan_watch_time_events
         (user_id,item_ref,kind,source,provider,seconds,observed_at)
       VALUES ($1,$2,$3,'site',NULL,$4,LEAST($5::timestamptz,now()))`,
      [input.userId, ref, input.kind, add, observedAt],
    );
  }
  return result.rows[0]?.seconds ?? null;
}

/**
 * One-time device-to-account merge used when a guest signs in. All counters
 * use max/OR semantics, so retrying the same payload cannot double-count time.
 * The newest position wins independently from hover/update activity.
 */
export async function mergeProgress(
  userId: string,
  incoming: ProgressMergeInput[],
  sourceId: string,
): Promise<void> {
  await ensureFanOauthSchema();
  const safeSourceId = sourceId.trim().slice(0, 100) || "legacy-v1";
  const deduped = new Map<string, ProgressMergeInput>();
  for (const item of incoming) {
    const ref = item.ref.trim().slice(0, 200);
    if (!ref) continue;
    const known = deduped.get(ref);
    const knownAt = known?.updatedAt ? Date.parse(known.updatedAt) : 0;
    const nextAt = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    if (!known || nextAt >= knownAt) deduped.set(ref, { ...item, ref });
  }
  const rows = [...deduped.values()].slice(0, 300).map((item) => ({
    item_ref: item.ref,
    kind: (item.kind || "youtube").slice(0, 40),
    subject: item.subject?.slice(0, 64) ?? null,
    hover_count: Math.max(0, Math.trunc(item.hoverCount ?? 0)),
    seconds: Math.max(0, Math.trunc(item.seconds ?? 0)),
    progress: Math.min(1, Math.max(0, item.progress ?? 0)),
    position_seconds: Math.max(0, item.positionSeconds ?? 0),
    duration_seconds: Math.max(0, item.durationSeconds ?? 0),
    // General activity (especially hover) must never masquerade as a
    // playback-position observation. The updatedAt fallback is only for
    // legacy marks that actually contain a non-zero resume point.
    position_updated_at:
      item.positionUpdatedAt && Number.isFinite(Date.parse(item.positionUpdatedAt))
        ? item.positionUpdatedAt
        : (item.positionSeconds ?? 0) > 0 &&
            item.updatedAt &&
            Number.isFinite(Date.parse(item.updatedAt))
          ? item.updatedAt
          : null,
    completed: Boolean(item.completed),
    completion_source:
      item.completionSource === "manual" || item.completionSource === "provider"
        ? item.completionSource
        : item.completed ? "playback" : null,
    updated_at:
      item.updatedAt && Number.isFinite(Date.parse(item.updatedAt))
        ? item.updatedAt
        : new Date().toISOString(),
  }));
  if (!rows.length) return;
  await query(
    `WITH incoming AS (
       SELECT item_ref,
              COALESCE(NULLIF(kind, ''), 'youtube') AS kind,
              subject,
              GREATEST(hover_count, 0) AS hover_count,
              GREATEST(seconds, 0) AS seconds,
              LEAST(1, GREATEST(progress, 0)) AS progress,
              GREATEST(position_seconds, 0) AS position_seconds,
              GREATEST(duration_seconds, 0) AS duration_seconds,
              completed,
              CASE WHEN completion_source IN ('playback','manual','provider')
                   THEN completion_source ELSE NULL END AS completion_source,
              CASE
                WHEN position_updated_at IS NULL THEN NULL
                ELSE LEAST(position_updated_at, now())
              END AS position_observed_at,
              LEAST(updated_at, now()) AS activity_observed_at
         FROM jsonb_to_recordset($2::jsonb) AS x(
           item_ref text,
           kind text,
           subject text,
           hover_count integer,
           seconds integer,
           progress real,
           position_seconds real,
           duration_seconds real,
           completed boolean,
           completion_source text,
           position_updated_at timestamptz,
           updated_at timestamptz
         )
     ), source_merge AS (
       INSERT INTO fan_watch_progress_sources
         (user_id, source_id, item_ref, hover_count, seconds,
          hover_delta, seconds_delta, updated_at)
       SELECT $1, $3, item_ref, hover_count, seconds,
              hover_count, seconds, now()
         FROM incoming
       ON CONFLICT (user_id, source_id, item_ref) DO UPDATE SET
         hover_delta = GREATEST(
           EXCLUDED.hover_count - fan_watch_progress_sources.hover_count,
           0
         ),
         seconds_delta = GREATEST(
           EXCLUDED.seconds - fan_watch_progress_sources.seconds,
           0
         ),
         hover_count = GREATEST(
           fan_watch_progress_sources.hover_count,
           EXCLUDED.hover_count
         ),
         seconds = GREATEST(
           fan_watch_progress_sources.seconds,
           EXCLUDED.seconds
         ),
         updated_at = now()
       RETURNING item_ref, hover_delta, seconds_delta
     ), merged AS (
       SELECT incoming.*,
              source_merge.hover_delta,
              source_merge.seconds_delta
         FROM incoming
         JOIN source_merge USING (item_ref)
     )
     INSERT INTO fan_watch_progress
       (user_id, item_ref, kind, subject, hover_count, seconds, progress,
        position_seconds, duration_seconds, position_updated_at, completed,
        completion_source, updated_at)
     SELECT $1, item_ref, kind, subject, hover_delta, seconds_delta, progress,
            position_seconds, duration_seconds, position_observed_at, completed,
            completion_source, activity_observed_at
       FROM merged
     ON CONFLICT (user_id, item_ref) DO UPDATE SET
       kind = EXCLUDED.kind,
       subject = COALESCE(EXCLUDED.subject, fan_watch_progress.subject),
       hover_count = fan_watch_progress.hover_count + EXCLUDED.hover_count,
       seconds = fan_watch_progress.seconds + EXCLUDED.seconds,
       progress = GREATEST(fan_watch_progress.progress, EXCLUDED.progress),
       position_seconds = CASE
         WHEN EXCLUDED.position_updated_at IS NOT NULL
          AND (fan_watch_progress.position_updated_at IS NULL
               OR EXCLUDED.position_updated_at >= fan_watch_progress.position_updated_at)
           THEN EXCLUDED.position_seconds
         ELSE fan_watch_progress.position_seconds
       END,
       duration_seconds = GREATEST(fan_watch_progress.duration_seconds, EXCLUDED.duration_seconds),
       position_updated_at = CASE
         WHEN EXCLUDED.position_updated_at IS NOT NULL
          AND (fan_watch_progress.position_updated_at IS NULL
               OR EXCLUDED.position_updated_at >= fan_watch_progress.position_updated_at)
           THEN EXCLUDED.position_updated_at
         ELSE fan_watch_progress.position_updated_at
       END,
       completed = fan_watch_progress.completed OR EXCLUDED.completed,
       completion_source = CASE
         WHEN EXCLUDED.completion_source = 'playback' THEN 'playback'
         WHEN fan_watch_progress.completion_source IS NULL THEN EXCLUDED.completion_source
         ELSE fan_watch_progress.completion_source
       END,
       updated_at = GREATEST(fan_watch_progress.updated_at, EXCLUDED.updated_at)`,
    [userId, JSON.stringify(rows), safeSourceId],
  );
}

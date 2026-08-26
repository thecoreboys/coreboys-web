-- Durable daily airtime archive.
--
-- `stream_sessions` is the high-resolution live-observation ledger. This
-- compact rollup deliberately keeps one immutable-ish contribution record per
-- member/day so the Guide can render a year (and later years) of history even
-- if old stream-session rows are eventually pruned for operational reasons.
-- Days are stored in UTC; current/recent sessions remain available to the UI
-- for viewer-local precision around midnight.

CREATE TABLE IF NOT EXISTS airtime_daily_archive (
  member_slug       TEXT NOT NULL,
  archive_date      DATE NOT NULL,
  minutes_streamed  INTEGER NOT NULL DEFAULT 0 CHECK (minutes_streamed >= 0),
  broadcasts        INTEGER NOT NULL DEFAULT 0 CHECK (broadcasts >= 0),
  peak_viewers      INTEGER NOT NULL DEFAULT 0 CHECK (peak_viewers >= 0),
  source            TEXT NOT NULL DEFAULT 'stream_sessions'
                    CHECK (source IN ('stream_sessions')),
  archived_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_slug, archive_date)
);

CREATE INDEX IF NOT EXISTS airtime_daily_archive_date_idx
  ON airtime_daily_archive (archive_date DESC);

CREATE INDEX IF NOT EXISTS airtime_daily_archive_member_date_idx
  ON airtime_daily_archive (member_slug, archive_date DESC);

-- Rebuild a bounded UTC date range from the detailed observation ledger.
-- Calling this repeatedly is safe: closed sessions converge on their exact
-- durations, while an open live stream updates only its current day. We do
-- not delete archive rows here; once an observed day has been persisted it is
-- intentionally retained even if a future retention job removes raw sessions.
CREATE OR REPLACE FUNCTION refresh_airtime_daily_archive(
  p_start_date DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows INTEGER := 0;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RETURN 0;
  END IF;

  WITH bounds AS (
    SELECT
      (p_start_date::timestamp AT TIME ZONE 'UTC') AS window_start,
      ((p_end_date + 1)::timestamp AT TIME ZONE 'UTC') AS window_end
  ),
  segments AS (
    SELECT
      s.member_slug,
      s.id AS session_id,
      s.peak_viewers,
      days.day_start::date AS archive_date,
      GREATEST(s.started_at, bounds.window_start, days.day_start AT TIME ZONE 'UTC') AS segment_start,
      LEAST(
        COALESCE(s.ended_at, NOW()),
        bounds.window_end,
        (days.day_start + INTERVAL '1 day') AT TIME ZONE 'UTC'
      ) AS segment_end
    FROM stream_sessions AS s
    CROSS JOIN bounds
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', GREATEST(s.started_at, bounds.window_start) AT TIME ZONE 'UTC'),
      date_trunc(
        'day',
        (LEAST(COALESCE(s.ended_at, NOW()), bounds.window_end) - INTERVAL '1 microsecond') AT TIME ZONE 'UTC'
      ),
      INTERVAL '1 day'
    ) AS days(day_start)
    WHERE s.started_at < bounds.window_end
      AND COALESCE(s.ended_at, NOW()) > bounds.window_start
  ),
  daily AS (
    SELECT
      member_slug,
      archive_date,
      GREATEST(0, ROUND(SUM(EXTRACT(EPOCH FROM (segment_end - segment_start)) / 60)))::INTEGER AS minutes_streamed,
      COUNT(DISTINCT session_id)::INTEGER AS broadcasts,
      COALESCE(MAX(peak_viewers), 0)::INTEGER AS peak_viewers
    FROM segments
    WHERE segment_end > segment_start
    GROUP BY member_slug, archive_date
  )
  INSERT INTO airtime_daily_archive (
    member_slug,
    archive_date,
    minutes_streamed,
    broadcasts,
    peak_viewers,
    source,
    archived_at
  )
  SELECT
    member_slug,
    archive_date,
    minutes_streamed,
    broadcasts,
    peak_viewers,
    'stream_sessions',
    NOW()
  FROM daily
  ON CONFLICT (member_slug, archive_date)
  DO UPDATE SET
    minutes_streamed = EXCLUDED.minutes_streamed,
    broadcasts = EXCLUDED.broadcasts,
    peak_viewers = EXCLUDED.peak_viewers,
    source = EXCLUDED.source,
    archived_at = EXCLUDED.archived_at;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

-- Backfill every detailed session that already exists at rollout. This is
-- bounded by the actual ledger rather than a 30-day provider window.
SELECT refresh_airtime_daily_archive(
  COALESCE(
    (SELECT MIN((started_at AT TIME ZONE 'UTC')::date) FROM stream_sessions),
    CURRENT_DATE
  ),
  CURRENT_DATE
);

COMMENT ON TABLE airtime_daily_archive IS
  'Durable UTC daily Twitch airtime rollups; retained beyond raw stream-session history.';
COMMENT ON FUNCTION refresh_airtime_daily_archive(DATE, DATE) IS
  'Upserts durable daily airtime from stream_sessions without deleting historic archive rows.';

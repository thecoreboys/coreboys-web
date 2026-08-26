/**
 * Community data layer (Features 2, 3, 5) — polls/voting, clip upvotes +
 * leaderboard, and notification preferences. All access goes through
 * query() from lib/db. Server-only.
 */
import { query, withTransaction } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { awardPointsInTransaction, POINTS } from "@/lib/points";
import type { FanzoneCommunityKey } from "@/lib/fanzone-community-config";

// =====================================================================
// Polls (Feature 2)
// =====================================================================

export type PollOptionResult = {
  id: string;
  label: string;
  votes: number;
  weightedScore: number;
  mediaUrl: string | null;
  pct: number;
};

export type PollKind = "standard" | "caption" | "prediction" | "ranked" | "trivia" | "mvp";
export type PollAudience = "everyone" | "signed_in" | "live_attendees" | "members";

export type PollResult = {
  id: string;
  question: string;
  kind: PollKind;
  status: "scheduled" | "open" | "closed";
  description: string | null;
  mediaUrl: string | null;
  sourceSubmissionId: string | null;
  winnerOptionId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  resultsVisibility: "always" | "after_vote" | "after_close";
  featured: boolean;
  audience: PollAudience;
  communityKey: FanzoneCommunityKey | null;
  options: PollOptionResult[];
  totalVotes: number;
  weightedScore: number;
  /** The option this user voted for, if they have + a uid was supplied. */
  myOptionId: string | null;
  myRanking: string[] | null;
};

type PollRow = {
  id: string;
  question: string;
  kind: PollKind;
  status: "scheduled" | "open" | "closed";
  description: string | null;
  media_url: string | null;
  source_submission_id: string | null;
  winner_option_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  results_visibility: "always" | "after_vote" | "after_close";
  featured: boolean;
  passport_audience: PollAudience;
  community_key: FanzoneCommunityKey | null;
};

type OptionRow = {
  id: string;
  poll_id: string;
  label: string;
  media_url: string | null;
  votes: string;
  score_units: string;
  ballots: string;
};

let pollSchemaReady: Promise<void> | null = null;

async function ensurePollSchema(): Promise<void> {
  if (pollSchemaReady) return pollSchemaReady;
  pollSchemaReady = (async () => {
    await ensureFanzoneSchema();
    await query(`
      ALTER TABLE polls
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS opens_at timestamptz,
        ADD COLUMN IF NOT EXISTS results_visibility text NOT NULL DEFAULT 'after_vote',
        ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS media_url text,
        ADD COLUMN IF NOT EXISTS source_submission_id uuid REFERENCES fan_submissions(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS winner_option_id uuid,
        ADD COLUMN IF NOT EXISTS passport_event_id uuid,
        ADD COLUMN IF NOT EXISTS channel_slug text,
        ADD COLUMN IF NOT EXISTS community_key text,
        ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS passport_audience text NOT NULL DEFAULT 'signed_in',
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `);
    await query(`ALTER TABLE poll_options ADD COLUMN IF NOT EXISTS media_url text`);
    await query(`ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 4`);
    await query(`ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS ranking uuid[]`);
    await query(`ALTER TABLE poll_votes ALTER COLUMN weight SET DEFAULT 4`);
    await query(`UPDATE poll_votes SET weight = 4 WHERE weight < 4`);
    await query(`ALTER TABLE polls DROP CONSTRAINT IF EXISTS polls_community_key_check`);
    await query(`ALTER TABLE polls ADD CONSTRAINT polls_community_key_check
      CHECK (community_key IS NULL OR community_key IN ('core','flock','stable','thugs','m3','nms','slg'))`);
  })().catch((error) => {
    pollSchemaReady = null;
    throw error;
  });
  return pollSchemaReady;
}

function assemblePoll(
  poll: PollRow,
  options: OptionRow[],
  mine: { optionId: string; ranking: string[] | null } | null,
): PollResult {
  const opts = options
    .filter((o) => o.poll_id === poll.id)
    .map((o) => ({
      id: o.id,
      label: o.label,
      mediaUrl: o.media_url,
      votes: Number(o.votes),
      scoreUnits: Number(o.score_units),
      ballots: Number(o.ballots),
      weightedScore: Number((Number(o.score_units) / 4).toFixed(2)),
    }));
  const totalVotes = poll.kind === "ranked"
    ? Math.max(0, ...opts.map((option) => option.ballots))
    : opts.reduce((s, o) => s + o.votes, 0);
  const totalScoreUnits = opts.reduce((s, o) => s + o.scoreUnits, 0);
  return {
    id: poll.id,
    question: poll.question,
    kind: poll.kind,
    status: poll.status,
    description: poll.description,
    mediaUrl: poll.media_url,
    sourceSubmissionId: poll.source_submission_id,
    winnerOptionId: poll.winner_option_id,
    opensAt: poll.opens_at,
    closesAt: poll.closes_at,
    createdAt: poll.created_at,
    resultsVisibility: poll.results_visibility,
    featured: poll.featured,
    audience: poll.passport_audience,
    communityKey: poll.community_key,
    totalVotes,
    weightedScore: Number((totalScoreUnits / 4).toFixed(2)),
    options: opts.map((o) => ({
      id: o.id,
      label: o.label,
      mediaUrl: o.mediaUrl,
      votes: o.votes,
      weightedScore: o.weightedScore,
      pct: totalScoreUnits > 0 ? Math.round((o.scoreUnits / totalScoreUnits) * 100) : 0,
    })),
    myOptionId: mine?.optionId ?? null,
    myRanking: mine?.ranking ?? null,
  };
}

async function loadOptionRows(pollIds: string[]): Promise<OptionRow[]> {
  if (pollIds.length === 0) return [];
  const r = await query<OptionRow>(
    `SELECT po.id::text, po.poll_id::text, po.label, po.media_url,
            COUNT(pv.user_id) FILTER (WHERE pv.option_id = po.id)::text AS votes,
            COALESCE(SUM(
              CASE WHEN p.kind = 'ranked' THEN
                (COALESCE(ARRAY_LENGTH(pv.ranking, 1), 1)
                 - COALESCE(ARRAY_POSITION(pv.ranking, po.id), 1) + 1)
                * pv.weight
              ELSE pv.weight END
            ), 0)::text AS score_units,
            (SELECT COUNT(*)::text FROM poll_votes all_votes
              WHERE all_votes.poll_id = po.poll_id) AS ballots
       FROM poll_options po
       JOIN polls p ON p.id = po.poll_id
       LEFT JOIN poll_votes pv
         ON pv.poll_id = po.poll_id
        AND (
          (p.kind = 'ranked' AND po.id = ANY(COALESCE(pv.ranking, ARRAY[pv.option_id])))
          OR (p.kind <> 'ranked' AND pv.option_id = po.id)
        )
      WHERE po.poll_id = ANY($1::uuid[])
      GROUP BY po.id
      ORDER BY po.position ASC, po.id ASC`,
    [pollIds],
  );
  return r.rows;
}

async function loadMyVotes(
  pollIds: string[],
  userId: string,
): Promise<Map<string, { optionId: string; ranking: string[] | null }>> {
  if (pollIds.length === 0) return new Map();
  const r = await query<{ poll_id: string; option_id: string; ranking: string[] | null }>(
    `SELECT poll_id::text, option_id::text, ranking::text[] FROM poll_votes
      WHERE user_id = $1 AND poll_id = ANY($2::uuid[])`,
    [userId, pollIds],
  );
  return new Map(r.rows.map((row) => [row.poll_id, { optionId: row.option_id, ranking: row.ranking }]));
}

/** All polls (newest first), with options, vote counts, and my vote. */
export async function listPolls(
  userId: string | null,
  options: {
    includeScheduled?: boolean;
    revealResults?: boolean;
    communityKey?: FanzoneCommunityKey;
  } = {},
): Promise<PollResult[]> {
  await ensurePollSchema();
  const pr = await query<PollRow>(
    `SELECT id::text, question, kind, description, media_url,
            source_submission_id::text, winner_option_id::text,
            CASE
              WHEN opens_at IS NOT NULL AND opens_at > now() THEN 'scheduled'
              WHEN status = 'closed' OR (closes_at IS NOT NULL AND closes_at <= now()) THEN 'closed'
              ELSE 'open'
            END AS status,
            opens_at::text, closes_at::text, created_at::text,
            results_visibility, featured, passport_audience, community_key
       FROM polls
      WHERE ($1::boolean OR opens_at IS NULL OR opens_at <= now())
        AND ($3::boolean OR passport_event_id IS NULL OR lifecycle_state IN ('live','locked','certified'))
        AND ($3::boolean OR passport_audience='everyone' OR $2::text IS NOT NULL)
        AND ($3::boolean OR passport_audience<>'live_attendees' OR EXISTS(
          SELECT 1 FROM passport_event_presence ep
           WHERE ep.event_id=polls.passport_event_id AND ep.user_id=$2 AND ep.state IN('eligible','verified')
        ))
        AND ($3::boolean OR passport_audience<>'members' OR EXISTS(
          SELECT 1 FROM fan_users fu WHERE fu.id=$2 AND fu.email_verified
        ))
        AND (
          $4::text IS NULL
          OR ($4='core' AND COALESCE(community_key,'core')='core')
          OR ($4<>'core' AND community_key=$4)
        )
      ORDER BY featured DESC, created_at DESC`,
    [Boolean(options.includeScheduled),userId,Boolean(options.revealResults),options.communityKey ?? null],
  );
  const polls = pr.rows;
  const ids = polls.map((p) => p.id);
  const optionRows = await loadOptionRows(ids);
  const mine = userId
    ? await loadMyVotes(ids, userId)
    : new Map<string, { optionId: string; ranking: string[] | null }>();
  return polls.map((p) => {
    const assembled = assemblePoll(p, optionRows, mine.get(p.id) ?? null);
    return options.revealResults ? assembled : hideResultsWhenNeeded(assembled);
  });
}

export async function getPoll(
  pollId: string,
  userId: string | null,
  settings: { revealResults?: boolean } = {},
): Promise<PollResult | null> {
  await ensurePollSchema();
  const pr = await query<PollRow>(
    `SELECT id::text, question, kind, description, media_url,
            source_submission_id::text, winner_option_id::text,
            CASE
              WHEN opens_at IS NOT NULL AND opens_at > now() THEN 'scheduled'
              WHEN status = 'closed' OR (closes_at IS NOT NULL AND closes_at <= now()) THEN 'closed'
              ELSE 'open'
            END AS status,
            opens_at::text, closes_at::text, created_at::text,
            results_visibility, featured, passport_audience, community_key
       FROM polls WHERE id = $1
        AND ($3::boolean OR passport_event_id IS NULL OR lifecycle_state IN ('live','locked','certified'))
        AND ($3::boolean OR passport_audience='everyone' OR $2::text IS NOT NULL)
        AND ($3::boolean OR passport_audience<>'live_attendees' OR EXISTS(
          SELECT 1 FROM passport_event_presence ep
           WHERE ep.event_id=polls.passport_event_id AND ep.user_id=$2 AND ep.state IN('eligible','verified')
        ))
        AND ($3::boolean OR passport_audience<>'members' OR EXISTS(
          SELECT 1 FROM fan_users fu WHERE fu.id=$2 AND fu.email_verified
        ))`,
    [pollId,userId,Boolean(settings.revealResults)],
  );
  const poll = pr.rows[0];
  if (!poll) return null;
  const optionRows = await loadOptionRows([poll.id]);
  const mine = userId
    ? await loadMyVotes([poll.id], userId)
    : new Map<string, { optionId: string; ranking: string[] | null }>();
  const assembled = assemblePoll(poll, optionRows, mine.get(poll.id) ?? null);
  return settings.revealResults ? assembled : hideResultsWhenNeeded(assembled);
}

function hideResultsWhenNeeded(poll: PollResult): PollResult {
  const canSee =
    poll.status === "closed" ||
    poll.resultsVisibility === "always" ||
    (poll.resultsVisibility === "after_vote" && poll.myOptionId !== null);
  if (canSee) return poll;
  return {
    ...poll,
    totalVotes: 0,
    weightedScore: 0,
    options: poll.options.map((option) => ({
      ...option,
      votes: 0,
      weightedScore: 0,
      pct: 0,
    })),
  };
}

export type CreatePollInput = {
  question: string;
  options: Array<{ label: string; mediaUrl?: string | null }>;
  kind?: PollKind;
  description?: string | null;
  mediaUrl?: string | null;
  sourceSubmissionId?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  resultsVisibility?: "always" | "after_vote" | "after_close";
  featured?: boolean;
  audience?: PollAudience;
  communityKey?: FanzoneCommunityKey | null;
  createdBy: string;
};

export async function createPoll(input: CreatePollInput): Promise<string> {
  await ensurePollSchema();
  const pr = await query<{ id: string }>(
    `WITH created AS (
       INSERT INTO polls (
         question, description, status, created_by, opens_at, closes_at,
         results_visibility, featured, kind, media_url, source_submission_id, passport_audience,
         community_key
       ) VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8, $9, $10, $12, $13)
       RETURNING id
     )
     INSERT INTO poll_options (poll_id, label, media_url, position)
     SELECT created.id, option.label, option.media_url, option.position
       FROM created
       CROSS JOIN JSONB_TO_RECORDSET($11::jsonb)
         AS option(label text, media_url text, position integer)
     RETURNING poll_id::text AS id`,
    [
      input.question,
      input.description ?? null,
      input.createdBy,
      input.opensAt ?? null,
      input.closesAt ?? null,
      input.resultsVisibility ?? "after_vote",
      input.featured ?? false,
      input.kind ?? "standard",
      input.mediaUrl ?? null,
      input.sourceSubmissionId ?? null,
      JSON.stringify(input.options.map((option, position) => ({
        label: option.label,
        media_url: option.mediaUrl ?? null,
        position,
      }))),
      input.audience ?? "signed_in",
      input.communityKey ?? null,
    ],
  );
  const pollId = pr.rows[0]!.id;
  return pollId;
}

export async function setPollStatus(
  pollId: string,
  status: "open" | "closed",
): Promise<boolean> {
  await ensurePollSchema();
  const r = await query(
    `UPDATE polls SET status = $1, updated_at = now()
      WHERE id = $2
        AND passport_event_id IS NULL
        AND ($1 = 'closed' OR closes_at IS NULL OR closes_at > now())`,
    [status, pollId],
  );
  return (r.rowCount ?? 0) > 0;
}

export type PollSettings = {
  description?: string | null;
  mediaUrl?: string | null;
  sourceSubmissionId?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  resultsVisibility?: "always" | "after_vote" | "after_close";
  featured?: boolean;
  communityKey?: FanzoneCommunityKey | null;
};

export async function updatePollSettings(pollId: string, settings: PollSettings): Promise<boolean> {
  await ensurePollSchema();
  const r = await query(
    `UPDATE polls SET
       description = CASE WHEN $2::boolean THEN $3 ELSE description END,
       media_url = CASE WHEN $4::boolean THEN $5 ELSE media_url END,
       source_submission_id = CASE WHEN $6::boolean THEN $7::uuid ELSE source_submission_id END,
       opens_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE opens_at END,
       closes_at = CASE WHEN $10::boolean THEN $11::timestamptz ELSE closes_at END,
       results_visibility = COALESCE($12, results_visibility),
       featured = COALESCE($13, featured),
       community_key = CASE WHEN $14::boolean THEN $15 ELSE community_key END,
       updated_at = now()
     WHERE id = $1
       AND passport_event_id IS NULL`,
    [
      pollId,
      settings.description !== undefined,
      settings.description ?? null,
      settings.mediaUrl !== undefined,
      settings.mediaUrl ?? null,
      settings.sourceSubmissionId !== undefined,
      settings.sourceSubmissionId ?? null,
      settings.opensAt !== undefined,
      settings.opensAt ?? null,
      settings.closesAt !== undefined,
      settings.closesAt ?? null,
      settings.resultsVisibility ?? null,
      settings.featured ?? null,
      settings.communityKey !== undefined,
      settings.communityKey ?? null,
    ],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function setPollWinner(
  pollId: string,
  optionId: string | null,
): Promise<boolean> {
  await ensurePollSchema();
  const result = await query(
    `UPDATE polls SET winner_option_id = $2::uuid, updated_at = now()
      WHERE id = $1
        AND passport_event_id IS NULL
        AND ($2::uuid IS NULL OR EXISTS (
          SELECT 1 FROM poll_options WHERE id = $2::uuid AND poll_id = $1
        ))`,
    [pollId, optionId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deletePoll(pollId: string): Promise<boolean> {
  await ensurePollSchema();
  const r = await query(`DELETE FROM polls WHERE id = $1 AND passport_event_id IS NULL`, [pollId]);
  return (r.rowCount ?? 0) > 0;
}

export type CastVoteResult =
  | { ok: true; awarded: boolean }
  | { ok: false; reason: "closed" | "bad_option" | "already_voted" | "not_found" };

/**
 * Cast a fan's single vote. Validates the poll is open and the option belongs
 * to the poll, then inserts (PK poll_id,user_id) ON CONFLICT DO NOTHING.
 * Returns whether a fresh vote landed (so the caller can award points).
 */
export async function castVote(
  pollId: string,
  optionId: string,
  userId: string,
  weight = 1,
): Promise<CastVoteResult> {
  await ensureFanOauthSchema();
  await ensurePollSchema();
  const w = weight >= 5 ? 5 : 4;
  const transaction = await withTransaction(async(client)=>{
    const ins = await client.query(
    `WITH eligible_poll AS (
       SELECT p.* FROM polls p
        WHERE p.id=$1
          AND p.kind<>'ranked'
          AND p.status='open'
          AND (p.passport_event_id IS NULL OR p.lifecycle_state='live')
          AND (p.opens_at IS NULL OR p.opens_at<=now())
          AND (p.closes_at IS NULL OR p.closes_at>now())
          AND (p.passport_audience<>'live_attendees' OR EXISTS(
            SELECT 1 FROM passport_event_presence ep WHERE ep.event_id=p.passport_event_id AND ep.user_id=$3 AND ep.state IN('eligible','verified')
          ))
          AND (p.passport_audience<>'members' OR EXISTS(
            SELECT 1 FROM fan_users fu WHERE fu.id=$3 AND fu.email_verified
          ))
          AND NOT EXISTS(SELECT 1 FROM passport_channel_controls c WHERE c.channel_slug=p.channel_slug
            AND (c.scope_key='*' OR c.scope_key=p.passport_event_id::text) AND c.polls_frozen)
        FOR SHARE
     )
     INSERT INTO poll_votes (poll_id, option_id, user_id, weight)
     SELECT p.id, po.id, $3, $4
       FROM eligible_poll p
       JOIN poll_options po ON po.poll_id = p.id AND po.id = $2
     ON CONFLICT (poll_id, user_id) DO NOTHING`,
    [pollId, optionId, userId, w],
    );
    const inserted=(ins.rowCount ?? 0)>0;
    if(!inserted)return{inserted:false,awarded:false};
    const channel=(await client.query<{channel_slug:string|null}>(`SELECT channel_slug FROM polls WHERE id=$1`,[pollId])).rows[0]?.channel_slug ?? null;
    const points=await awardPointsInTransaction(client,userId,POINTS.poll_vote,"poll_vote","poll",pollId,channel);
    return{inserted:true,awarded:points.newlyAwarded};
  });
  const inserted = transaction.inserted;
  if (!inserted) {
    const state = await query<{
      exists: boolean;
      open: boolean;
      option_exists: boolean;
      already_voted: boolean;
    }>(
      `SELECT
         EXISTS(SELECT 1 FROM polls WHERE id = $1) AS exists,
         EXISTS(SELECT 1 FROM polls WHERE id = $1 AND status = 'open'
           AND kind <> 'ranked'
           AND (passport_event_id IS NULL OR lifecycle_state='live')
           AND (passport_audience<>'live_attendees' OR EXISTS(
             SELECT 1 FROM passport_event_presence ep WHERE ep.event_id=polls.passport_event_id AND ep.user_id=$3 AND ep.state IN('eligible','verified')
           ))
           AND (passport_audience<>'members' OR EXISTS(
             SELECT 1 FROM fan_users fu WHERE fu.id=$3 AND fu.email_verified
           ))
           AND NOT EXISTS(SELECT 1 FROM passport_channel_controls c WHERE c.channel_slug=polls.channel_slug
             AND (c.scope_key='*' OR c.scope_key=polls.passport_event_id::text) AND c.polls_frozen)
           AND (opens_at IS NULL OR opens_at <= now())
           AND (closes_at IS NULL OR closes_at > now())) AS open,
         EXISTS(SELECT 1 FROM poll_options WHERE id = $2 AND poll_id = $1) AS option_exists,
         EXISTS(SELECT 1 FROM poll_votes WHERE poll_id = $1 AND user_id = $3) AS already_voted`,
      [pollId, optionId, userId],
    );
    const row = state.rows[0];
    if (!row?.exists) return { ok: false, reason: "not_found" };
    if (row.already_voted) return { ok: false, reason: "already_voted" };
    if (!row.open) return { ok: false, reason: "closed" };
    if (!row.option_exists) return { ok: false, reason: "bad_option" };
    return { ok: false, reason: "closed" };
  }
  return { ok: true, awarded: transaction.awarded };
}

/** Stores a complete ranked ballot atomically in the existing poll_votes row. */
export async function castRankedVote(
  pollId: string,
  ranking: string[],
  userId: string,
  weight = 1,
): Promise<CastVoteResult> {
  await ensureFanOauthSchema();
  await ensurePollSchema();
  const weightUnits = weight >= 5 ? 5 : 4;
  const transaction=await withTransaction(async(client)=>{
    const inserted = await client.query(
    `WITH eligible_poll AS (
       SELECT p.* FROM polls p
        WHERE p.id=$1
          AND p.kind='ranked'
          AND p.status='open'
          AND (p.passport_event_id IS NULL OR p.lifecycle_state='live')
          AND (p.opens_at IS NULL OR p.opens_at<=now())
          AND (p.closes_at IS NULL OR p.closes_at>now())
          AND (p.passport_audience<>'live_attendees' OR EXISTS(
            SELECT 1 FROM passport_event_presence ep WHERE ep.event_id=p.passport_event_id AND ep.user_id=$3 AND ep.state IN('eligible','verified')
          ))
          AND (p.passport_audience<>'members' OR EXISTS(
            SELECT 1 FROM fan_users fu WHERE fu.id=$3 AND fu.email_verified
          ))
          AND NOT EXISTS(SELECT 1 FROM passport_channel_controls c WHERE c.channel_slug=p.channel_slug
            AND (c.scope_key='*' OR c.scope_key=p.passport_event_id::text) AND c.polls_frozen)
        FOR SHARE
     )
     INSERT INTO poll_votes (poll_id, option_id, user_id, weight, ranking)
     SELECT p.id, $2::uuid, $3, $4, $5::uuid[]
       FROM eligible_poll p
      WHERE CARDINALITY($5::uuid[]) >= 2
        AND CARDINALITY($5::uuid[]) = (
          SELECT COUNT(*) FROM poll_options WHERE poll_id = p.id
        )
        AND CARDINALITY($5::uuid[]) = (
          SELECT COUNT(DISTINCT option_id)
            FROM UNNEST($5::uuid[]) AS ranked(option_id)
           WHERE option_id IN (SELECT id FROM poll_options WHERE poll_id = p.id)
        )
     ON CONFLICT (poll_id, user_id) DO NOTHING`,
    [pollId, ranking[0] ?? null, userId, weightUnits, ranking],
    );
    if((inserted.rowCount ?? 0)===0)return{inserted:false,awarded:false};
    const channel=(await client.query<{channel_slug:string|null}>(`SELECT channel_slug FROM polls WHERE id=$1`,[pollId])).rows[0]?.channel_slug ?? null;
    const points=await awardPointsInTransaction(client,userId,POINTS.poll_vote,"poll_vote","poll",pollId,channel);
    return{inserted:true,awarded:points.newlyAwarded};
  });
  if (transaction.inserted) return { ok: true, awarded: transaction.awarded };

  const state = await query<{
    exists: boolean;
    open: boolean;
    already_voted: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM polls WHERE id = $1 AND kind = 'ranked') AS exists,
       EXISTS(SELECT 1 FROM polls WHERE id = $1 AND kind = 'ranked'
         AND status = 'open'
         AND (passport_event_id IS NULL OR lifecycle_state='live')
         AND (passport_audience<>'live_attendees' OR EXISTS(
           SELECT 1 FROM passport_event_presence ep WHERE ep.event_id=polls.passport_event_id AND ep.user_id=$2 AND ep.state IN('eligible','verified')
         ))
         AND (passport_audience<>'members' OR EXISTS(
           SELECT 1 FROM fan_users fu WHERE fu.id=$2 AND fu.email_verified
         ))
         AND NOT EXISTS(SELECT 1 FROM passport_channel_controls c WHERE c.channel_slug=polls.channel_slug
           AND (c.scope_key='*' OR c.scope_key=polls.passport_event_id::text) AND c.polls_frozen)
         AND (opens_at IS NULL OR opens_at <= now())
         AND (closes_at IS NULL OR closes_at > now())) AS open,
       EXISTS(SELECT 1 FROM poll_votes WHERE poll_id = $1 AND user_id = $2) AS already_voted`,
    [pollId, userId],
  );
  const row = state.rows[0];
  if (!row?.exists) return { ok: false, reason: "not_found" };
  if (row.already_voted) return { ok: false, reason: "already_voted" };
  if (!row.open) return { ok: false, reason: "closed" };
  return { ok: false, reason: "bad_option" };
}

// =====================================================================
// Clip upvotes + leaderboard (Feature 3)
// =====================================================================

export type ClipVoteToggle = { voted: boolean; count: number; firstVote: boolean };

/**
 * Toggle a fan's upvote on a clip. If a row exists -> delete (un-upvote);
 * else insert. Returns the new state + count + whether this was the user's
 * first-ever upvote of this clip (so points are awarded once via the ledger
 * guard upstream).
 */
export async function toggleClipVote(
  clipId: string,
  userId: string,
): Promise<ClipVoteToggle | null> {
  return withTransaction(async(client)=>{
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`clip-vote:${clipId}:${userId}`]);
    const exists = await client.query(`SELECT 1 FROM clips WHERE id=$1 FOR SHARE`,[clipId]);
    if(exists.rows.length===0)return null;
    const had=await client.query(`SELECT 1 FROM clip_votes WHERE clip_id=$1 AND user_id=$2 FOR UPDATE`,[clipId,userId]);
    let voted:boolean;
    let firstVote=false;
    if(had.rows.length>0){
      await client.query(`DELETE FROM clip_votes WHERE clip_id=$1 AND user_id=$2`,[clipId,userId]);
      voted=false;
    }else{
      const inserted=await client.query(`INSERT INTO clip_votes(clip_id,user_id) VALUES($1,$2)
        ON CONFLICT(clip_id,user_id) DO NOTHING RETURNING clip_id`,[clipId,userId]);
      voted=(inserted.rowCount ?? 0)>0;
      firstVote=voted;
      if(voted)await awardPointsInTransaction(client,userId,POINTS.clip_upvote,"clip_upvote","clip",clipId);
    }
    const c=await client.query<{count:string}>(`SELECT COUNT(*)::text AS count FROM clip_votes WHERE clip_id=$1`,[clipId]);
    return{voted,count:Number(c.rows[0]?.count ?? 0),firstVote};
  });
}

export type ClipVoteHydration = {
  counts: Record<string, number>;
  mine: string[];
};

/** Vote counts for a set of clip ids + which the user has upvoted. */
export async function getClipVotes(
  clipIds: string[],
  userId: string | null,
): Promise<ClipVoteHydration> {
  if (clipIds.length === 0) return { counts: {}, mine: [] };
  const counts: Record<string, number> = {};
  const cr = await query<{ clip_id: string; count: string }>(
    `SELECT clip_id::text, COUNT(*)::text AS count FROM clip_votes
      WHERE clip_id = ANY($1::uuid[])
      GROUP BY clip_id`,
    [clipIds],
  );
  for (const row of cr.rows) counts[row.clip_id] = Number(row.count);

  let mine: string[] = [];
  if (userId) {
    const mr = await query<{ clip_id: string }>(
      `SELECT clip_id::text FROM clip_votes
        WHERE user_id = $1 AND clip_id = ANY($2::uuid[])`,
      [userId, clipIds],
    );
    mine = mr.rows.map((r) => r.clip_id);
  }
  return { counts, mine };
}

export type LeaderboardClip = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  url: string;
  votes: number;
};

/** Top clips by upvotes within a window (days). Defaults to a 7-day window. */
export async function getClipLeaderboard(
  windowDays = 7,
  limit = 10,
): Promise<LeaderboardClip[]> {
  const r = await query<{
    id: string;
    title: string;
    thumbnail_url: string | null;
    url: string;
    votes: string;
  }>(
    `SELECT c.id::text, c.title, c.thumbnail_url, c.url,
            COUNT(cv.user_id)::text AS votes
       FROM clip_votes cv
       JOIN clips c ON c.id = cv.clip_id
      WHERE cv.created_at >= now() - ($1 || ' days')::interval
      GROUP BY c.id
      ORDER BY COUNT(cv.user_id) DESC, c.published_at DESC NULLS LAST
      LIMIT $2`,
    [String(windowDays), limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    url: row.url,
    votes: Number(row.votes),
  }));
}

// =====================================================================
// Notification preferences (Feature 5 — storage only)
// =====================================================================

export type NotificationPref = {
  scope: string;
  liveOptIn: boolean;
  minLiveMinutes: number;
};

export async function getNotificationPrefs(
  userId: string,
): Promise<NotificationPref[]> {
  const r = await query<{
    scope: string;
    live_opt_in: boolean;
    min_live_minutes: number;
  }>(
    `SELECT scope, live_opt_in, min_live_minutes
       FROM notification_prefs WHERE user_id = $1 ORDER BY scope`,
    [userId],
  );
  return r.rows.map((row) => ({
    scope: row.scope,
    liveOptIn: row.live_opt_in,
    minLiveMinutes: row.min_live_minutes,
  }));
}

export async function upsertNotificationPref(
  userId: string,
  scope: string,
  liveOptIn: boolean,
  minLiveMinutes: number,
): Promise<void> {
  await query(
    `INSERT INTO notification_prefs (user_id, scope, live_opt_in, min_live_minutes, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, scope) DO UPDATE
       SET live_opt_in = EXCLUDED.live_opt_in,
           min_live_minutes = EXCLUDED.min_live_minutes,
           updated_at = now()`,
    [userId, scope, liveOptIn, minLiveMinutes],
  );
}

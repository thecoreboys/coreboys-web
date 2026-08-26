import "server-only";

import { query, withTransaction } from "@/lib/db";
import { getFanUserById } from "@/lib/fan-users";
import { moderateText } from "@/lib/moderation";
import { listConnections } from "@/lib/oauth/connections";
import { listLoyalty, setLoyalty } from "@/lib/oauth/loyalty";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { setNotificationChannelPreference } from "@/lib/notification-preferences";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import {
  FANZONE_COMMUNITIES,
  FANZONE_COMMUNITIES_BY_KEY,
  communityKeyForMember,
  loyaltySubjectForCommunity,
  type FanzoneCommunityKey,
} from "@/lib/fanzone-community-config";
import type {
  CommunityCalendarItem,
  CommunityIdea,
  CommunityQuestion,
  CommunityStaffContent,
  CommunityViewerState,
} from "@/lib/fanzone-community-types";

let schemaReady: Promise<void> | null = null;

/** Runtime mirror of migration 018 so a fresh preview does not fail before deploy migrations run. */
export async function ensureFanzoneCommunitiesSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fanzone_community_memberships (
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        joined_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, community_key)
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_memberships_key_idx
        ON fanzone_community_memberships (community_key, joined_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_preferences (
        user_id text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
        selected_community text NOT NULL DEFAULT 'core'
          CHECK (selected_community IN ('core','flock','stable','thugs','m3','nms','slg')),
        favorite_communities text[] NOT NULL DEFAULT '{}',
        alert_live boolean NOT NULL DEFAULT false,
        alert_updates boolean NOT NULL DEFAULT false,
        weekly_digest boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS fanzone_community_subscriptions (
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        alert_live boolean NOT NULL DEFAULT false,
        alert_updates boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id,community_key)
      );

      CREATE TABLE IF NOT EXISTS fanzone_community_questions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
        author_display text NOT NULL,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','answered','denied','removed')),
        moderation_note text,
        answer text,
        answered_by text,
        answered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_questions_public_idx
        ON fanzone_community_questions (community_key, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_ideas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
        author_display text NOT NULL,
        category text NOT NULL CHECK (category IN ('content','event','site','community','other')),
        title text NOT NULL,
        problem text NOT NULL,
        proposal text NOT NULL,
        status text NOT NULL DEFAULT 'under_review'
          CHECK (status IN ('under_review','planned','shipped','declined','removed')),
        moderation_state text NOT NULL DEFAULT 'pending'
          CHECK (moderation_state IN ('pending','approved','denied','removed')),
        moderation_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_ideas_public_idx
        ON fanzone_community_ideas (community_key, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_idea_votes (
        idea_id uuid NOT NULL REFERENCES fanzone_community_ideas(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (idea_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS fanzone_community_content (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        kind text NOT NULL CHECK (kind IN ('official_update','calendar','showcase')),
        title text NOT NULL,
        body text,
        href text,
        image_url text,
        starts_at timestamptz,
        ends_at timestamptz,
        published boolean NOT NULL DEFAULT false,
        published_at timestamptz,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_content_public_idx
        ON fanzone_community_content (community_key, kind, published, published_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_reports (
        id bigserial PRIMARY KEY,
        target_type text NOT NULL CHECK (target_type IN ('question','idea')),
        target_id uuid NOT NULL,
        reporter_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        reason text NOT NULL CHECK (reason IN ('privacy','copyright','unsafe','spam','harassment','other')),
        details text,
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        resolved_at timestamptz,
        resolved_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (target_type, target_id, reporter_user_id)
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_reports_open_idx
        ON fanzone_community_reports (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_appeals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type text NOT NULL CHECK (target_type IN ('question','idea')),
        target_id uuid NOT NULL,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        reason text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','denied')),
        response text,
        reviewed_at timestamptz,
        reviewed_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (target_type, target_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_appeals_pending_idx
        ON fanzone_community_appeals (status, created_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_audit (
        id bigserial PRIMARY KEY,
        target_type text NOT NULL CHECK (target_type IN ('question','idea','content','report','appeal')),
        target_id text NOT NULL,
        actor text NOT NULL,
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS fanzone_community_audit_target_idx
        ON fanzone_community_audit (target_type,target_id,created_at DESC);

      CREATE TABLE IF NOT EXISTS fanzone_community_rate_limits (
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        action text NOT NULL,
        bucket_started_at timestamptz NOT NULL DEFAULT now(),
        hits integer NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id,action)
      );
    `);
    await query(`ALTER TABLE fanzone_community_ideas
      ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'pending'`);
    await query(`ALTER TABLE fanzone_community_ideas DROP CONSTRAINT IF EXISTS fanzone_community_ideas_moderation_state_check`);
    await query(`ALTER TABLE fanzone_community_ideas ADD CONSTRAINT fanzone_community_ideas_moderation_state_check
      CHECK (moderation_state IN ('pending','approved','denied','removed'))`);
    await query(`ALTER TABLE fanzone_community_questions DROP CONSTRAINT IF EXISTS fanzone_community_questions_status_check`);
    await query(`ALTER TABLE fanzone_community_questions ADD CONSTRAINT fanzone_community_questions_status_check
      CHECK (status IN ('pending','approved','answered','denied','removed'))`);
    await query(`ALTER TABLE fanzone_community_questions ALTER COLUMN status SET DEFAULT 'pending'`);
    await query(`INSERT INTO fanzone_community_subscriptions
      (user_id,community_key,alert_live,alert_updates)
      SELECT user_id,selected_community,alert_live,alert_updates
        FROM fanzone_community_preferences
       WHERE alert_live OR alert_updates
      ON CONFLICT (user_id,community_key) DO NOTHING`);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export class CommunityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityInputError";
  }
}

export class CommunityRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many community actions. Try again in a moment.");
    this.name = "CommunityRateLimitError";
  }
}

/** Postgres-backed fixed-window limit, shared by every app process. */
export async function consumeCommunityRateLimit(
  userId: string,
  action: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  const result = await query<{ hits: number; bucket_started_at: Date | string }>(
    `INSERT INTO fanzone_community_rate_limits (user_id,action,bucket_started_at,hits)
     VALUES ($1,$2,now(),1)
     ON CONFLICT (user_id,action) DO UPDATE SET
       hits=CASE
         WHEN fanzone_community_rate_limits.bucket_started_at <= now()-($3::int*interval '1 second') THEN 1
         ELSE fanzone_community_rate_limits.hits+1
       END,
       bucket_started_at=CASE
         WHEN fanzone_community_rate_limits.bucket_started_at <= now()-($3::int*interval '1 second') THEN now()
         ELSE fanzone_community_rate_limits.bucket_started_at
       END
     RETURNING hits,bucket_started_at`,
    [userId, action, windowSeconds],
  );
  const row = result.rows[0];
  if ((row?.hits ?? 0) <= maximum) return;
  const elapsed = Math.max(0, (Date.now() - new Date(row!.bucket_started_at).getTime()) / 1000);
  throw new CommunityRateLimitError(Math.max(1, Math.ceil(windowSeconds - elapsed)));
}

type PreferenceRow = {
  selected_community: FanzoneCommunityKey;
  favorite_communities: string[];
  alert_live: boolean;
  alert_updates: boolean;
  weekly_digest: boolean;
};

export async function getCommunityMembershipCounts(): Promise<Record<FanzoneCommunityKey, number>> {
  await ensureFanzoneCommunitiesSchema();
  const result = await query<{ community_key: FanzoneCommunityKey; count: string }>(
    `SELECT community_key, COUNT(*)::text AS count
       FROM fanzone_community_memberships GROUP BY community_key`,
  );
  const counts = Object.fromEntries(FANZONE_COMMUNITIES.map((community) => [community.key, 0])) as Record<
    FanzoneCommunityKey,
    number
  >;
  for (const row of result.rows) counts[row.community_key] = Number(row.count);
  return counts;
}

export async function getCommunityViewerState(
  userId: string | null,
  requestedKey: FanzoneCommunityKey | null,
): Promise<CommunityViewerState> {
  if (!userId) {
    return {
      signedIn: false,
      selectedKey: requestedKey ?? "core",
      joinedKeys: [],
      favoriteKeys: [],
      recommendedKeys: FANZONE_COMMUNITIES.map((community) => community.key),
      alerts: { live: false, updates: false, weeklyDigest: false },
      x: {
        connected: false,
        username: null,
        connectionStatus: "not_connected",
        lastSyncAt: null,
        officialFollow: "unknown",
        followCheckedAt: null,
        communityAttested: false,
        attestedAt: null,
        verified: false,
      },
    };
  }

  await Promise.all([ensureFanzoneCommunitiesSchema(), ensureFanOauthSchema()]);
  const [preferenceResult, subscriptionResult, membershipResult, userResult, watchResult, connections, loyalty] =
    await Promise.all([
      query<PreferenceRow>(
        `SELECT selected_community, favorite_communities, alert_live, alert_updates, weekly_digest
           FROM fanzone_community_preferences WHERE user_id=$1`,
        [userId],
      ),
      query<{ community_key: FanzoneCommunityKey; alert_live: boolean; alert_updates: boolean }>(
        `SELECT community_key,alert_live,alert_updates
           FROM fanzone_community_subscriptions WHERE user_id=$1`,
        [userId],
      ),
      query<{ community_key: FanzoneCommunityKey }>(
        `SELECT community_key FROM fanzone_community_memberships WHERE user_id=$1 ORDER BY joined_at`,
        [userId],
      ),
      query<{ favorite_member: string | null }>(
        `SELECT favorite_member FROM fan_users WHERE id=$1`,
        [userId],
      ),
      query<{ subject: string; activity: string }>(
        `SELECT subject, COUNT(*)::text AS activity
           FROM fan_site_events
          WHERE user_id=$1 AND subject IS NOT NULL
            AND created_at > now() - interval '90 days'
            AND kind IN ('chat_open','heartbeat','video_play','live_embed','vod_play')
          GROUP BY subject ORDER BY COUNT(*) DESC`,
        [userId],
      ),
      listConnections(userId),
      listLoyalty(userId),
    ]);

  const preference = preferenceResult.rows[0];
  const joinedKeys = membershipResult.rows.map((row) => row.community_key);
  const favoriteKeys = (preference?.favorite_communities ?? []).filter((key): key is FanzoneCommunityKey =>
    Object.hasOwn(FANZONE_COMMUNITIES_BY_KEY, key),
  );
  const accountFavorite = communityKeyForMember(userResult.rows[0]?.favorite_member ?? null);
  const watchOrder = watchResult.rows
    .map((row) => communityKeyForMember(row.subject))
    .filter((key, index, values) => values.indexOf(key) === index);
  const recommendedKeys = [
    ...favoriteKeys,
    accountFavorite,
    ...watchOrder,
    ...joinedKeys,
    ...FANZONE_COMMUNITIES.map((community) => community.key),
  ].filter((key, index, values) => values.indexOf(key) === index);

  const selectedKey = requestedKey ?? preference?.selected_community ?? recommendedKeys[0] ?? "core";
  const subscription = subscriptionResult.rows.find((row) => row.community_key === selectedKey);
  const xConnection = connections.find((connection) => connection.provider === "x") ?? null;
  const subject = loyaltySubjectForCommunity(selectedKey);
  const follow = loyalty.find(
    (fact) => fact.platform === "x" && fact.subject === subject && fact.kind === "follow",
  );
  const attestation = loyalty.find(
    (fact) => fact.platform === "x" && fact.subject === subject && fact.kind === "community",
  );

  return {
    signedIn: true,
    selectedKey,
    joinedKeys,
    favoriteKeys,
    recommendedKeys,
    alerts: {
      live: subscription?.alert_live ?? false,
      updates: subscription?.alert_updates ?? false,
      weeklyDigest: preference?.weekly_digest ?? false,
    },
    x: {
      connected: xConnection?.status === "active",
      username: xConnection?.username ?? null,
      connectionStatus: xConnection?.status ?? "not_connected",
      lastSyncAt: xConnection?.lastSyncAt ?? null,
      officialFollow: follow ? (follow.value ? "following" : "not_following") : "unknown",
      followCheckedAt: follow?.updatedAt ?? null,
      communityAttested: Boolean(attestation?.value),
      attestedAt: attestation?.value ? attestation.updatedAt : null,
      verified: false,
    },
  };
}

export async function setCommunityMembership(
  userId: string,
  communityKey: FanzoneCommunityKey,
  joined: boolean,
): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  if (joined) {
    await query(
      `INSERT INTO fanzone_community_memberships (user_id, community_key)
       VALUES ($1,$2) ON CONFLICT (user_id,community_key) DO UPDATE SET updated_at=now()`,
      [userId, communityKey],
    );
  } else {
    await query(
      `DELETE FROM fanzone_community_memberships WHERE user_id=$1 AND community_key=$2`,
      [userId, communityKey],
    );
  }
}

export async function setCommunityPreferences(
  userId: string,
  update: {
    selectedKey?: FanzoneCommunityKey;
    favoriteKeys?: FanzoneCommunityKey[];
    alertCommunityKey?: FanzoneCommunityKey;
    liveAlerts?: boolean;
    updateAlerts?: boolean;
    weeklyDigest?: boolean;
  },
): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  await query(
    `INSERT INTO fanzone_community_preferences
       (user_id,selected_community,favorite_communities,alert_live,alert_updates,weekly_digest)
     VALUES ($1,COALESCE($2,'core'),COALESCE($3::text[],'{}'),COALESCE($4,false),COALESCE($5,false),COALESCE($6,false))
     ON CONFLICT (user_id) DO UPDATE SET
       selected_community=COALESCE($2,fanzone_community_preferences.selected_community),
       favorite_communities=COALESCE($3::text[],fanzone_community_preferences.favorite_communities),
       alert_live=COALESCE($4,fanzone_community_preferences.alert_live),
       alert_updates=COALESCE($5,fanzone_community_preferences.alert_updates),
       weekly_digest=COALESCE($6,fanzone_community_preferences.weekly_digest),
       updated_at=now()`,
    [
      userId,
      update.selectedKey ?? null,
      update.favoriteKeys ?? null,
      update.liveAlerts ?? null,
      update.updateAlerts ?? null,
      update.weeklyDigest ?? null,
    ],
  );
  if (
    update.alertCommunityKey &&
    (update.liveAlerts !== undefined || update.updateAlerts !== undefined)
  ) {
    await query(
      `INSERT INTO fanzone_community_subscriptions
         (user_id,community_key,alert_live,alert_updates)
       VALUES ($1,$2,COALESCE($3,false),COALESCE($4,false))
       ON CONFLICT (user_id,community_key) DO UPDATE SET
         alert_live=COALESCE($3,fanzone_community_subscriptions.alert_live),
         alert_updates=COALESCE($4,fanzone_community_subscriptions.alert_updates),
         updated_at=now()`,
      [userId, update.alertCommunityKey, update.liveAlerts ?? null, update.updateAlerts ?? null],
    );
  }
  const updates: Promise<void>[] = [];
  if (update.liveAlerts !== undefined) {
    updates.push(
      query<{ enabled: boolean }>(
        `SELECT COALESCE(BOOL_OR(alert_live),false) AS enabled
           FROM fanzone_community_subscriptions WHERE user_id=$1`,
        [userId],
      ).then((result) => setNotificationChannelPreference(userId, "live", "email", result.rows[0]?.enabled ?? false)),
    );
  }
  if (update.updateAlerts !== undefined) {
    updates.push(
      query<{ enabled: boolean }>(
        `SELECT COALESCE(BOOL_OR(alert_updates),false) AS enabled
           FROM fanzone_community_subscriptions WHERE user_id=$1`,
        [userId],
      ).then((result) => setNotificationChannelPreference(userId, "community", "email", result.rows[0]?.enabled ?? false)),
    );
  }
  if (update.weeklyDigest !== undefined) {
    updates.push(
      setNotificationChannelPreference(userId, "weekly_digest", "email", update.weeklyDigest),
    );
  }
  await Promise.all(updates);
}

export async function setCommunityXAttestation(
  userId: string,
  communityKey: FanzoneCommunityKey,
  attested: boolean,
): Promise<void> {
  await setLoyalty({
    userId,
    platform: "x",
    subject: loyaltySubjectForCommunity(communityKey),
    kind: "community",
    value: attested,
    meta: {
      method: "self-attest",
      verified: false,
      communityKey,
      disclosure: "X Communities membership API unavailable or not configured",
    },
  });
}

type QuestionRow = {
  id: string;
  community_key: FanzoneCommunityKey;
  user_id: string | null;
  author_display: string;
  body: string;
  status: CommunityQuestion["status"];
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

function mapQuestion(row: QuestionRow, userId: string | null): CommunityQuestion {
  return {
    id: row.id,
    communityKey: row.community_key,
    author: row.author_display,
    body: row.body,
    status: row.status,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    mine: Boolean(userId && row.user_id === userId),
  };
}

export async function listCommunityQuestions(
  communityKey: FanzoneCommunityKey,
  userId: string | null,
  limit = 20,
): Promise<CommunityQuestion[]> {
  await ensureFanzoneCommunitiesSchema();
  const result = await query<QuestionRow>(
    `SELECT id::text,community_key,user_id,author_display,body,status,answer,
            answered_at::text,created_at::text
       FROM fanzone_community_questions
      WHERE community_key=$1
        AND (status IN ('approved','answered') OR ($2::text IS NOT NULL AND user_id=$2))
      ORDER BY CASE WHEN status='answered' THEN 0 ELSE 1 END, created_at DESC
      LIMIT $3`,
    [communityKey, userId, Math.min(50, Math.max(1, limit))],
  );
  return result.rows.map((row) => mapQuestion(row, userId));
}

export async function createCommunityQuestion(
  userId: string,
  communityKey: FanzoneCommunityKey,
  body: string,
): Promise<CommunityQuestion> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "question.create", 5, 60 * 60);
  const moderation = await moderateText(body);
  if (!moderation.ok) throw new CommunityInputError(moderation.reason ?? "That question cannot be posted.");
  const user = await getFanUserById(userId);
  if (!user) throw new CommunityInputError("Account unavailable.");
  const result = await query<QuestionRow>(
    `INSERT INTO fanzone_community_questions
       (community_key,user_id,author_display,body,status,moderation_note)
     VALUES ($1,$2,$3,$4,'pending','automated text screen passed; staff review required')
     RETURNING id::text,community_key,user_id,author_display,body,status,answer,
               answered_at::text,created_at::text`,
    [communityKey, userId, user.displayName, body.trim()],
  );
  return mapQuestion(result.rows[0]!, userId);
}

type IdeaRow = {
  id: string;
  community_key: FanzoneCommunityKey;
  user_id: string | null;
  author_display: string;
  category: CommunityIdea["category"];
  title: string;
  problem: string;
  proposal: string;
  status: CommunityIdea["status"];
  moderation_state: CommunityIdea["moderationState"];
  votes: string;
  voted: boolean;
  created_at: string;
};

function mapIdea(row: IdeaRow, userId: string | null): CommunityIdea {
  return {
    id: row.id,
    communityKey: row.community_key,
    author: row.author_display,
    category: row.category,
    title: row.title,
    problem: row.problem,
    proposal: row.proposal,
    status: row.status,
    moderationState: row.moderation_state,
    votes: Number(row.votes),
    voted: row.voted,
    mine: Boolean(userId && row.user_id === userId),
    createdAt: row.created_at,
  };
}

const IDEA_SELECT = `SELECT ideas.id::text,ideas.community_key,ideas.user_id,ideas.author_display,
  ideas.category,ideas.title,ideas.problem,ideas.proposal,ideas.status,ideas.moderation_state,
  ideas.created_at::text,
  COUNT(votes.user_id)::text AS votes,
  COALESCE(BOOL_OR(votes.user_id=$2),false) AS voted
  FROM fanzone_community_ideas ideas
  LEFT JOIN fanzone_community_idea_votes votes ON votes.idea_id=ideas.id`;

export async function listCommunityIdeas(
  communityKey: FanzoneCommunityKey,
  userId: string | null,
  limit = 30,
): Promise<CommunityIdea[]> {
  await ensureFanzoneCommunitiesSchema();
  const result = await query<IdeaRow>(
    `${IDEA_SELECT}
      WHERE ideas.community_key=$1
        AND (
          (ideas.moderation_state='approved' AND ideas.status<>'removed')
          OR ($2::text IS NOT NULL AND ideas.user_id=$2)
        )
      GROUP BY ideas.id
      ORDER BY COUNT(votes.user_id) DESC, ideas.created_at DESC
      LIMIT $3`,
    [communityKey, userId, Math.min(60, Math.max(1, limit))],
  );
  return result.rows.map((row) => mapIdea(row, userId));
}

export async function createCommunityIdea(
  userId: string,
  input: {
    communityKey: FanzoneCommunityKey;
    category: CommunityIdea["category"];
    title: string;
    problem: string;
    proposal: string;
  },
): Promise<CommunityIdea> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "idea.create", 3, 24 * 60 * 60);
  const moderation = await moderateText(`${input.title}\n${input.problem}\n${input.proposal}`);
  if (!moderation.ok) throw new CommunityInputError(moderation.reason ?? "That idea cannot be posted.");
  const user = await getFanUserById(userId);
  if (!user) throw new CommunityInputError("Account unavailable.");
  const inserted = await query<{ id: string }>(
    `INSERT INTO fanzone_community_ideas
       (community_key,user_id,author_display,category,title,problem,proposal,moderation_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'automated text screen passed; staff review required') RETURNING id::text`,
    [
      input.communityKey,
      userId,
      user.displayName,
      input.category,
      input.title.trim(),
      input.problem.trim(),
      input.proposal.trim(),
    ],
  );
  const result = await query<IdeaRow>(
    `${IDEA_SELECT} WHERE ideas.id=$1 GROUP BY ideas.id`,
    [inserted.rows[0]!.id, userId],
  );
  return mapIdea(result.rows[0]!, userId);
}

export async function toggleCommunityIdeaVote(
  userId: string,
  ideaId: string,
): Promise<{ voted: boolean; votes: number }> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "idea.vote", 120, 60 * 60);
  return withTransaction(async (client) => {
    const idea = await client.query<{ status: string; moderation_state: string }>(
      `SELECT status,moderation_state FROM fanzone_community_ideas WHERE id=$1 FOR UPDATE`,
      [ideaId],
    );
    if (
      !idea.rows[0] ||
      idea.rows[0].status === "removed" ||
      idea.rows[0].moderation_state !== "approved"
    ) throw new CommunityInputError("Idea is not open for voting.");
    const deleted = await client.query(
      `DELETE FROM fanzone_community_idea_votes WHERE idea_id=$1 AND user_id=$2`,
      [ideaId, userId],
    );
    let voted = false;
    if ((deleted.rowCount ?? 0) === 0) {
      await client.query(
        `INSERT INTO fanzone_community_idea_votes (idea_id,user_id) VALUES ($1,$2)`,
        [ideaId, userId],
      );
      voted = true;
    }
    const count = await client.query<{ votes: string }>(
      `SELECT COUNT(*)::text AS votes FROM fanzone_community_idea_votes WHERE idea_id=$1`,
      [ideaId],
    );
    return { voted, votes: Number(count.rows[0]?.votes ?? 0) };
  });
}

export async function removeOwnCommunityItem(
  userId: string,
  targetType: "question" | "idea",
  targetId: string,
): Promise<boolean> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "item.remove", 20, 60 * 60);
  const table = targetType === "question" ? "fanzone_community_questions" : "fanzone_community_ideas";
  const result = targetType === "question"
    ? await query(`UPDATE ${table} SET status='removed',updated_at=now() WHERE id=$1 AND user_id=$2`, [targetId, userId])
    : await query(`UPDATE ${table} SET status='removed',moderation_state='removed',updated_at=now() WHERE id=$1 AND user_id=$2`, [targetId, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function reportCommunityItem(
  userId: string,
  input: {
    targetType: "question" | "idea";
    targetId: string;
    reason: "privacy" | "copyright" | "unsafe" | "spam" | "harassment" | "other";
    details?: string;
  },
): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "item.report", 10, 24 * 60 * 60);
  const table = input.targetType === "question" ? "fanzone_community_questions" : "fanzone_community_ideas";
  const exists = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM ${table} WHERE id=$1 AND status<>'removed') AS exists`,
    [input.targetId],
  );
  if (!exists.rows[0]?.exists) throw new CommunityInputError("Item not found.");
  await query(
    `INSERT INTO fanzone_community_reports
       (target_type,target_id,reporter_user_id,reason,details)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (target_type,target_id,reporter_user_id) DO UPDATE SET
       reason=EXCLUDED.reason,details=EXCLUDED.details,status='open',created_at=now(),
       resolved_at=NULL,resolved_by=NULL`,
    [input.targetType, input.targetId, userId, input.reason, input.details?.trim() || null],
  );
}

export async function appealCommunityRemoval(
  userId: string,
  input: { targetType: "question" | "idea"; targetId: string; reason: string },
): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  await consumeCommunityRateLimit(userId, "item.appeal", 3, 24 * 60 * 60);
  const owned = await query<{ owned: boolean }>(
    input.targetType === "question"
      ? `SELECT EXISTS(SELECT 1 FROM fanzone_community_questions
           WHERE id=$1 AND user_id=$2 AND status IN ('denied','removed')) AS owned`
      : `SELECT EXISTS(SELECT 1 FROM fanzone_community_ideas
           WHERE id=$1 AND user_id=$2
             AND (status='removed' OR moderation_state IN ('denied','removed'))) AS owned`,
    [input.targetId, userId],
  );
  if (!owned.rows[0]?.owned) throw new CommunityInputError("Only a denied or removed item you created can be appealed.");
  await query(
    `INSERT INTO fanzone_community_appeals (target_type,target_id,user_id,reason)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (target_type,target_id,user_id) DO UPDATE SET
       reason=EXCLUDED.reason,status='pending',response=NULL,reviewed_at=NULL,reviewed_by=NULL,updated_at=now()`,
    [input.targetType, input.targetId, userId, input.reason.trim()],
  );
}

type ContentRow = {
  id: string;
  community_key: FanzoneCommunityKey;
  kind: "official_update" | "calendar" | "showcase";
  title: string;
  body: string | null;
  href: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string;
};

export async function listPublishedCommunityContent(communityKey: FanzoneCommunityKey): Promise<{
  calendar: CommunityCalendarItem[];
  staffContent: CommunityStaffContent[];
}> {
  await ensureFanzoneCommunitiesSchema();
  const result = await query<ContentRow>(
    `SELECT id::text,community_key,kind,title,body,href,image_url,starts_at::text,
            ends_at::text,COALESCE(published_at,created_at)::text AS published_at
       FROM fanzone_community_content
      WHERE published=true AND community_key IN ('core',$1)
      ORDER BY COALESCE(starts_at,published_at,created_at) DESC LIMIT 60`,
    [communityKey],
  );
  const calendar: CommunityCalendarItem[] = result.rows
    .filter((row) => row.kind === "calendar" && row.starts_at)
    .map((row) => ({
      id: row.id,
      communityKey: row.community_key,
      title: row.title,
      body: row.body,
      href: safeHttpUrl(row.href),
      imageUrl: safeHttpUrl(row.image_url),
      startsAt: row.starts_at!,
      endsAt: row.ends_at,
    }));
  const staffContent: CommunityStaffContent[] = result.rows
    .filter((row) => row.kind !== "calendar")
    .map((row) => ({
      id: row.id,
      communityKey: row.community_key,
      kind: row.kind as "official_update" | "showcase",
      title: row.title,
      body: row.body,
      href: safeHttpUrl(row.href),
      imageUrl: safeHttpUrl(row.image_url),
      publishedAt: row.published_at,
    }));
  return { calendar, staffContent };
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getCommunityModerationDashboard() {
  await ensureFanzoneCommunitiesSchema();
  const [questions, ideas, reports, appeals, content] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT q.id::text,q.community_key,q.author_display,q.body,q.status,q.created_at,u.email
         FROM fanzone_community_questions q
         LEFT JOIN fan_users u ON u.id=q.user_id
        WHERE q.status='pending' ORDER BY q.created_at ASC LIMIT 200`,
    ),
    query<Record<string, unknown>>(
      `SELECT i.id::text,i.community_key,i.author_display,i.category,i.title,i.problem,i.proposal,
              i.status,i.moderation_state,i.created_at,u.email
         FROM fanzone_community_ideas i
         LEFT JOIN fan_users u ON u.id=i.user_id
        WHERE i.moderation_state='pending' ORDER BY i.created_at ASC LIMIT 200`,
    ),
    query<Record<string, unknown>>(
      `SELECT r.id,r.target_type,r.target_id::text,r.reason,r.details,r.created_at,
              u.display_name AS reporter_name,u.email AS reporter_email
         FROM fanzone_community_reports r
         JOIN fan_users u ON u.id=r.reporter_user_id
        WHERE r.status='open' ORDER BY r.created_at ASC LIMIT 200`,
    ),
    query<Record<string, unknown>>(
      `SELECT a.id::text,a.target_type,a.target_id::text,a.reason,a.created_at,
              u.display_name,u.email
         FROM fanzone_community_appeals a
         JOIN fan_users u ON u.id=a.user_id
        WHERE a.status='pending' ORDER BY a.created_at ASC LIMIT 200`,
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,community_key,kind,title,body,href,image_url,starts_at,ends_at,
              published,published_at,created_by,created_at,updated_at
         FROM fanzone_community_content ORDER BY created_at DESC LIMIT 200`,
    ),
  ]);
  return {
    questions: questions.rows,
    ideas: ideas.rows,
    reports: reports.rows,
    appeals: appeals.rows,
    content: content.rows,
  };
}

export async function moderateCommunityItem(
  actor: string,
  input:
    | {
        targetType: "question";
        targetId: string;
        action: "approve" | "deny" | "remove" | "answer";
        note?: string;
        answer?: string;
      }
    | {
        targetType: "idea";
        targetId: string;
        action: "approve" | "deny" | "remove" | "set_status";
        note?: string;
        status?: CommunityIdea["status"];
      },
): Promise<boolean> {
  await ensureFanzoneCommunitiesSchema();
  return withTransaction(async (client) => {
    let result;
    if (input.targetType === "question") {
      if (input.action === "answer") {
        if (!input.answer?.trim()) throw new CommunityInputError("An answer is required.");
        result = await client.query(
          `UPDATE fanzone_community_questions SET
             status='answered',answer=$2,answered_by=$3,answered_at=now(),
             moderation_note=$4,updated_at=now()
           WHERE id=$1`,
          [input.targetId, input.answer.trim(), actor, input.note?.trim() || null],
        );
      } else {
        const status = input.action === "approve" ? "approved" : input.action === "deny" ? "denied" : "removed";
        result = await client.query(
          `UPDATE fanzone_community_questions SET status=$2,moderation_note=$3,updated_at=now()
            WHERE id=$1`,
          [input.targetId, status, input.note?.trim() || null],
        );
      }
    } else if (input.action === "set_status") {
      if (!input.status || input.status === "removed") throw new CommunityInputError("A public idea status is required.");
      result = await client.query(
        `UPDATE fanzone_community_ideas SET status=$2,updated_at=now()
          WHERE id=$1 AND moderation_state='approved'`,
        [input.targetId, input.status],
      );
    } else {
      const moderationState = input.action === "approve" ? "approved" : input.action === "deny" ? "denied" : "removed";
      result = await client.query(
        `UPDATE fanzone_community_ideas SET
           moderation_state=$2,
           status=CASE WHEN $2='removed' THEN 'removed' ELSE status END,
           moderation_note=$3,updated_at=now()
         WHERE id=$1`,
        [input.targetId, moderationState, input.note?.trim() || null],
      );
    }
    if ((result.rowCount ?? 0) === 0) return false;
    await client.query(
      `INSERT INTO fanzone_community_audit (target_type,target_id,actor,action,details)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [input.targetType, input.targetId, actor, input.action, JSON.stringify(input)],
    );
    return true;
  });
}

export async function resolveCommunityReport(
  actor: string,
  reportId: number,
  removeTarget: boolean,
): Promise<boolean> {
  await ensureFanzoneCommunitiesSchema();
  return withTransaction(async (client) => {
    const report = await client.query<{ target_type: "question" | "idea"; target_id: string }>(
      `UPDATE fanzone_community_reports SET status='resolved',resolved_at=now(),resolved_by=$2
        WHERE id=$1 AND status='open' RETURNING target_type,target_id::text`,
      [reportId, actor],
    );
    const row = report.rows[0];
    if (!row) return false;
    if (removeTarget) {
      if (row.target_type === "question") {
        await client.query(`UPDATE fanzone_community_questions SET status='removed',updated_at=now() WHERE id=$1`, [row.target_id]);
      } else {
        await client.query(`UPDATE fanzone_community_ideas SET status='removed',moderation_state='removed',updated_at=now() WHERE id=$1`, [row.target_id]);
      }
    }
    await client.query(
      `INSERT INTO fanzone_community_audit (target_type,target_id,actor,action,details)
       VALUES ('report',$1,$2,'resolve',$3::jsonb)`,
      [String(reportId), actor, JSON.stringify({ removeTarget, ...row })],
    );
    return true;
  });
}

export async function reviewCommunityAppeal(
  actor: string,
  appealId: string,
  decision: "upheld" | "denied",
  response: string,
): Promise<boolean> {
  await ensureFanzoneCommunitiesSchema();
  return withTransaction(async (client) => {
    const appeal = await client.query<{ target_type: "question" | "idea"; target_id: string }>(
      `UPDATE fanzone_community_appeals SET status=$2,response=$3,reviewed_at=now(),
              reviewed_by=$4,updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING target_type,target_id::text`,
      [appealId, decision, response.trim(), actor],
    );
    const row = appeal.rows[0];
    if (!row) return false;
    if (decision === "upheld") {
      if (row.target_type === "question") {
        await client.query(`UPDATE fanzone_community_questions SET status='approved',updated_at=now() WHERE id=$1`, [row.target_id]);
      } else {
        await client.query(`UPDATE fanzone_community_ideas SET status='under_review',moderation_state='approved',updated_at=now() WHERE id=$1`, [row.target_id]);
      }
    }
    await client.query(
      `INSERT INTO fanzone_community_audit (target_type,target_id,actor,action,details)
       VALUES ('appeal',$1,$2,$3,$4::jsonb)`,
      [appealId, actor, decision, JSON.stringify({ response: response.trim(), ...row })],
    );
    return true;
  });
}

export async function upsertCommunityContent(
  actor: string,
  input: {
    id?: string;
    communityKey: FanzoneCommunityKey;
    kind: "official_update" | "calendar" | "showcase";
    title: string;
    body?: string | null;
    href?: string | null;
    imageUrl?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    published: boolean;
  },
): Promise<string> {
  await Promise.all([ensureFanzoneCommunitiesSchema(), ensureFanzoneSchema()]);
  return withTransaction(async (client) => {
    const previous = input.id
      ? await client.query<{ published: boolean }>(
          `SELECT published FROM fanzone_community_content WHERE id=$1 FOR UPDATE`,
          [input.id],
        )
      : null;
    const wasPublished = previous?.rows[0]?.published ?? false;
    const result = input.id
      ? await client.query<{ id: string }>(
          `UPDATE fanzone_community_content SET community_key=$2,kind=$3,title=$4,body=$5,
             href=$6,image_url=$7,starts_at=$8,ends_at=$9,published=$10,
             published_at=CASE WHEN $10 AND NOT published THEN now() ELSE published_at END,
             updated_at=now()
           WHERE id=$1 RETURNING id::text`,
          [input.id,input.communityKey,input.kind,input.title.trim(),input.body?.trim()||null,
           input.href||null,input.imageUrl||null,input.startsAt||null,input.endsAt||null,input.published],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO fanzone_community_content
             (community_key,kind,title,body,href,image_url,starts_at,ends_at,published,published_at,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $9 THEN now() ELSE NULL END,$10)
           RETURNING id::text`,
          [input.communityKey,input.kind,input.title.trim(),input.body?.trim()||null,input.href||null,
           input.imageUrl||null,input.startsAt||null,input.endsAt||null,input.published,actor],
        );
    const id = result.rows[0]?.id;
    if (!id) throw new CommunityInputError("Content not found.");
    await client.query(
      `INSERT INTO fanzone_community_audit (target_type,target_id,actor,action,details)
       VALUES ('content',$1,$2,$3,$4::jsonb)`,
      [id, actor, input.id ? "update" : "create", JSON.stringify(input)],
    );
    if (input.published && !wasPublished) {
      const communityName = FANZONE_COMMUNITIES_BY_KEY[input.communityKey].name;
      await client.query(
        `INSERT INTO fan_notification_outbox (user_id,event_type,dedupe_key,payload)
         SELECT subscriptions.user_id,
                'fanzone.community_update',
                $1 || ':' || subscriptions.user_id,
                jsonb_build_object(
                  'contentId',$1,
                  'communityKey',$2,
                  'communityName',$3,
                  'title',$4,
                  'href',COALESCE($5,'/fanzone#communities')
                )
           FROM fanzone_community_subscriptions subscriptions
           JOIN fanzone_community_memberships memberships
             ON memberships.user_id=subscriptions.user_id
            AND memberships.community_key=subscriptions.community_key
          WHERE subscriptions.community_key=$2
            AND subscriptions.alert_updates=true
         ON CONFLICT (event_type,dedupe_key) DO NOTHING`,
        [id, input.communityKey, communityName, input.title.trim(), input.href || null],
      );
    }
    return id;
  });
}

export async function exportCommunityAccountData(userId: string) {
  await ensureFanzoneCommunitiesSchema();
  const [memberships, preferences, subscriptions, questions, ideas, votes, reports, appeals] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT community_key,joined_at,updated_at FROM fanzone_community_memberships WHERE user_id=$1`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT selected_community,favorite_communities,alert_live,alert_updates,weekly_digest,updated_at
         FROM fanzone_community_preferences WHERE user_id=$1`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT community_key,alert_live,alert_updates,updated_at
         FROM fanzone_community_subscriptions WHERE user_id=$1 ORDER BY community_key`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,community_key,body,status,answer,answered_at,created_at,updated_at
         FROM fanzone_community_questions WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,community_key,category,title,problem,proposal,status,created_at,updated_at
         FROM fanzone_community_ideas WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT idea_id::text,created_at FROM fanzone_community_idea_votes WHERE user_id=$1`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT id,target_type,target_id::text,reason,details,status,created_at,resolved_at
         FROM fanzone_community_reports WHERE reporter_user_id=$1 ORDER BY created_at DESC`,
      [userId],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,target_type,target_id::text,reason,status,response,reviewed_at,created_at,updated_at
         FROM fanzone_community_appeals WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId],
    ),
  ]);
  return {
    memberships: memberships.rows,
    preferences: preferences.rows[0] ?? null,
    subscriptions: subscriptions.rows,
    questions: questions.rows,
    ideas: ideas.rows,
    ideaVotes: votes.rows,
    reports: reports.rows,
    appeals: appeals.rows,
  };
}

/** Deletes FanZone community activity without deleting the broader CORE account. */
export async function deleteCommunityAccountData(userId: string): Promise<void> {
  await ensureFanzoneCommunitiesSchema();
  await ensureFanOauthSchema();
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM fanzone_community_reports WHERE reporter_user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_appeals WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_idea_votes WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_questions WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_ideas WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_memberships WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_subscriptions WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM fanzone_community_preferences WHERE user_id=$1`, [userId]);
    await client.query(
      `DELETE FROM fan_loyalty WHERE user_id=$1 AND platform='x' AND kind='community'`,
      [userId],
    );
  });
}

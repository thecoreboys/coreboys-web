import "server-only";

import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import {
  addSparksInTransaction,
  appendPassportLedger,
  awardPassportXpInTransaction,
  ensurePassportProfile,
  unlockCosmeticInTransaction,
} from "@/lib/passport/internal";
import { passportUtcWeekKey } from "@/lib/passport/policy";

export type PassportActivityInput = {
  userId: string;
  metric: string;
  amount?: number;
  channelSlug?: string | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
};

export async function enqueuePassportActivity(client:PoolClient,input:PassportActivityInput):Promise<void>{
  const amount=Math.max(1,Math.min(1_000_000,Math.floor(input.amount ?? 1)));
  await client.query(`INSERT INTO passport_activity_outbox
    (idempotency_key,user_id,metric,amount,channel_slug,source_type,source_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO NOTHING`,
    [input.idempotencyKey,input.userId,input.metric,amount,input.channelSlug ?? null,input.sourceType,input.sourceId]);
}

export async function queuePassportActivity(input:PassportActivityInput):Promise<void>{
  await withTransaction((client)=>enqueuePassportActivity(client,input));
}

export async function drainPassportActivityOutbox(filters:{userId?:string;sourceType?:string;sourceId?:string;limit?:number}={}):Promise<{delivered:number;pending:number}>{
  const limit=Math.max(1,Math.min(filters.limit ?? 50,250));
  const rows=await query<{id:string;idempotency_key:string;user_id:string;metric:string;amount:number;channel_slug:string|null;source_type:string;source_id:string}>(`SELECT id::text,idempotency_key,user_id,metric,amount,channel_slug,source_type,source_id
    FROM passport_activity_outbox WHERE state='pending' AND available_at<=now()
      AND ($1::text IS NULL OR user_id=$1) AND ($2::text IS NULL OR source_type=$2) AND ($3::text IS NULL OR source_id=$3)
    ORDER BY id LIMIT $4`,[filters.userId ?? null,filters.sourceType ?? null,filters.sourceId ?? null,limit]);
  let delivered=0;
  for(const row of rows.rows){
    try{
      await recordPassportActivity({userId:row.user_id,metric:row.metric,amount:row.amount,channelSlug:row.channel_slug,sourceType:row.source_type,sourceId:row.source_id,idempotencyKey:row.idempotency_key});
      await query(`UPDATE passport_activity_outbox SET state='delivered',attempts=attempts+1,last_error=NULL,delivered_at=now(),updated_at=now() WHERE id=$1 AND state='pending'`,[row.id]);
      delivered++;
    }catch(error){
      await query(`UPDATE passport_activity_outbox SET attempts=attempts+1,last_error=$2,available_at=now()+make_interval(secs=>LEAST(3600,GREATEST(30,attempts*30))),updated_at=now() WHERE id=$1 AND state='pending'`,[row.id,error instanceof Error?error.message.slice(0,500):"projection_failed"]);
    }
  }
  const pending=Number((await query<{count:string}>(`SELECT COUNT(*)::text count FROM passport_activity_outbox WHERE state='pending'
    AND ($1::text IS NULL OR user_id=$1) AND ($2::text IS NULL OR source_type=$2) AND ($3::text IS NULL OR source_id=$3)`,[filters.userId ?? null,filters.sourceType ?? null,filters.sourceId ?? null])).rows[0]?.count ?? 0);
  return{delivered,pending};
}

const XP_PER_UNIT: Record<string, number> = {
  poll_vote: 10,
  correct_prediction: 75,
  clip_vote: 5,
  chat_send: 1,
  oauth_connect: 25,
  video_complete: 50,
  series_complete: 150,
  visit_channel: 5,
  event_attendance: 100,
};

function xpFor(metric: string, amount: number): number {
  if (metric === "watch_seconds") return Math.floor(amount / 300) * 5;
  return Math.max(0, Math.floor((XP_PER_UNIT[metric] ?? 0) * amount));
}

async function applyAchievementMetric(
  client: PoolClient,
  input: PassportActivityInput & { amount: number },
): Promise<string[]> {
  const definitions = await client.query<{
    code: string;
    threshold: number;
    reward: Record<string, unknown>;
  }>(
    `SELECT code, threshold, reward
       FROM passport_achievement_definitions
      WHERE active AND metric = $1
        AND (channel_slug IS NULL OR channel_slug = $2)`,
    [input.metric, input.channelSlug ?? null],
  );
  const newlyEarned: string[] = [];
  for (const definition of definitions.rows) {
    const grant = await client.query<{ state: string; progress: number; earned_at: string | null }>(
      `INSERT INTO passport_achievement_grants
         (user_id, achievement_code, progress, state, grant_key, source_type, source_id, earned_at)
       VALUES ($1,$2,$3,CASE WHEN $3 >= $4 THEN 'active' ELSE 'progress' END,$5,$6,$7,
               CASE WHEN $3 >= $4 THEN now() ELSE NULL END)
       ON CONFLICT (user_id, achievement_code) DO UPDATE
         SET progress = passport_achievement_grants.progress + EXCLUDED.progress,
             state = CASE
               WHEN passport_achievement_grants.state = 'revoked' THEN 'revoked'
               WHEN passport_achievement_grants.progress + EXCLUDED.progress >= $4 THEN 'active'
               ELSE 'progress'
             END,
             earned_at = CASE
               WHEN passport_achievement_grants.earned_at IS NULL
                AND passport_achievement_grants.progress + EXCLUDED.progress >= $4 THEN now()
               ELSE passport_achievement_grants.earned_at
             END
       RETURNING state, progress, earned_at::text`,
      [
        input.userId,
        definition.code,
        input.amount,
        definition.threshold,
        `achievement-progress:${input.userId}:${definition.code}`,
        input.sourceType,
        input.sourceId,
      ],
    );
    const row = grant.rows[0];
    if (row?.state !== "active") continue;
    const earnKey = `achievement:${input.userId}:${definition.code}:earned`;
    const ledger = await appendPassportLedger(client, {
      idempotencyKey: earnKey,
      userId: input.userId,
      action: "achievement.earn",
      assetType: "achievement",
      assetId: definition.code,
      channelSlug: input.channelSlug,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorType: "system",
    });
    if (ledger === null) continue;
    newlyEarned.push(definition.code);
    const reward = definition.reward ?? {};
    if (typeof reward.globalXp === "number") {
      await awardPassportXpInTransaction(client, {
        userId: input.userId,
        amount: reward.globalXp,
        channelSlug: input.channelSlug,
        idempotencyKey: `${earnKey}:xp`,
        sourceType: "achievement",
        sourceId: definition.code,
        actorType: "system",
      });
    }
    if (typeof reward.sparks === "number") {
      await addSparksInTransaction(client, {
        userId: input.userId,
        amount: reward.sparks,
        idempotencyKey: `${earnKey}:sparks`,
        sourceType: "achievement",
        sourceId: definition.code,
        actorType: "system",
      });
    }
    if (typeof reward.cosmetic === "string") {
      await unlockCosmeticInTransaction(client, {
        userId: input.userId,
        cosmeticCode: reward.cosmetic,
        grantKey: `${earnKey}:cosmetic`,
        sourceType: "achievement",
        sourceId: definition.code,
        actorType: "system",
      });
    }
  }
  return newlyEarned;
}

async function applyQuestMetric(
  client: PoolClient,
  input: PassportActivityInput & { amount: number },
  options:{stepsOnly?:boolean}={},
): Promise<void> {
  const quests = await client.query<{ code: string; objective: Record<string, unknown> }>(
    `SELECT code, objective
       FROM passport_quest_definitions
      WHERE active
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at >= now())
        AND (channel_slug IS NULL OR channel_slug = $1)`,
    [input.channelSlug ?? null],
  );
  for (const quest of quests.rows) {
    const metric = typeof quest.objective.metric === "string" ? quest.objective.metric : null;
    const steps = Array.isArray(quest.objective.steps)
      ? quest.objective.steps.filter((step): step is string => typeof step === "string")
      : [];
    if(options.stepsOnly&&steps.length===0)continue;
    if (metric !== input.metric && !steps.includes(input.metric)) continue;
    // SELECT ... FOR UPDATE cannot lock an absent first-progress row. Serialize
    // the user/quest key so simultaneous first activities merge instead of
    // racing two UPSERT snapshots and losing a count or distinct step.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[
      `passport-quest:${input.userId}:${quest.code}`,
    ]);
    const required = typeof quest.objective.required === "number" ? quest.objective.required : steps.length || 1;
    const currentResult = await client.query<{ progress: Record<string, unknown>; state: string }>(
      `SELECT progress,state FROM passport_quest_progress
        WHERE user_id=$1 AND quest_code=$2 FOR UPDATE`,
      [input.userId,quest.code],
    );
    const current = currentResult.rows[0];
    const windowKey = quest.objective.window === "week" ? passportUtcWeekKey() : null;
    const priorWindowKey = typeof current?.progress?.windowKey === "string" ? current.progress.windowKey : null;
    const sameWindow = windowKey === null || priorWindowKey === windowKey;
    if (current?.state === "revoked" || (current?.state === "claimed" && sameWindow)) continue;
    if (steps.length) {
      const priorSteps = Array.isArray(current?.progress?.steps)
        ? current.progress.steps.filter((step): step is string => typeof step === "string" && steps.includes(step))
        : [];
      const completedSteps = [...new Set([...priorSteps,input.metric])];
      const state = completedSteps.length >= required ? "completed" : "active";
      await client.query(
        `INSERT INTO passport_quest_progress (user_id,quest_code,progress,state,completed_at)
         VALUES($1,$2,$3::jsonb,$4,CASE WHEN $4='completed' THEN now() ELSE NULL END)
         ON CONFLICT(user_id,quest_code) DO UPDATE SET progress=EXCLUDED.progress,state=EXCLUDED.state,
           completed_at=CASE WHEN EXCLUDED.state='completed' THEN COALESCE(passport_quest_progress.completed_at,now()) ELSE passport_quest_progress.completed_at END,
           updated_at=now()`,
        [input.userId,quest.code,JSON.stringify({steps:completedSteps,count:completedSteps.length}),state],
      );
      continue;
    }
    const priorCount = sameWindow && typeof current?.progress?.count === "number" ? current.progress.count : 0;
    const count = priorCount + input.amount;
    const state = count >= required ? "completed" : "active";
    await client.query(
      `INSERT INTO passport_quest_progress (user_id, quest_code, progress, state, completion_count, completed_at)
       VALUES ($1,$2,jsonb_build_object('count',$3,'windowKey',$5::text),$4,CASE WHEN $4='completed' THEN 1 ELSE 0 END,CASE WHEN $4='completed' THEN now() ELSE NULL END)
       ON CONFLICT (user_id, quest_code) DO UPDATE
         SET progress = EXCLUDED.progress,
             state = EXCLUDED.state,
             completion_count = passport_quest_progress.completion_count + CASE
               WHEN EXCLUDED.state='completed' AND (passport_quest_progress.state NOT IN('completed','claimed') OR passport_quest_progress.progress->>'windowKey' IS DISTINCT FROM $5::text) THEN 1 ELSE 0 END,
             completed_at = CASE
               WHEN EXCLUDED.state='completed' AND passport_quest_progress.progress->>'windowKey' IS DISTINCT FROM $5::text THEN now()
               WHEN EXCLUDED.state='completed' THEN COALESCE(passport_quest_progress.completed_at,now())
               ELSE passport_quest_progress.completed_at END,
             claimed_at = CASE WHEN passport_quest_progress.progress->>'windowKey' IS DISTINCT FROM $5::text THEN NULL ELSE passport_quest_progress.claimed_at END,
             updated_at = now()`,
      [input.userId, quest.code, count, state, windowKey],
    );
  }
}

async function applyCommunityGoals(
  client:PoolClient,
  input:PassportActivityInput & {amount:number},
  activityKey:string,
):Promise<void>{
  const goals=await client.query<{code:string;target:string}>(`SELECT code,target::text FROM passport_community_goals
    WHERE active AND metric=$1 AND (channel_slug IS NULL OR channel_slug=$2)
      AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())`,[input.metric,input.channelSlug ?? null]);
  for(const goal of goals.rows){
    const contribution=await client.query(`INSERT INTO passport_community_goal_contributions(goal_code,user_id,contribution_key,amount)
      VALUES($1,$2,$3,$4) ON CONFLICT(contribution_key) DO NOTHING RETURNING id`,[goal.code,input.userId,`${activityKey}:goal:${goal.code}`,input.amount]);
    if(!contribution.rows[0])continue;
    await client.query(`INSERT INTO passport_community_goal_progress(goal_code,total,state,completed_at)
      VALUES($1,$2,CASE WHEN $2 >= $3::bigint THEN 'completed' ELSE 'active' END,CASE WHEN $2 >= $3::bigint THEN now() ELSE NULL END)
      ON CONFLICT(goal_code) DO UPDATE SET total=passport_community_goal_progress.total+EXCLUDED.total,
        state=CASE WHEN passport_community_goal_progress.total+EXCLUDED.total >= $3::bigint THEN 'completed' ELSE passport_community_goal_progress.state END,
        completed_at=CASE WHEN passport_community_goal_progress.completed_at IS NULL AND passport_community_goal_progress.total+EXCLUDED.total >= $3::bigint THEN now() ELSE passport_community_goal_progress.completed_at END,
        updated_at=now()`,[goal.code,input.amount,goal.target]);
  }
}

/**
 * Idempotent compatibility bridge for legacy poll/chat/OAuth/watch actions.
 * This is the only API those features need: it updates XP and applicable
 * quest/achievement projections atomically behind one ledger key.
 */
export async function recordPassportActivity(input: PassportActivityInput): Promise<{
  recorded: boolean;
  xpAwarded: number;
  achievementsEarned: string[];
}> {
  const amount = Math.max(1, Math.min(1_000_000, Math.floor(input.amount ?? 1)));
  return withTransaction(async (client) => {
    await ensurePassportProfile(client, input.userId);
    const activityKey = `activity:${input.userId}:${input.idempotencyKey}`;
    const ledger = await appendPassportLedger(client, {
      idempotencyKey: activityKey,
      userId: input.userId,
      action: "activity.record",
      assetType: "metric",
      assetId: input.metric,
      delta: amount,
      channelSlug: input.channelSlug,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorType: "system",
    });
    if (ledger === null) return { recorded: false, xpAwarded: 0, achievementsEarned: [] };

    if (input.metric === "watch_seconds" && input.channelSlug) {
      await client.query(
        `INSERT INTO passport_channel_progress (user_id, channel_slug, watch_seconds, last_active_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (user_id, channel_slug) DO UPDATE
           SET watch_seconds = passport_channel_progress.watch_seconds + EXCLUDED.watch_seconds,
               last_active_at = now(), updated_at = now()`,
        [input.userId, input.channelSlug, amount],
      );
    }
    const xp = xpFor(input.metric, amount);
    if (xp) {
      await awardPassportXpInTransaction(client, {
        userId: input.userId,
        amount: xp,
        channelSlug: input.channelSlug,
        idempotencyKey: `${activityKey}:xp`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        actorType: "system",
      });
    }
    await applyQuestMetric(client, { ...input, amount });
    if(input.channelSlug&&input.metric!=="visit_channel"){
      // Step quests should recover after a corrected attendance is followed by
      // a later legitimate visit. Replaying the step is set-union idempotent;
      // count-style visit quests remain tied to the first channel.visit ledger.
      await applyQuestMetric(client,{...input,metric:"visit_channel",amount:1},{stepsOnly:true});
    }
    await applyCommunityGoals(client,{...input,amount},activityKey);
    const achievementsEarned = await applyAchievementMetric(client, { ...input, amount });
    if (input.channelSlug) {
      const firstChannelVisit = await appendPassportLedger(client, {
        idempotencyKey: `channel-visit:${input.userId}:${input.channelSlug}`,
        userId: input.userId,
        action: "channel.visit",
        assetType: "channel",
        assetId: input.channelSlug,
        delta: 1,
        channelSlug: input.channelSlug,
        sourceType: "channel",
        sourceId: input.channelSlug,
        actorType: "system",
      });
      if (firstChannelVisit !== null) {
        if(input.metric!=="visit_channel")await applyQuestMetric(client, { ...input, metric: "visit_channel", amount: 1 });
        achievementsEarned.push(...await applyAchievementMetric(client, { ...input, metric: "channels_visited", amount: 1 }));
      }
    }
    return { recorded: true, xpAwarded: xp, achievementsEarned };
  });
}

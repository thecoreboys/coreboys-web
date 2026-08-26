import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import {
  PASSPORT_RATE_LIMITS,
  PassportError,
  passportLevelForXp,
} from "@/lib/passport/policy";

export type PassportActorType = "system" | "fan" | "staff";

export type LedgerInput = {
  idempotencyKey: string;
  userId?: string | null;
  action: string;
  assetType: string;
  assetId?: string | null;
  delta?: number | null;
  channelSlug?: string | null;
  sourceType: string;
  sourceId?: string | null;
  actorType: PassportActorType;
  actorId?: string | null;
  reversalOf?: number | null;
  data?: Record<string, unknown>;
};

export async function ensurePassportProfile(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO passport_profiles (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await client.query(
    `INSERT INTO passport_cosmetic_unlocks
       (user_id,cosmetic_code,grant_key,source_type,source_id)
     SELECT $1,'title-core-rookie',$2,'welcome','passport'
      WHERE EXISTS (SELECT 1 FROM passport_cosmetics WHERE code='title-core-rookie')
     ON CONFLICT DO NOTHING`,
    [userId,`welcome:${userId}:title-core-rookie`],
  );
  await appendPassportLedger(client,{
    idempotencyKey:`welcome:${userId}:title-core-rookie:ledger`,userId,
    action:"cosmetic.unlock",assetType:"cosmetic",assetId:"title-core-rookie",
    sourceType:"welcome",sourceId:"passport",actorType:"system",
  });
}

/** Returns the new ledger id, or null when the key already exists. */
export async function appendPassportLedger(
  client: PoolClient,
  input: LedgerInput,
): Promise<number | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO passport_ledger
       (idempotency_key, user_id, action, asset_type, asset_id, delta,
        channel_slug, source_type, source_id, actor_type, actor_id,
        reversal_of, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id::text`,
    [
      input.idempotencyKey,
      input.userId ?? null,
      input.action,
      input.assetType,
      input.assetId ?? null,
      input.delta ?? null,
      input.channelSlug ?? null,
      input.sourceType,
      input.sourceId ?? null,
      input.actorType,
      input.actorId ?? null,
      input.reversalOf ?? null,
      JSON.stringify(input.data ?? {}),
    ],
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

export async function awardPassportXpInTransaction(
  client: PoolClient,
  input: {
    userId: string;
    amount: number;
    channelSlug?: string | null;
    idempotencyKey: string;
    sourceType: string;
    sourceId?: string | null;
    actorType: PassportActorType;
    actorId?: string | null;
  },
): Promise<boolean> {
  const amount = Math.max(0, Math.min(1_000_000, Math.floor(input.amount)));
  if (!amount) return false;
  const ledgerId = await appendPassportLedger(client, {
    idempotencyKey: input.idempotencyKey,
    userId: input.userId,
    action: "xp.award",
    assetType: "xp",
    delta: amount,
    channelSlug: input.channelSlug,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorType: input.actorType,
    actorId: input.actorId,
  });
  if (ledgerId === null) return false;

  await ensurePassportProfile(client, input.userId);
  const profile = await client.query<{ global_xp: number }>(
    `UPDATE passport_profiles
        SET global_xp = global_xp + $2,
            updated_at = now()
      WHERE user_id = $1
      RETURNING global_xp`,
    [input.userId, amount],
  );
  await client.query(
    `UPDATE passport_profiles SET level = $2 WHERE user_id = $1`,
    [input.userId, passportLevelForXp(profile.rows[0]?.global_xp ?? amount)],
  );

  if (input.channelSlug) {
    await client.query(
      `INSERT INTO passport_channel_progress
         (user_id, channel_slug, xp, level, last_active_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, channel_slug) DO UPDATE
         SET xp = passport_channel_progress.xp + EXCLUDED.xp,
             level = GREATEST(1, floor(sqrt((passport_channel_progress.xp + EXCLUDED.xp)::numeric / 100))::integer + 1),
             last_active_at = now(),
             updated_at = now()`,
      [input.userId, input.channelSlug, amount, passportLevelForXp(amount)],
    );
  }
  return true;
}

export async function unlockCosmeticInTransaction(
  client: PoolClient,
  input: {
    userId: string;
    cosmeticCode: string;
    grantKey: string;
    sourceType: string;
    sourceId?: string | null;
    actorType: PassportActorType;
    actorId?: string | null;
  },
): Promise<boolean> {
  const result = await client.query<{ cosmetic_code: string }>(
    `INSERT INTO passport_cosmetic_unlocks
       (user_id, cosmetic_code, grant_key, source_type, source_id)
     SELECT $1, code, $3, $4, $5
       FROM passport_cosmetics
      WHERE code = $2 AND active
     ON CONFLICT (user_id, cosmetic_code) DO UPDATE SET
       grant_key=EXCLUDED.grant_key,source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,
       state='active',unlocked_at=now(),revoked_at=NULL
     WHERE passport_cosmetic_unlocks.state='revoked'
     RETURNING cosmetic_code`,
    [input.userId, input.cosmeticCode, input.grantKey, input.sourceType, input.sourceId ?? null],
  );
  if (!result.rows[0]) return false;
  await appendPassportLedger(client, {
    idempotencyKey: `${input.grantKey}:ledger`,
    userId: input.userId,
    action: "cosmetic.unlock",
    assetType: "cosmetic",
    assetId: input.cosmeticCode,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorType: input.actorType,
    actorId: input.actorId,
  });
  return true;
}

export async function addSparksInTransaction(
  client: PoolClient,
  input: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    sourceType: string;
    sourceId?: string | null;
    actorType: PassportActorType;
    actorId?: string | null;
  },
): Promise<boolean> {
  const amount = Math.max(0, Math.min(100_000, Math.floor(input.amount)));
  if (!amount) return false;
  const inserted = await appendPassportLedger(client, {
    idempotencyKey: input.idempotencyKey,
    userId: input.userId,
    action: "sparks.award",
    assetType: "sparks",
    delta: amount,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorType: input.actorType,
    actorId: input.actorId,
  });
  if (inserted === null) return false;
  await ensurePassportProfile(client, input.userId);
  await client.query(
    `UPDATE passport_profiles
        SET sparks = sparks + $2, updated_at = now()
      WHERE user_id = $1`,
    [input.userId, amount],
  );
  return true;
}

export type GrantedCard = { id: string; editionId: string; serialNumber: number | null };

export type PassportAssetReferences={cardIds:string[];achievementCodes:string[];cosmeticCodes:string[]};

export async function prunePassportAssetReferences(client:PoolClient,userId:string,references:PassportAssetReferences):Promise<void>{
  if(references.cardIds.length){
    await client.query(`UPDATE passport_profiles SET showcase_card_ids=ARRAY(SELECT card_id FROM unnest(showcase_card_ids) WITH ORDINALITY AS cards(card_id,position) WHERE NOT(card_id=ANY($2::uuid[])) ORDER BY position),updated_at=now() WHERE user_id=$1`,[userId,references.cardIds]);
    await client.query(`UPDATE passport_loadouts SET featured_card_id=NULL,updated_at=now() WHERE user_id=$1 AND featured_card_id=ANY($2::uuid[])`,[userId,references.cardIds]);
  }
  if(references.achievementCodes.length){
    await client.query(`UPDATE passport_profiles SET showcase_achievement_codes=ARRAY(SELECT code FROM unnest(showcase_achievement_codes) WITH ORDINALITY AS achievements(code,position) WHERE NOT(code=ANY($2::text[])) ORDER BY position),updated_at=now() WHERE user_id=$1`,[userId,references.achievementCodes]);
    await client.query(`UPDATE passport_loadouts SET badge_codes=ARRAY(SELECT code FROM unnest(badge_codes) WITH ORDINALITY AS badges(code,position) WHERE NOT(code=ANY($2::text[])) ORDER BY position),updated_at=now() WHERE user_id=$1`,[userId,references.achievementCodes]);
  }
  if(references.cosmeticCodes.length){
    await client.query(`UPDATE passport_loadouts SET
      title_code=CASE WHEN title_code=ANY($2::text[]) THEN NULL ELSE title_code END,
      nameplate_code=CASE WHEN nameplate_code=ANY($2::text[]) THEN NULL ELSE nameplate_code END,
      frame_code=CASE WHEN frame_code=ANY($2::text[]) THEN NULL ELSE frame_code END,
      theme_code=CASE WHEN theme_code=ANY($2::text[]) THEN NULL ELSE theme_code END,
      reaction_codes=ARRAY(SELECT code FROM unnest(reaction_codes) WITH ORDINALITY AS reactions(code,position) WHERE NOT(code=ANY($2::text[])) ORDER BY position),updated_at=now()
      WHERE user_id=$1`,[userId,references.cosmeticCodes]);
    await client.query(`UPDATE passport_profiles p SET display_title=(SELECT c.name FROM passport_loadouts l JOIN passport_cosmetics c ON c.code=l.title_code AND c.kind='title' JOIN passport_cosmetic_unlocks u ON u.user_id=l.user_id AND u.cosmetic_code=l.title_code AND u.state='active' WHERE l.user_id=p.user_id AND l.scope=p.active_loadout_scope LIMIT 1),updated_at=now() WHERE p.user_id=$1`,[userId]);
  }
}

async function progressCardCollectionAchievements(
  client:PoolClient,
  input:{userId:string;channelSlug:string;cardId:string},
):Promise<void>{
  const definitions=await client.query<{code:string;threshold:number;reward:Record<string,unknown>}>(`SELECT code,threshold,reward FROM passport_achievement_definitions WHERE active AND metric='cards_collected' AND (channel_slug IS NULL OR channel_slug=$1)`,[input.channelSlug]);
  for(const definition of definitions.rows){
    const progress=await client.query<{state:string}>(`INSERT INTO passport_achievement_grants(user_id,achievement_code,progress,state,grant_key,source_type,source_id,earned_at)
      VALUES($1,$2,1,CASE WHEN 1 >= $3 THEN 'active' ELSE 'progress' END,$4,'card',$5,CASE WHEN 1 >= $3 THEN now() ELSE NULL END)
      ON CONFLICT(user_id,achievement_code) DO UPDATE SET progress=passport_achievement_grants.progress+1,
        state=CASE WHEN passport_achievement_grants.state='revoked' THEN 'revoked' WHEN passport_achievement_grants.progress+1 >= $3 THEN 'active' ELSE 'progress' END,
        earned_at=CASE WHEN passport_achievement_grants.earned_at IS NULL AND passport_achievement_grants.progress+1 >= $3 THEN now() ELSE passport_achievement_grants.earned_at END
      RETURNING state`,[input.userId,definition.code,definition.threshold,`achievement-progress:${input.userId}:${definition.code}`,input.cardId]);
    if(progress.rows[0]?.state!=="active")continue;
    const earnKey=`achievement:${input.userId}:${definition.code}:earned`;
    const earned=await appendPassportLedger(client,{idempotencyKey:earnKey,userId:input.userId,action:"achievement.earn",assetType:"achievement",assetId:definition.code,channelSlug:input.channelSlug,sourceType:"card",sourceId:input.cardId,actorType:"system"});
    if(earned===null)continue;
    if(typeof definition.reward.globalXp==="number")await awardPassportXpInTransaction(client,{userId:input.userId,amount:definition.reward.globalXp,channelSlug:input.channelSlug,idempotencyKey:`${earnKey}:xp`,sourceType:"achievement",sourceId:definition.code,actorType:"system"});
    if(typeof definition.reward.sparks==="number")await addSparksInTransaction(client,{userId:input.userId,amount:definition.reward.sparks,idempotencyKey:`${earnKey}:sparks`,sourceType:"achievement",sourceId:definition.code,actorType:"system"});
    if(typeof definition.reward.cosmetic==="string")await unlockCosmeticInTransaction(client,{userId:input.userId,cosmeticCode:definition.reward.cosmetic,grantKey:`${earnKey}:cosmetic`,sourceType:"achievement",sourceId:definition.code,actorType:"system"});
  }
}

/** Caller must be inside a transaction. Locks the edition to serialize supply/serial assignment. */
export async function grantEditionCardInTransaction(
  client: PoolClient,
  input: {
    userId: string;
    editionId: string;
    claimKey: string;
    acquiredVia: "attendance" | "moment" | "achievement" | "quest" | "grant" | "gift" | "trade" | "craft" | "restoration";
    provenance?: Record<string, unknown>;
    actorType: PassportActorType;
    actorId?: string | null;
    sourceType: string;
    sourceId?: string | null;
  },
): Promise<GrantedCard | null> {
  const existing = await client.query<{ id: string; edition_id: string; serial_number: number | null }>(
    `SELECT id::text, edition_id::text, serial_number
       FROM passport_cards WHERE claim_key = $1`,
    [input.claimKey],
  );
  if (existing.rows[0]) {
    return {
      id: existing.rows[0].id,
      editionId: existing.rows[0].edition_id,
      serialNumber: existing.rows[0].serial_number,
    };
  }

  const editionResult = await client.query<{
    id: string;
    max_supply: number | null;
    state: string;
    metadata: Record<string,unknown>;
  }>(
    `SELECT id::text, max_supply, state, metadata
       FROM passport_card_editions
      WHERE id = $1
      FOR UPDATE`,
    [input.editionId],
  );
  const edition = editionResult.rows[0];
  if (!edition) throw new PassportError("not_found", 404, "edition_not_found");
  if (edition.state !== "published") {
    throw new PassportError("invalid_state", 409, "edition_not_available");
  }
  // A same-key request can have committed while this transaction waited for
  // the edition supply lock. Recheck under the lock so double-tab retries
  // return the first card instead of surfacing the claim_key unique violation.
  const raced = await client.query<{ id: string; edition_id: string; serial_number: number | null }>(
    `SELECT id::text,edition_id::text,serial_number FROM passport_cards WHERE claim_key=$1`,
    [input.claimKey],
  );
  if(raced.rows[0])return{
    id:raced.rows[0].id,
    editionId:raced.rows[0].edition_id,
    serialNumber:raced.rows[0].serial_number,
  };
  const supply = await client.query<{ count: string; max_serial: number | null }>(
    `SELECT COUNT(*)::text AS count, MAX(serial_number) AS max_serial
       FROM passport_cards
      WHERE edition_id = $1`,
    [input.editionId],
  );
  const count = Number(supply.rows[0]?.count ?? 0);
  if (edition.max_supply !== null && count >= edition.max_supply) {
    throw new PassportError("not_eligible", 409, "edition_sold_out");
  }
  const serialNumber = Math.max(count, supply.rows[0]?.max_serial ?? 0) + 1;
  const card = await client.query<{ id: string }>(
    `INSERT INTO passport_cards
       (edition_id, owner_user_id, original_user_id, serial_number, claim_key,
        acquired_via, provenance)
     VALUES ($1,$2,$2,$3,$4,$5,$6::jsonb)
     RETURNING id::text`,
    [input.editionId, input.userId, serialNumber, input.claimKey, input.acquiredVia, JSON.stringify({edition:edition.metadata ?? {},...(input.provenance ?? {})})],
  );
  const cardId = card.rows[0]!.id;
  await appendPassportLedger(client, {
    idempotencyKey: `${input.claimKey}:ledger`,
    userId: input.userId,
    action: "card.issue",
    assetType: "card",
    assetId: cardId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorType: input.actorType,
    actorId: input.actorId,
    data: { editionId: input.editionId, serialNumber },
  });
  const channelResult=await client.query<{channel_slug:string}>(`SELECT channel_slug FROM passport_card_editions WHERE id=$1`,[input.editionId]);
  await progressCardCollectionAchievements(client,{userId:input.userId,channelSlug:channelResult.rows[0]?.channel_slug ?? "core",cardId});
  return { id: cardId, editionId: input.editionId, serialNumber };
}

export function hashPassportSession(value: string): string {
  const salt = process.env.PASSPORT_PRESENCE_SALT ?? process.env.FAN_SESSION_SECRET ?? "core-passport-local";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export async function consumePassportRateLimit(userId: string, action: string): Promise<void> {
  const rule = PASSPORT_RATE_LIMITS[action];
  if (!rule) return;
  const windowMs = rule.windowSeconds * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const result = await query<{ hits: number }>(
    `INSERT INTO passport_rate_limits (subject_key, action, bucket_started_at, hits)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (subject_key, action, bucket_started_at) DO UPDATE
       SET hits = passport_rate_limits.hits + 1
     RETURNING hits`,
    [userId, action, start.toISOString()],
  );
  if ((result.rows[0]?.hits ?? 0) > rule.limit) {
    throw new PassportError("rate_limited", 429, "rate_limit_exceeded");
  }
}

export async function resolveFanRecipient(
  client: PoolClient,
  identifier: string,
  senderId: string,
): Promise<{ id: string; displayName: string }> {
  const result = await client.query<{ id: string; display_name: string }>(
    `SELECT u.id, u.display_name
       FROM fan_users u JOIN passport_profiles p ON p.user_id=u.id
      WHERE lower(u.public_slug) = lower(regexp_replace($1, '^@', ''))
        AND p.exchange_enabled
        AND u.id<>$2
      LIMIT 1`,
    [identifier,senderId],
  );
  const recipient = result.rows[0];
  if (!recipient) throw new PassportError("not_found", 404, "recipient_unavailable");
  return { id: recipient.id, displayName: recipient.display_name };
}

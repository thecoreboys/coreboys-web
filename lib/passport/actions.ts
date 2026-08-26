import "server-only";

import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { recordPassportActivity } from "@/lib/passport/activity";
import {
  addSparksInTransaction,
  appendPassportLedger,
  awardPassportXpInTransaction,
  consumePassportRateLimit,
  ensurePassportProfile,
  prunePassportAssetReferences,
  unlockCosmeticInTransaction,
} from "@/lib/passport/internal";
import { PassportError } from "@/lib/passport/policy";
import type { PassportLoadout, PassportPrivacy } from "@/lib/passport/types";
import { resolveNetworkChannel } from "@/lib/watch/channels";

function passportLoadoutScope(scope:string):{scope:string;channelSlug:string|null}{
  if(scope==="global")return{scope:"global",channelSlug:null};
  const match=/^channel:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(scope);
  if(!match)throw new PassportError("invalid_input",400,"invalid_loadout_scope");
  const channel=resolveNetworkChannel(match[1]!);
  if(!channel)throw new PassportError("not_found",404,"loadout_channel_not_found");
  return{scope:`channel:${channel.slug}`,channelSlug:channel.slug};
}

async function validateShowcase(
  client: PoolClient,
  userId: string,
  cardIds: string[],
  achievementCodes: string[],
): Promise<void> {
  if(cardIds.length>3||achievementCodes.length>3||new Set(cardIds).size!==cardIds.length||new Set(achievementCodes).size!==achievementCodes.length){
    throw new PassportError("invalid_input",400,"showcase_must_be_unique_and_limited_to_three");
  }
  if (cardIds.length) {
    const cards = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM passport_cards
        WHERE owner_user_id=$1 AND id=ANY($2::uuid[]) AND state IN ('active','locked')`,
      [userId,cardIds],
    );
    if(Number(cards.rows[0]?.count ?? 0)!==new Set(cardIds).size) throw new PassportError("forbidden",403,"showcase_card_not_owned");
  }
  if(achievementCodes.length){
    const achievements=await client.query<{count:string}>(`SELECT COUNT(*)::text count FROM passport_achievement_grants WHERE user_id=$1 AND achievement_code=ANY($2::text[]) AND state='active'`,[userId,achievementCodes]);
    if(Number(achievements.rows[0]?.count ?? 0)!==new Set(achievementCodes).size)throw new PassportError("forbidden",403,"showcase_achievement_not_earned");
  }
}

export async function updatePassportProfile(userId:string,input:{displayTitle?:string|null;exchangeEnabled?:boolean;privacy?:PassportPrivacy;cardIds?:string[];achievementCodes?:string[]}){
  await consumePassportRateLimit(userId,"profile.update");
  return withTransaction(async(client)=>{
    await ensurePassportProfile(client,userId);
    const cards=input.cardIds ?? null;const achievements=input.achievementCodes ?? null;
    if(cards||achievements)await validateShowcase(client,userId,cards ?? [],achievements ?? []);
    if(input.displayTitle){const unlocked=await client.query(`SELECT 1 FROM passport_cosmetic_unlocks u JOIN passport_cosmetics c ON c.code=u.cosmetic_code WHERE u.user_id=$1 AND u.state='active' AND c.kind='title' AND (c.code=$2 OR c.name=$2)`,[userId,input.displayTitle]);if(!unlocked.rows[0])throw new PassportError("forbidden",403,"title_not_unlocked");}
    const row=(await client.query(`UPDATE passport_profiles SET display_title=CASE WHEN $2::boolean THEN $3 ELSE display_title END,
      exchange_enabled=CASE WHEN $4::boolean THEN $5 ELSE exchange_enabled END,
      privacy=COALESCE($6::jsonb,privacy),showcase_card_ids=COALESCE($7::uuid[],showcase_card_ids),showcase_achievement_codes=COALESCE($8::text[],showcase_achievement_codes),updated_at=now() WHERE user_id=$1 RETURNING *`,
      [userId,"displayTitle" in input,input.displayTitle ?? null,"exchangeEnabled" in input,input.exchangeEnabled ?? false,input.privacy?JSON.stringify(input.privacy):null,cards,achievements])).rows[0];return row;
  });
}

export async function savePassportLoadout(userId:string,input:Omit<PassportLoadout,"updatedAt">){
  await consumePassportRateLimit(userId,"profile.update");
  const result=await withTransaction(async(client)=>{
    await ensurePassportProfile(client,userId);
    const resolvedScope=passportLoadoutScope(input.scope);const channelSlug=resolvedScope.channelSlug;
    if(input.reactionCodes.length>8||new Set(input.reactionCodes).size!==input.reactionCodes.length||input.badgeCodes.length>3||new Set(input.badgeCodes).size!==input.badgeCodes.length)throw new PassportError("invalid_input",400,"loadout_codes_must_be_unique");
    const cosmeticCodes=[input.titleCode,input.nameplateCode,input.frameCode,input.themeCode,...input.reactionCodes].filter((v):v is string=>Boolean(v));
    if(cosmeticCodes.length){const result=await client.query<{code:string;kind:string;channel_slug:string|null}>(`SELECT c.code,c.kind,c.channel_slug FROM passport_cosmetic_unlocks u JOIN passport_cosmetics c ON c.code=u.cosmetic_code WHERE u.user_id=$1 AND u.state='active' AND c.code=ANY($2::text[])`,[userId,cosmeticCodes]);if(result.rows.length!==new Set(cosmeticCodes).size)throw new PassportError("forbidden",403,"cosmetic_not_unlocked");if(result.rows.some(row=>row.channel_slug!==null&&row.channel_slug!==channelSlug))throw new PassportError("forbidden",403,"cosmetic_channel_mismatch");const kinds=new Map(result.rows.map(r=>[r.code,r.kind]));if((input.titleCode&&kinds.get(input.titleCode)!=="title")||(input.nameplateCode&&kinds.get(input.nameplateCode)!=="nameplate")||(input.frameCode&&kinds.get(input.frameCode)!=="frame")||(input.themeCode&&kinds.get(input.themeCode)!=="theme")||input.reactionCodes.some(code=>kinds.get(code)!=="reaction"))throw new PassportError("invalid_input",400,"cosmetic_kind_mismatch");}
    if(input.featuredCardId){await validateShowcase(client,userId,[input.featuredCardId],[]);const card=await client.query<{channel_slug:string}>(`SELECT e.channel_slug FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id WHERE c.id=$1 AND c.owner_user_id=$2 AND c.state IN('active','locked')`,[input.featuredCardId,userId]);if(!card.rows[0]||card.rows[0].channel_slug!==channelSlug)throw new PassportError("forbidden",403,"featured_card_channel_mismatch");}
    await validateShowcase(client,userId,[],input.badgeCodes);
    if(input.badgeCodes.length){const badges=await client.query<{channel_slug:string|null}>(`SELECT d.channel_slug FROM passport_achievement_grants g JOIN passport_achievement_definitions d ON d.code=g.achievement_code WHERE g.user_id=$1 AND g.state='active' AND g.achievement_code=ANY($2::text[])`,[userId,input.badgeCodes]);if(badges.rows.some(row=>row.channel_slug!==null&&row.channel_slug!==channelSlug))throw new PassportError("forbidden",403,"badge_channel_mismatch");}
    const row=(await client.query(`INSERT INTO passport_loadouts(user_id,scope,title_code,nameplate_code,frame_code,theme_code,reaction_codes,featured_card_id,badge_codes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,scope) DO UPDATE SET title_code=EXCLUDED.title_code,nameplate_code=EXCLUDED.nameplate_code,frame_code=EXCLUDED.frame_code,theme_code=EXCLUDED.theme_code,reaction_codes=EXCLUDED.reaction_codes,featured_card_id=EXCLUDED.featured_card_id,badge_codes=EXCLUDED.badge_codes,updated_at=now() RETURNING *`,[userId,resolvedScope.scope,input.titleCode,input.nameplateCode,input.frameCode,input.themeCode,input.reactionCodes,input.featuredCardId,input.badgeCodes])).rows[0];return row;
  });
  if(input.titleCode){const resolved=passportLoadoutScope(input.scope);await recordPassportActivity({userId,metric:"equip_title",channelSlug:resolved.channelSlug,sourceType:"loadout",sourceId:resolved.scope,idempotencyKey:`equip-title:${resolved.scope}:${input.titleCode}`});}
  return result;
}

export async function activatePassportLoadout(userId:string,scope:string){await consumePassportRateLimit(userId,"profile.update");return withTransaction(async(client)=>{await ensurePassportProfile(client,userId);const resolved=passportLoadoutScope(scope);const loadout=(await client.query<{title_name:string|null}>(`SELECT c.name AS title_name FROM passport_loadouts l LEFT JOIN passport_cosmetics c ON c.code=l.title_code AND c.kind='title' LEFT JOIN passport_cosmetic_unlocks u ON u.user_id=l.user_id AND u.cosmetic_code=l.title_code AND u.state='active' WHERE l.user_id=$1 AND l.scope=$2 AND (l.title_code IS NULL OR u.cosmetic_code IS NOT NULL)`,[userId,resolved.scope])).rows[0];if(!loadout&&resolved.scope!=="global")throw new PassportError("not_found",404,"loadout_not_found");await client.query(`UPDATE passport_profiles SET active_loadout_scope=$2,display_title=$3,updated_at=now() WHERE user_id=$1`,[userId,resolved.scope,loadout?.title_name ?? null]);return{scope:resolved.scope,displayTitle:loadout?.title_name ?? null};});}

async function applyJsonReward(client:PoolClient,userId:string,reward:Record<string,unknown>,key:string,sourceType:string,sourceId:string,channelSlug?:string|null){
  if(typeof reward.globalXp==="number")await awardPassportXpInTransaction(client,{userId,amount:reward.globalXp,channelSlug,idempotencyKey:`${key}:xp`,sourceType,sourceId,actorType:"system"});
  if(typeof reward.sparks==="number")await addSparksInTransaction(client,{userId,amount:reward.sparks,idempotencyKey:`${key}:sparks`,sourceType,sourceId,actorType:"system"});
  if(typeof reward.cosmetic==="string")await unlockCosmeticInTransaction(client,{userId,cosmeticCode:reward.cosmetic,grantKey:`${key}:cosmetic`,sourceType,sourceId,actorType:"system"});
}

export async function claimPassportQuest(userId:string,questCode:string,idempotencyKey:string){await consumePassportRateLimit(userId,"quest.claim");return withTransaction(async(client)=>{const progress=(await client.query<{state:string;reward:Record<string,unknown>;channel_slug:string|null}>(`SELECT p.state,q.reward,q.channel_slug FROM passport_quest_progress p JOIN passport_quest_definitions q ON q.code=p.quest_code WHERE p.user_id=$1 AND p.quest_code=$2 FOR UPDATE OF p`,[userId,questCode])).rows[0];if(!progress)throw new PassportError("not_found",404);if(progress.state==="claimed")return{claimed:false,alreadyClaimed:true};if(progress.state!=="completed")throw new PassportError("not_eligible",403,"quest_not_complete");const key=`quest:${userId}:${questCode}:${idempotencyKey}`;const ledger=await appendPassportLedger(client,{idempotencyKey:key,userId,action:"quest.claim",assetType:"quest",assetId:questCode,channelSlug:progress.channel_slug,sourceType:"quest",sourceId:questCode,actorType:"fan",actorId:userId});if(ledger===null)return{claimed:false,alreadyClaimed:true};await applyJsonReward(client,userId,progress.reward,key,"quest",questCode,progress.channel_slug);await client.query(`UPDATE passport_quest_progress SET state='claimed',claimed_at=now(),updated_at=now() WHERE user_id=$1 AND quest_code=$2`,[userId,questCode]);return{claimed:true,reward:progress.reward};});}

export async function claimPassportAlbum(userId:string,albumCode:string,idempotencyKey:string){
  await consumePassportRateLimit(userId,"album.claim");
  return withTransaction(async(client)=>{
    const album=(await client.query<{reward:Record<string,unknown>;channel_slug:string|null}>(`SELECT reward,channel_slug FROM passport_albums WHERE code=$1 AND active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) FOR UPDATE`,[albumCode])).rows[0];
    if(!album)throw new PassportError("not_found",404);
    const counts=(await client.query<{required:string;collected:string}>(`SELECT COUNT(DISTINCT s.edition_id) FILTER(WHERE s.required)::text AS required,
      COUNT(DISTINCT c.edition_id) FILTER(WHERE s.required)::text AS collected FROM passport_album_slots s
      LEFT JOIN passport_cards c ON c.edition_id=s.edition_id AND c.owner_user_id=$1 AND c.state IN('active','locked')
      WHERE s.album_code=$2`,[userId,albumCode])).rows[0]!;
    if(Number(counts.required)===0||Number(counts.collected)<Number(counts.required))throw new PassportError("not_eligible",403,"album_incomplete");
    const key=`album:${userId}:${albumCode}:${idempotencyKey}`;
    const inserted=await client.query(`INSERT INTO passport_album_completions(user_id,album_code,state,claimed_at,grant_key) VALUES($1,$2,'claimed',now(),$3) ON CONFLICT(user_id,album_code) DO NOTHING RETURNING *`,[userId,albumCode,key]);
    if(!inserted.rows[0])return{claimed:false,alreadyClaimed:true};
    await appendPassportLedger(client,{idempotencyKey:`${key}:ledger`,userId,action:"album.complete",assetType:"album",assetId:albumCode,channelSlug:album.channel_slug,sourceType:"album",sourceId:albumCode,actorType:"fan",actorId:userId});
    await applyJsonReward(client,userId,album.reward,key,"album",albumCode,album.channel_slug);
    return{claimed:true,reward:album.reward};
  });
}

export async function claimPassportCommunityGoal(
  userId:string,
  goalCode:string,
  idempotencyKey:string,
){
  await consumePassportRateLimit(userId,"quest.claim");
  return withTransaction(async(client)=>{
    await ensurePassportProfile(client,userId);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[
      `passport-community-goal:${userId}:${goalCode}`,
    ]);
    const existing=await client.query(
      `SELECT claimed_at FROM passport_community_goal_claims WHERE goal_code=$1 AND user_id=$2`,
      [goalCode,userId],
    );
    if(existing.rows[0])return{claimed:false,alreadyClaimed:true};
    const goal=(await client.query<{reward:Record<string,unknown>;channel_slug:string|null;state:string}>(
      `SELECT g.reward,g.channel_slug,p.state
         FROM passport_community_goals g JOIN passport_community_goal_progress p ON p.goal_code=g.code
        WHERE g.code=$1 AND g.active FOR UPDATE OF p`,[goalCode],
    )).rows[0];
    if(!goal)throw new PassportError("not_found",404,"community_goal_not_found");
    if(goal.state!=="completed")throw new PassportError("not_eligible",403,"community_goal_not_complete");
    const contributed=await client.query(
      `SELECT 1 FROM passport_community_goal_contributions
        WHERE goal_code=$1 AND user_id=$2 AND revoked_at IS NULL LIMIT 1`,[goalCode,userId],
    );
    if(!contributed.rows[0])throw new PassportError("not_eligible",403,"community_goal_participation_required");
    const key=`community-goal:${userId}:${goalCode}:${idempotencyKey}`;
    const ledger=await appendPassportLedger(client,{
      idempotencyKey:key,userId,action:"community_goal.claim",assetType:"community_goal",assetId:goalCode,
      channelSlug:goal.channel_slug,sourceType:"community_goal",sourceId:goalCode,
      actorType:"fan",actorId:userId,
    });
    if(ledger===null)return{claimed:false,alreadyProcessed:true};
    const claim=await client.query(
      `INSERT INTO passport_community_goal_claims(goal_code,user_id,grant_key)
       VALUES($1,$2,$3) ON CONFLICT(goal_code,user_id) DO NOTHING RETURNING claimed_at`,
      [goalCode,userId,key],
    );
    if(!claim.rows[0])return{claimed:false,alreadyClaimed:true};
    await applyJsonReward(client,userId,goal.reward,key,"community_goal",goalCode,goal.channel_slug);
    return{claimed:true,reward:goal.reward};
  });
}

export async function craftPassportCards(
  userId:string,
  input:{recipeCode:string;cardIds:string[];idempotencyKey:string},
){
  await consumePassportRateLimit(userId,"card.craft");
  return withTransaction(async(client)=>{
    await ensurePassportProfile(client,userId);
    const key=`craft:${userId}:${input.idempotencyKey}`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[key]);
    const existing=await client.query(
      `SELECT 1 FROM passport_ledger WHERE idempotency_key=$1 AND action='card.craft'`,
      [key],
    );
    if(existing.rows[0])return{crafted:false,alreadyProcessed:true};

    const recipe=(await client.query<{
      input_count:number;
      input_rarity:string|null;
      input_channel_slug:string|null;
      output_type:"cosmetic"|"sparks";
      output_code:string|null;
      output_amount:number;
    }>(`SELECT * FROM passport_crafting_recipes WHERE code=$1 AND active FOR UPDATE`,[input.recipeCode])).rows[0];
    if(!recipe)throw new PassportError("not_found",404,"recipe_not_found");
    if(recipe.output_type==="cosmetic"&&!recipe.output_code){
      throw new PassportError("invalid_state",409,"craft_recipe_output_missing");
    }
    if(input.cardIds.length!==recipe.input_count||new Set(input.cardIds).size!==input.cardIds.length){
      throw new PassportError("invalid_input",400,"wrong_recipe_inputs");
    }

    if(recipe.output_type==="cosmetic"&&recipe.output_code){
      const output=await client.query<{state:string}>(
        `SELECT state FROM passport_cosmetic_unlocks
          WHERE user_id=$1 AND cosmetic_code=$2 FOR UPDATE`,
        [userId,recipe.output_code],
      );
      if(output.rows[0]?.state==="active"){
        throw new PassportError("not_eligible",403,"cosmetic_already_owned");
      }
    }

    // Discover edition ids first, then serialize all crafts for each
    // user/edition pair. Locking only the selected cards lets two concurrent
    // crafts burn different final copies after both observe the same count.
    const selectedEditions=await client.query<{edition_id:string}>(
      `SELECT DISTINCT edition_id::text FROM passport_cards
        WHERE owner_user_id=$1 AND id=ANY($2::uuid[])`,
      [userId,input.cardIds],
    );
    if(!selectedEditions.rows.length)throw new PassportError("forbidden",403,"card_not_available");
    for(const editionId of selectedEditions.rows.map(row=>row.edition_id).sort()){
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`${userId}:${editionId}`]);
    }

    const cards=await client.query<{
      id:string;edition_id:string;rarity:string;channel_slug:string;
      craft_value:number;owned_count:string;
    }>(`SELECT c.id::text,c.edition_id::text,e.rarity,e.channel_slug,e.craft_value,
              (SELECT COUNT(*) FROM passport_cards own
                WHERE own.owner_user_id=$1 AND own.edition_id=c.edition_id AND own.state='active')::text owned_count
          FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id
         WHERE c.owner_user_id=$1 AND c.id=ANY($2::uuid[]) AND c.state='active'
         FOR UPDATE OF c`,[userId,input.cardIds]);
    if(cards.rows.length!==input.cardIds.length)throw new PassportError("forbidden",403,"card_not_available");
    if(cards.rows.some(card=>card.craft_value<=0
      ||(recipe.input_rarity&&card.rarity!==recipe.input_rarity)
      ||(recipe.input_channel_slug&&card.channel_slug!==recipe.input_channel_slug))){
      throw new PassportError("not_eligible",403,"card_not_craftable");
    }
    const selectedByEdition=new Map<string,number>();
    for(const card of cards.rows){
      selectedByEdition.set(card.edition_id,(selectedByEdition.get(card.edition_id)??0)+1);
    }
    for(const card of cards.rows){
      if((selectedByEdition.get(card.edition_id)??0)>=Number(card.owned_count)){
        throw new PassportError("not_eligible",403,"must_keep_one_copy");
      }
    }

    const ledger=await appendPassportLedger(client,{
      idempotencyKey:key,userId,action:"card.craft",assetType:"recipe",assetId:input.recipeCode,
      sourceType:"craft",sourceId:input.recipeCode,actorType:"fan",actorId:userId,
      data:{cardIds:input.cardIds},
    });
    if(ledger===null)return{crafted:false,alreadyProcessed:true};
    await prunePassportAssetReferences(client,userId,{cardIds:input.cardIds,achievementCodes:[],cosmeticCodes:[]});
    const consumed=await client.query(
      `UPDATE passport_cards SET state='crafted',lock_reason=NULL,updated_at=now()
        WHERE owner_user_id=$1 AND id=ANY($2::uuid[]) AND state='active'`,
      [userId,input.cardIds],
    );
    if((consumed.rowCount??0)!==input.cardIds.length)throw new PassportError("conflict",409,"craft_integrity_failed");
    if(recipe.output_type==="sparks"){
      await addSparksInTransaction(client,{userId,amount:recipe.output_amount,idempotencyKey:`${key}:sparks`,sourceType:"craft",sourceId:input.recipeCode,actorType:"fan",actorId:userId});
    }else if(recipe.output_code){
      const unlocked=await unlockCosmeticInTransaction(client,{userId,cosmeticCode:recipe.output_code,grantKey:`${key}:cosmetic`,sourceType:"craft",sourceId:input.recipeCode,actorType:"fan",actorId:userId});
      if(!unlocked)throw new PassportError("conflict",409,"craft_output_not_delivered");
    }
    return{crafted:true,output:{type:recipe.output_type,code:recipe.output_code,amount:recipe.output_amount}};
  });
}

export async function createPassportAppeal(userId:string,input:{subjectType:string;subjectId:string;reason:string;idempotencyKey:string}){await consumePassportRateLimit(userId,"appeal.create");return withTransaction(async(client)=>{const key=`appeal:${userId}:${input.idempotencyKey}`;const ledger=await appendPassportLedger(client,{idempotencyKey:key,userId,action:"appeal.create",assetType:"appeal",assetId:input.subjectId,sourceType:input.subjectType,sourceId:input.subjectId,actorType:"fan",actorId:userId});if(ledger===null){const existing=await client.query(`SELECT * FROM passport_appeals WHERE user_id=$1 AND subject_type=$2 AND subject_id=$3 AND state IN('open','under_review')`,[userId,input.subjectType,input.subjectId]);return existing.rows[0]??{duplicate:true};}const row=(await client.query(`INSERT INTO passport_appeals(user_id,subject_type,subject_id,reason) VALUES($1,$2,$3,$4) RETURNING *`,[userId,input.subjectType,input.subjectId,input.reason])).rows[0];return row;});}

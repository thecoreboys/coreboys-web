import "server-only";

import { createHash } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { recordPassportActivity } from "@/lib/passport/activity";
import { consumePassportRateLimit } from "@/lib/passport/internal";
import {
  passportWatchCompletionMinimum,
  passportPlaybackProviderIds,
  PassportError,
  serverCreditedWatchSeconds,
} from "@/lib/passport/policy";

export type PassportWatchProgressInput={
  userId:string;
  playbackRef:string;
  kind:string;
  platform:string;
  positionSeconds:number;
  complete:boolean;
};

type CanonicalWatchAsset={playbackRef:string;channelSlug:string;durationSeconds:number|null;shortForm:boolean};

function safePlaybackIdentifier(value:string):string{
  const normalized=value.trim();
  if(!normalized||normalized.length>200||!/^[\x21-\x7e]+$/.test(normalized))throw new PassportError("invalid_input",400,"invalid_playback_ref");
  return normalized;
}

async function resolveCanonicalWatchAsset(
  client:Parameters<Parameters<typeof withTransaction>[0]>[0],
  playbackRef:string,
  platformInput:string,
):Promise<CanonicalWatchAsset>{
  const ref=safePlaybackIdentifier(playbackRef);
  const platform=platformInput.trim().toLowerCase();
  if(!/^[a-z][a-z0-9_-]{1,39}$/.test(platform))throw new PassportError("invalid_input",400,"invalid_playback_kind");
  const providerIds=passportPlaybackProviderIds(ref,platform);
  const registered=await client.query<{playback_ref:string;channel_slug:string;duration_seconds:number|null;short_form:boolean}>(
    `SELECT playback_ref,channel_slug,duration_seconds,short_form FROM passport_watch_assets
      WHERE platform=$2 AND last_seen_at>=now()-interval '90 days'
        AND kind IN ('youtube','vod','clip','tour')
        AND (playback_ref=$1 OR $1=ANY(aliases) OR aliases&&$3::text[])
      ORDER BY last_seen_at DESC LIMIT 1`,[ref,platform,[...providerIds,...providerIds.map(id=>`${platform}:${id}`)]],
  );
  if(registered.rows[0]){
    const asset=registered.rows[0];
    return{playbackRef:asset.playback_ref,channelSlug:asset.channel_slug,durationSeconds:asset.duration_seconds&&asset.duration_seconds>0?Math.floor(asset.duration_seconds):null,shortForm:asset.short_form};
  }
  const result=await client.query<{playback_ref:string;channel_slug:string;duration_seconds:number|null;short_form:boolean}>(`SELECT ci.platform::text||':'||ci.external_id AS playback_ref,m.slug AS channel_slug,ci.duration_seconds,(ci.kind::text='short') AS short_form
    FROM content_items ci JOIN members m ON m.id=ci.member_id
    WHERE ci.platform::text=$2
      AND ci.deleted_at IS NULL
      AND ci.kind::text IN ('video','short','clip','vod')
      AND (ci.url=$1 OR ci.external_id=ANY($3::text[]) OR ci.platform::text||':'||ci.external_id=$1)
    ORDER BY ci.ingested_at DESC LIMIT 1`,[ref,platform,providerIds]);
  const row=result.rows[0];
  if(!row)throw new PassportError("not_eligible",403,"unknown_playback_ref");
  return{playbackRef:row.playback_ref,channelSlug:row.channel_slug,durationSeconds:row.duration_seconds&&row.duration_seconds>0?Math.floor(row.duration_seconds):null,shortForm:row.short_form};
}

function watchSourceKey(playbackRef:string):string{
  return createHash("sha256").update(playbackRef).digest("hex").slice(0,32);
}

async function reserveCompletionCadence(userId:string):Promise<string|null>{
  return withTransaction(async(client)=>{
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`passport-watch-completion:${userId}`]);
    const cursor=(await client.query<{last_completion_at:string|null}>(`SELECT last_completion_at::text FROM passport_watch_credit_cursors WHERE user_id=$1 FOR UPDATE`,[userId])).rows[0];
    if(!cursor)return null;
    if(cursor.last_completion_at&&Date.now()-new Date(cursor.last_completion_at).getTime()<10*60*1000)return null;
    const reservedAt=new Date().toISOString();
    await client.query(`UPDATE passport_watch_credit_cursors SET last_completion_at=$2,updated_at=now() WHERE user_id=$1`,[userId,reservedAt]);
    return reservedAt;
  });
}

export async function recordPassportWatchProgress(input:PassportWatchProgressInput){
  await consumePassportRateLimit(input.userId,"watch.progress");
  if(!Number.isFinite(input.positionSeconds)||input.positionSeconds<0||input.positionSeconds>7*24*60*60)throw new PassportError("invalid_input",400,"invalid_playback_position");
  const receivedAt=new Date();
  const snapshot=await withTransaction(async(client)=>{
    const asset=await resolveCanonicalWatchAsset(client,input.playbackRef,input.platform);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`passport-watch:${input.userId}`]);
    const cursor=(await client.query<{last_playback_ref:string;last_tick_at:string}>(`SELECT last_playback_ref,last_tick_at::text FROM passport_watch_credit_cursors WHERE user_id=$1 FOR UPDATE`,[input.userId])).rows[0]??null;
    const session=(await client.query<{last_position_seconds:number;credited_seconds:number;projected_seconds:number;completion_requested_at:string|null;completion_projected_at:string|null}>(`SELECT last_position_seconds,credited_seconds,projected_seconds,completion_requested_at::text,completion_projected_at::text FROM passport_watch_sessions WHERE user_id=$1 AND playback_ref=$2 FOR UPDATE`,[input.userId,asset.playbackRef])).rows[0]??null;
    let creditedSeconds=serverCreditedWatchSeconds({
      previousPositionSeconds:session?.last_position_seconds ?? null,
      currentPositionSeconds:Math.floor(input.positionSeconds),
      previousGlobalTickAt:cursor?new Date(cursor.last_tick_at):null,
      receivedAt,
      sameCanonicalRef:cursor?.last_playback_ref===asset.playbackRef,
    });
    const creditCeiling=asset.durationSeconds ?? 6*60*60;
    creditedSeconds=Math.min(creditedSeconds,Math.max(0,creditCeiling-(session?.credited_seconds ?? 0)));
    const completionPositionMinimum=asset.durationSeconds
      ? Math.min(asset.durationSeconds,Math.max(5,Math.ceil(asset.durationSeconds*.85)))
      : asset.shortForm?10:300;
    const plausibleCompletion=input.complete&&input.positionSeconds>=completionPositionMinimum;
    await client.query(`INSERT INTO passport_watch_credit_cursors(user_id,last_playback_ref,last_tick_at) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET last_playback_ref=EXCLUDED.last_playback_ref,last_tick_at=EXCLUDED.last_tick_at,updated_at=now()`,[input.userId,asset.playbackRef,receivedAt.toISOString()]);
    const row=(await client.query<{credited_seconds:number;projected_seconds:number;completion_requested_at:string|null;completion_projected_at:string|null}>(`INSERT INTO passport_watch_sessions(user_id,playback_ref,channel_slug,last_position_seconds,duration_seconds,credited_seconds,completion_requested_at,last_tick_at)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN $8::timestamptz ELSE NULL END,$8)
      ON CONFLICT(user_id,playback_ref) DO UPDATE SET channel_slug=EXCLUDED.channel_slug,last_position_seconds=EXCLUDED.last_position_seconds,
        duration_seconds=COALESCE(EXCLUDED.duration_seconds,passport_watch_sessions.duration_seconds),credited_seconds=passport_watch_sessions.credited_seconds+EXCLUDED.credited_seconds,
        completion_requested_at=CASE WHEN $7 THEN COALESCE(passport_watch_sessions.completion_requested_at,$8::timestamptz) ELSE passport_watch_sessions.completion_requested_at END,
        last_tick_at=EXCLUDED.last_tick_at,updated_at=now()
      RETURNING credited_seconds,projected_seconds,completion_requested_at::text,completion_projected_at::text`,[input.userId,asset.playbackRef,asset.channelSlug,Math.floor(input.positionSeconds),asset.durationSeconds,creditedSeconds,plausibleCompletion,receivedAt.toISOString()])).rows[0]!;
    return{asset,creditedSeconds,row};
  });

  const sourceKey=watchSourceKey(snapshot.asset.playbackRef);
  const firstChunk=Math.floor(snapshot.row.projected_seconds/300)+1;
  const lastChunk=Math.floor(snapshot.row.credited_seconds/300);
  for(let chunk=firstChunk;chunk<=lastChunk;chunk++){
    await recordPassportActivity({userId:input.userId,metric:"watch_seconds",amount:300,channelSlug:snapshot.asset.channelSlug,sourceType:"watch_progress",sourceId:snapshot.asset.playbackRef,idempotencyKey:`watch:${sourceKey}:chunk:${chunk}`});
    await query(`UPDATE passport_watch_sessions SET projected_seconds=GREATEST(projected_seconds,$3),updated_at=now() WHERE user_id=$1 AND playback_ref=$2`,[input.userId,snapshot.asset.playbackRef,chunk*300]);
  }
  const completionMinimum=passportWatchCompletionMinimum(snapshot.asset.durationSeconds,snapshot.asset.shortForm);
  let completionProjected=Boolean(snapshot.row.completion_projected_at);
  if(snapshot.row.completion_requested_at&&!completionProjected&&snapshot.row.credited_seconds>=completionMinimum){
    const reservedAt=await reserveCompletionCadence(input.userId);
    if(reservedAt){
      try{
        await recordPassportActivity({userId:input.userId,metric:"video_complete",amount:1,channelSlug:snapshot.asset.channelSlug,sourceType:"watch_progress",sourceId:snapshot.asset.playbackRef,idempotencyKey:`watch:${sourceKey}:complete`});
        await query(`UPDATE passport_watch_sessions SET completion_projected_at=COALESCE(completion_projected_at,now()),updated_at=now() WHERE user_id=$1 AND playback_ref=$2`,[input.userId,snapshot.asset.playbackRef]);
        completionProjected=true;
      }catch(error){
        await query(`UPDATE passport_watch_credit_cursors SET last_completion_at=NULL,updated_at=now() WHERE user_id=$1 AND last_completion_at=$2::timestamptz`,[input.userId,reservedAt]);
        throw error;
      }
    }
  }
  return{canonicalPlaybackRef:snapshot.asset.playbackRef,creditedSeconds:snapshot.creditedSeconds,totalCreditedSeconds:snapshot.row.credited_seconds,completionMinimumSeconds:completionMinimum,completionProjected};
}

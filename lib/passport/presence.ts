import "server-only";

import { withTransaction } from "@/lib/db";
import { recordPassportActivity } from "@/lib/passport/activity";
import {
  appendPassportLedger,
  consumePassportRateLimit,
  grantEditionCardInTransaction,
  hashPassportSession,
} from "@/lib/passport/internal";
import {
  creditedHeartbeatSeconds,
  presenceIsEligible,
  PassportError,
} from "@/lib/passport/policy";
import type { PassportClaimPayload, PassportHeartbeatPayload } from "@/lib/passport/types";

export async function recordPassportHeartbeat(userId: string, payload: PassportHeartbeatPayload) {
  await consumePassportRateLimit(userId, "presence.heartbeat");
  return withTransaction(async (client) => {
    const eventResult = await client.query<{
      id: string;
      channel_slug: string;
      external_ref: string | null;
      starts_at: string;
      ends_at: string | null;
      state: string;
      attendance_grace_seconds: number;
      heartbeat_interval_seconds: number;
      minimum_watch_seconds: number;
    }>(
      `SELECT id::text, channel_slug, external_ref, starts_at::text,
              ends_at::text, state, attendance_grace_seconds,
              heartbeat_interval_seconds, minimum_watch_seconds
         FROM passport_events
        WHERE id = $1
        FOR SHARE`,
      [payload.eventId],
    );
    const event = eventResult.rows[0];
    if (!event) throw new PassportError("not_found", 404, "event_not_found");
    if (event.state !== "live") throw new PassportError("invalid_state", 409, "event_not_live");
    if (!event.external_ref)throw new PassportError("invalid_state",409,"event_playback_ref_required");
    if (event.external_ref !== payload.playbackRef) {
      throw new PassportError("forbidden", 403, "playback_does_not_match_event");
    }
    const receivedAt = new Date();
    const graceMs = event.attendance_grace_seconds * 1000;
    if (receivedAt.getTime() < new Date(event.starts_at).getTime() - graceMs) {
      throw new PassportError("invalid_state", 409, "event_not_started");
    }
    if (event.ends_at && receivedAt.getTime() > new Date(event.ends_at).getTime() + graceMs) {
      throw new PassportError("expired", 410, "attendance_window_closed");
    }

    const sessionHash = hashPassportSession(payload.sessionId);
    // Serializes heartbeats for one viewer/event, preventing two tabs from
    // both receiving elapsed-time credit for the same wall-clock interval.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`passport-presence:${payload.eventId}:${userId}`],
    );
    const previous = await client.query<{ received_at: string;playing:boolean;visible:boolean;playback_position_seconds:number;session_hash:string }>(
      `SELECT received_at::text,playing,visible,playback_position_seconds,session_hash
         FROM passport_presence_heartbeats
        WHERE event_id = $1 AND user_id = $2
        ORDER BY received_at DESC
        LIMIT 1`,
      [payload.eventId, userId],
    );
    const creditedSeconds = creditedHeartbeatSeconds({
      previousReceivedAt: previous.rows[0] ? new Date(previous.rows[0].received_at) : null,
      receivedAt,
      heartbeatIntervalSeconds: event.heartbeat_interval_seconds,
      previousPlaying:previous.rows[0]?.playing ?? false,
      previousVisible:previous.rows[0]?.visible ?? false,
      previousPositionSeconds:previous.rows[0]?.playback_position_seconds ?? null,
      currentPositionSeconds:payload.positionSeconds,
      sameSession:previous.rows[0]?.session_hash===sessionHash,
      playing: payload.playing,
      visible: payload.visible,
    });
    await client.query(
      `INSERT INTO passport_presence_heartbeats
         (event_id,user_id,session_hash,playback_ref,playback_position_seconds,
          playing,visible,credited_seconds,received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [payload.eventId,userId,sessionHash,payload.playbackRef,payload.positionSeconds,payload.playing,payload.visible,creditedSeconds,receivedAt.toISOString()],
    );
    const presence = await client.query<{
      watch_seconds: number;
      heartbeat_count: number;
      state: string;
    }>(
      `INSERT INTO passport_event_presence
         (event_id,user_id,first_seen_at,last_seen_at,watch_seconds,heartbeat_count,proof_hash,state)
       VALUES ($1,$2,$3,$3,$4,1,$5,'observed')
       ON CONFLICT (event_id,user_id) DO UPDATE
         SET last_seen_at = EXCLUDED.last_seen_at,
             watch_seconds = passport_event_presence.watch_seconds + EXCLUDED.watch_seconds,
             heartbeat_count = passport_event_presence.heartbeat_count + 1,
             proof_hash = EXCLUDED.proof_hash,
             state = CASE
               WHEN passport_event_presence.state IN ('verified','revoked','rejected') THEN passport_event_presence.state
               WHEN passport_event_presence.watch_seconds + EXCLUDED.watch_seconds >= $6
                AND passport_event_presence.heartbeat_count + 1 >= 2 THEN 'eligible'
               ELSE 'observed'
             END,
             updated_at = now()
       RETURNING watch_seconds, heartbeat_count, state`,
      [payload.eventId,userId,receivedAt.toISOString(),creditedSeconds,sessionHash,event.minimum_watch_seconds],
    );
    const row = presence.rows[0]!;
    return {
      eventId: payload.eventId,
      creditedSeconds,
      watchSeconds: row.watch_seconds,
      heartbeatCount: row.heartbeat_count,
      eligible: presenceIsEligible({
        watchSeconds: row.watch_seconds,
        minimumWatchSeconds: event.minimum_watch_seconds,
        heartbeatCount: row.heartbeat_count,
      }),
      nextHeartbeatSeconds: event.heartbeat_interval_seconds,
    };
  });
}

async function momentEligible(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  userId: string,
  edition: { moment_id: string | null; event_id: string },
): Promise<boolean> {
  if (!edition.moment_id) return true;
  const result = await client.query<{ credited: string; minimum: number }>(
    `SELECT COALESCE(SUM(h.credited_seconds),0)::text AS credited,
            MAX(m.minimum_presence_seconds) AS minimum
       FROM passport_moments m
       JOIN passport_events e ON e.id = m.event_id
       LEFT JOIN passport_presence_heartbeats h
         ON h.event_id = e.id AND h.user_id = $2
        AND h.playing AND h.visible
        AND h.received_at BETWEEN
          e.starts_at + make_interval(secs => m.offset_seconds - m.eligibility_before_seconds)
          AND e.starts_at + make_interval(secs => m.offset_seconds + m.eligibility_after_seconds)
      WHERE m.id = $1 AND m.state IN ('published','sealed')
      GROUP BY m.id`,
    [edition.moment_id, userId],
  );
  const row = result.rows[0];
  return Boolean(row && Number(row.credited) >= row.minimum);
}

export async function claimPassportPresence(userId: string, payload: PassportClaimPayload) {
  await consumePassportRateLimit(userId, "presence.claim");
  const result = await withTransaction(async (client) => {
    const eventResult = await client.query<{
      id: string;
      code: string;
      channel_slug: string;
      title: string;
      state: string;
      minimum_watch_seconds: number;
    }>(
      `SELECT id::text,code,channel_slug,title,state,minimum_watch_seconds
         FROM passport_events WHERE id=$1 FOR UPDATE`,
      [payload.eventId],
    );
    const event = eventResult.rows[0];
    if (!event) throw new PassportError("not_found", 404, "event_not_found");
    if (event.state!=="certified") {
      throw new PassportError("invalid_state",409,"event_requires_independent_certification");
    }
    const staffLinked=await client.query<{linked:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM fan_users f JOIN admin_users a ON lower(a.email)=lower(f.email)
      WHERE f.id=$1 AND a.deleted_at IS NULL
    ) AS linked`,[userId]);
    if(staffLinked.rows[0]?.linked){
      throw new PassportError("forbidden",403,"staff_accounts_cannot_claim_attendance");
    }
    const presenceResult = await client.query<{
      watch_seconds: number;
      heartbeat_count: number;
      state: string;
    }>(
      `SELECT watch_seconds,heartbeat_count,state
         FROM passport_event_presence
        WHERE event_id=$1 AND user_id=$2
        FOR UPDATE`,
      [payload.eventId,userId],
    );
    const presence = presenceResult.rows[0];
    if (!presence || presence.state === "revoked" || presence.state === "rejected") {
      throw new PassportError("not_eligible", 403, "verified_presence_required");
    }
    if (!presenceIsEligible({
      watchSeconds: presence.watch_seconds,
      minimumWatchSeconds: event.minimum_watch_seconds,
      heartbeatCount: presence.heartbeat_count,
    })) {
      throw new PassportError("not_eligible", 403, "minimum_watch_not_met");
    }
    const editions = await client.query<{
      id: string;
      moment_id: string | null;
      event_id: string;
      code: string;
      variant: string;
    }>(
      `SELECT id::text,moment_id::text,event_id::text,code,variant
        FROM passport_card_editions
        WHERE event_id=$1
          AND state = 'published'
          AND account_bound = true
          AND ($2::uuid IS NULL OR id=$2)`,
      [payload.eventId,payload.editionId ?? null],
    );
    if (payload.editionId && editions.rows.length === 0) {
      throw new PassportError("not_found",404,"edition_not_found");
    }
    const cards = [];
    const unavailableEditions: Array<{editionId:string;reason:"sold_out"}> = [];
    for (const edition of editions.rows) {
      if (!await momentEligible(client,userId,edition)) continue;
      try {
        const card = await grantEditionCardInTransaction(client,{
          userId,
          editionId:edition.id,
          claimKey:`presence:${userId}:${edition.id}`,
          acquiredVia:edition.moment_id ? "moment" : "attendance",
          provenance:{eventId:event.id,eventCode:event.code,eventTitle:event.title,momentId:edition.moment_id,variant:edition.variant},
          actorType:"fan",
          actorId:userId,
          sourceType:edition.moment_id ? "moment" : "event",
          sourceId:edition.moment_id ?? event.id,
        });
        if(card) cards.push(card);
      } catch(error) {
        if(error instanceof PassportError && error.code==="not_eligible" && error.message==="edition_sold_out") {
          unavailableEditions.push({editionId:edition.id,reason:"sold_out"});
          continue;
        }
        throw error;
      }
    }
    const attendanceKey=`attendance:${userId}:${event.id}`;
    const newlyVerified=await appendPassportLedger(client,{
      idempotencyKey:attendanceKey,userId,action:"presence.verify",assetType:"attendance",assetId:event.id,
      channelSlug:event.channel_slug,sourceType:"event",sourceId:event.id,actorType:"system",
      data:{watchSeconds:presence.watch_seconds,heartbeatCount:presence.heartbeat_count},
    });
    if(newlyVerified!==null){
      await client.query(`INSERT INTO passport_channel_progress(user_id,channel_slug,events_attended,last_active_at)
        VALUES($1,$2,1,now()) ON CONFLICT(user_id,channel_slug) DO UPDATE SET events_attended=passport_channel_progress.events_attended+1,last_active_at=now(),updated_at=now()`,[userId,event.channel_slug]);
    }
    await client.query(`UPDATE passport_event_presence SET state='verified',verified_at=COALESCE(verified_at,now()),claimed_at=now(),updated_at=now() WHERE event_id=$1 AND user_id=$2`,[event.id,userId]);
    return {event,cards,unavailableEditions,newlyVerified:newlyVerified!==null};
  });
  await recordPassportActivity({userId,metric:"event_attendance",amount:1,channelSlug:result.event.channel_slug,sourceType:"event",sourceId:result.event.id,idempotencyKey:`verified:${result.event.id}`});
  await recordPassportActivity({userId,metric:"events_attended",amount:1,channelSlug:result.event.channel_slug,sourceType:"event",sourceId:result.event.id,idempotencyKey:`achievement:${result.event.id}`});
  return {eventId:result.event.id,awardedCards:result.cards,unavailableEditions:result.unavailableEditions,newlyVerified:result.newlyVerified};
}

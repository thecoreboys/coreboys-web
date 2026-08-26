import "server-only";

import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { drainPassportActivityOutbox, enqueuePassportActivity } from "@/lib/passport/activity";
import {
  addSparksInTransaction,
  appendPassportLedger,
  awardPassportXpInTransaction,
  ensurePassportProfile,
  grantEditionCardInTransaction,
  prunePassportAssetReferences,
  unlockCosmeticInTransaction,
} from "@/lib/passport/internal";
import {
  assertPassportEligibleRewardRecipients,
  assertPassportNoSelfGrant,
  passportCompensatingDelta,
  passportEventTransitionAllowed,
  passportPollTransitionAllowed,
  passportCurrencyRewardPolicy,
  PassportError,
} from "@/lib/passport/policy";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { getWatchCatalog } from "@/lib/watch/catalog";

export type PassportActor = {
  id: string;
  email: string;
  role: "admin" | "member_manager";
  memberSlug: string | null;
};

export const PASSPORT_MODERATOR_ROLES = [
  "channel_lead", "live_producer", "chat_guardian", "poll_host",
  "scorekeeper", "moment_archivist", "reward_curator", "judge", "analyst",
] as const;

export const PASSPORT_PERMISSIONS = [
  "poll.create", "poll.publish", "poll.lock", "poll.certify",
  "score.revise", "score.certify", "moment.create", "moment.publish",
  "edition.seal", "reward.nominate", "reward.approve", "reward.revoke",
  "event.manage", "channel.freeze", "chat.freeze", "appeal.review",
] as const;

export type PassportModeratorRole = (typeof PASSPORT_MODERATOR_ROLES)[number];
export type PassportPermission = (typeof PASSPORT_PERMISSIONS)[number];

export type PassportAdminOverview = {
  effectivePermissions?: PassportPermission[];
  dutyPermissions?: PassportPermission[];
  onDuty?: boolean;
  staffCandidates: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  activeShifts: Array<Record<string, unknown>>;
  channelControls: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  scores: Array<Record<string, unknown>>;
  polls: Array<Record<string, unknown>>;
  moments: Array<Record<string, unknown>>;
  editions: Array<Record<string, unknown>>;
  nominations: Array<Record<string, unknown>>;
  appeals: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  eligibleRecipients: Array<{id:string;displayName:string;publicSlug:string|null}>;
  rewardRecipients: Array<{id:string;displayName:string;publicSlug:string|null}>;
  presenceRecords?:Array<Record<string,unknown>>;
};

type Scope = { channelSlug?: string | null; eventId?: string | null };

async function audit(
  client: PoolClient,
  actor: PassportActor,
  action: string,
  scopeType: string,
  scopeId: string | null,
  reason: string | null,
  previous: unknown,
  next: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO passport_admin_audit
       (actor_id, actor_email, action, scope_type, scope_id, reason, previous, next)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [actor.id, actor.email, action, scopeType, scopeId, reason, JSON.stringify(previous ?? null), JSON.stringify(next ?? null)],
  );
}

async function eventChannel(client: PoolClient, eventId: string | null | undefined): Promise<string | null> {
  if (!eventId) return null;
  const result = await client.query<{ channel_slug: string }>(
    `SELECT channel_slug FROM passport_events WHERE id = $1`,
    [eventId],
  );
  return result.rows[0]?.channel_slug ?? null;
}

async function assertEventChannel(client:PoolClient,eventId:string,channelSlug:string):Promise<void>{
  const result=await client.query<{channel_slug:string}>(`SELECT channel_slug FROM passport_events WHERE id=$1`,[eventId]);
  if(!result.rows[0])throw new PassportError("not_found",404,"event_not_found");
  if(result.rows[0].channel_slug!==channelSlug)throw new PassportError("forbidden",403,"event_channel_mismatch");
}

type PassportFreezeTarget="polls"|"scores"|"rewards"|"moments"|"chat";
async function passportControlFrozen(client:PoolClient,channelSlug:string,eventId:string|null|undefined,target:PassportFreezeTarget):Promise<boolean>{
  const column=`${target}_frozen`;
  const result=await client.query<{frozen:boolean}>(`SELECT COALESCE(bool_or(${column}),false) AS frozen FROM passport_channel_controls
    WHERE channel_slug=$1 AND (scope_key='*' OR scope_key=$2)`,[channelSlug,eventId ?? "*"]);
  return Boolean(result.rows[0]?.frozen);
}

async function requirePermission(
  client: PoolClient,
  actor: PassportActor,
  permission: PassportPermission,
  scope: Scope = {},
  options: { shiftRequired?: boolean } = {},
): Promise<void> {
  if (actor.role === "admin") return;
  const channelSlug = scope.channelSlug ?? await eventChannel(client, scope.eventId);
  if(!channelSlug||!actor.memberSlug||actor.memberSlug!==channelSlug)throw new PassportError("forbidden",403,"member_channel_scope_mismatch");
  const result = await client.query<{ id: string }>(
    `SELECT a.id::text
       FROM passport_moderator_assignments a
       ${options.shiftRequired ? "JOIN passport_moderator_shifts s ON s.assignment_id = a.id AND s.ended_at IS NULL" : ""}
      WHERE a.staff_user_id = $1::uuid
        AND a.revoked_at IS NULL
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND $2 = ANY(a.permissions)
        AND (a.channel_slug IS NULL OR a.channel_slug = $3)
        AND (a.event_id IS NULL OR a.event_id = $4::uuid)
      LIMIT 1`,
    [actor.id, permission, channelSlug, scope.eventId ?? null],
  );
  if (!result.rows[0]) throw new PassportError("forbidden", 403, `missing_permission:${permission}`);
}

async function requireChannelLead(client:PoolClient,actor:PassportActor,channelSlug:string,eventId:string):Promise<void>{
  if(actor.role==="admin")return;
  if(!actor.memberSlug||actor.memberSlug!==channelSlug)throw new PassportError("forbidden",403,"member_channel_scope_mismatch");
  const result=await client.query(`SELECT 1 FROM passport_moderator_assignments
    WHERE staff_user_id=$1::uuid AND revoked_at IS NULL AND 'channel_lead'=ANY(roles)
      AND (channel_slug IS NULL OR channel_slug=$2) AND (event_id IS NULL OR event_id=$3::uuid)
      AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) LIMIT 1`,[actor.id,channelSlug,eventId]);
  if(!result.rows[0])throw new PassportError("forbidden",403,"signed_editions_require_channel_lead");
}

export async function getPassportAdminOverview(
  actor: PassportActor,
  filters: { channelSlug?: string; eventId?: string; limit?: number } = {},
): Promise<PassportAdminOverview> {
  // Direct Studio navigation must refresh the authoritative live registry;
  // requiring some unrelated fan to open Watch first would make Go live
  // nondeterministically unavailable after an idle period.
  await getWatchCatalog();
  const limit = Math.max(10, Math.min(filters.limit ?? 100, 250));
  if(actor.role!=="admin"&&(!actor.memberSlug||(filters.channelSlug&&filters.channelSlug!==actor.memberSlug)))throw new PassportError("forbidden",403);
  const channelSlug=actor.role==="admin"?(filters.channelSlug ?? null):actor.memberSlug;
  const empty=Promise.resolve({rows:[] as Array<Record<string,unknown>>});
  const [staff, assignments, shifts, controls, events, scores, polls, moments, editions, nominations, appeals, auditRows] = await Promise.all([
    actor.role==="admin"?query(`SELECT id::text, email, display_name AS "displayName", role, member_slug AS "memberSlug"
             FROM admin_users WHERE deleted_at IS NULL ORDER BY display_name`):empty,
    query(`SELECT a.*, ${actor.role==="admin"?"u.email":"NULL::text"} AS email, u.display_name FROM passport_moderator_assignments a
            JOIN admin_users u ON u.id = a.staff_user_id
           WHERE ($1::text IS NULL OR a.channel_slug = $1)
           ORDER BY a.created_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT s.*, a.staff_user_id, a.channel_slug, a.event_id, a.roles,
                  u.display_name, ${actor.role==="admin"?"u.email":"NULL::text"} AS email
             FROM passport_moderator_shifts s JOIN passport_moderator_assignments a ON a.id=s.assignment_id
             JOIN admin_users u ON u.id=a.staff_user_id
            WHERE s.ended_at IS NULL AND ($1::text IS NULL OR a.channel_slug=$1)
            ORDER BY s.started_at DESC`, [channelSlug]),
    query(`SELECT * FROM passport_channel_controls
            WHERE ($1::text IS NULL OR channel_slug=$1) ORDER BY channel_slug`, [channelSlug]),
    query(`SELECT * FROM passport_events
            WHERE ($1::text IS NULL OR channel_slug=$1) AND ($2::uuid IS NULL OR id=$2)
            ORDER BY starts_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT s.*, COALESCE((SELECT json_agg(r ORDER BY r.revision DESC)
                                  FROM passport_score_revisions r
                                 WHERE r.event_id=s.event_id),'[]') AS revisions
             FROM passport_event_scores s JOIN passport_events e ON e.id=s.event_id
            WHERE ($1::text IS NULL OR e.channel_slug=$1) AND ($2::uuid IS NULL OR s.event_id=$2)
            ORDER BY s.updated_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT p.*, ${actor.role==="admin"?"p.created_by":"COALESCE(creator.display_name,'Staff')"} AS created_by,
                  COALESCE((SELECT json_agg(json_build_object(
                    'id',o.id,'label',o.label,'position',o.position,
                    'votes',(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id)
                  ) ORDER BY o.position) FROM poll_options o WHERE o.poll_id=p.id),'[]') AS options
             FROM polls p
        LEFT JOIN admin_users creator ON creator.id::text=p.created_by OR lower(creator.email)=lower(p.created_by)
            WHERE ($1::text IS NULL OR p.channel_slug=$1) AND ($2::uuid IS NULL OR p.passport_event_id=$2)
            ORDER BY p.created_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT m.*, e.channel_slug, e.title AS event_title FROM passport_moments m
            JOIN passport_events e ON e.id=m.event_id
           WHERE ($1::text IS NULL OR e.channel_slug=$1) AND ($2::uuid IS NULL OR m.event_id=$2)
           ORDER BY m.created_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT ce.*, ev.title AS event_title,
                  (SELECT COUNT(*) FROM passport_cards pc WHERE pc.edition_id=ce.id)::integer AS issued_count
             FROM passport_card_editions ce
            LEFT JOIN passport_events ev ON ev.id=ce.event_id
           WHERE ($1::text IS NULL OR ce.channel_slug=$1) AND ($2::uuid IS NULL OR ce.event_id=$2)
           ORDER BY ce.created_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    query(`SELECT * FROM passport_reward_nominations
            WHERE ($1::text IS NULL OR channel_slug=$1) AND ($2::uuid IS NULL OR event_id=$2)
            ORDER BY created_at DESC LIMIT $3`, [channelSlug, filters.eventId ?? null, limit]),
    actor.role==="admin"?query(`SELECT a.*, u.display_name, u.email FROM passport_appeals a JOIN fan_users u ON u.id=a.user_id
            WHERE a.state IN ('open','under_review') ORDER BY a.created_at LIMIT $1`, [limit]):empty,
    actor.role==="admin"?query(`SELECT * FROM passport_admin_audit ORDER BY created_at DESC LIMIT $1`, [limit]):empty,
  ]);
  const eligibleRecipients=filters.eventId?(await query<{id:string;displayName:string;publicSlug:string|null}>(`SELECT DISTINCT u.id,u.display_name AS "displayName",u.public_slug AS "publicSlug"
    FROM passport_event_presence ep JOIN passport_events e ON e.id=ep.event_id JOIN fan_users u ON u.id=ep.user_id
    WHERE ep.event_id=$1 AND ep.state IN('eligible','verified') AND ($2::text IS NULL OR e.channel_slug=$2)
    ORDER BY u.display_name`,[filters.eventId,channelSlug])).rows:[];
  const presenceRecords=actor.role==="admin"&&filters.eventId
    ? (await query<{
        userId:string;displayName:string;publicSlug:string|null;state:string;
        watchSeconds:number;heartbeatCount:number;claimedAt:string|null;updatedAt:string;
      }>(`SELECT ep.user_id AS "userId",u.display_name AS "displayName",u.public_slug AS "publicSlug",
                 ep.state,ep.watch_seconds AS "watchSeconds",ep.heartbeat_count AS "heartbeatCount",
                 ep.claimed_at::text AS "claimedAt",ep.updated_at::text AS "updatedAt"
            FROM passport_event_presence ep
            JOIN passport_events e ON e.id=ep.event_id
            JOIN fan_users u ON u.id=ep.user_id
           WHERE ep.event_id=$1 AND ($2::text IS NULL OR e.channel_slug=$2)
           ORDER BY ep.updated_at DESC,u.display_name`,[filters.eventId,channelSlug])).rows
    : [];
  const recipientIds=[...new Set(nominations.rows.flatMap((nomination:{user_ids?:unknown})=>
    Array.isArray(nomination.user_ids)
      ? nomination.user_ids.filter((value):value is string=>typeof value==="string")
      : []))];
  const rewardRecipients=recipientIds.length?(await query<{id:string;displayName:string;publicSlug:string|null}>(`SELECT id::text AS id,display_name AS "displayName",public_slug AS "publicSlug" FROM fan_users WHERE id::text=ANY($1::text[]) ORDER BY display_name`,[recipientIds])).rows:[];
  let effectivePermissions:PassportPermission[];
  let dutyPermissions:PassportPermission[];
  let onDuty:boolean;
  if(actor.role==="admin"){
    effectivePermissions=[...PASSPORT_PERMISSIONS];
    dutyPermissions=[...PASSPORT_PERMISSIONS];
    onDuty=true;
  }else{
    const permissionState=(await query<{permissions:PassportPermission[];duty_permissions:PassportPermission[];on_duty:boolean}>(`SELECT
        COALESCE(array_agg(DISTINCT perms.permission) FILTER(WHERE perms.permission IS NOT NULL),'{}')::text[] AS permissions,
        COALESCE(array_agg(DISTINCT perms.permission) FILTER(WHERE perms.permission IS NOT NULL AND s.id IS NOT NULL),'{}')::text[] AS duty_permissions,
        bool_or(s.id IS NOT NULL) AS on_duty
      FROM passport_moderator_assignments a
      LEFT JOIN LATERAL unnest(a.permissions) AS perms(permission) ON true
      LEFT JOIN passport_moderator_shifts s ON s.assignment_id=a.id AND s.ended_at IS NULL
      WHERE a.staff_user_id=$1::uuid AND a.revoked_at IS NULL
        AND (a.starts_at IS NULL OR a.starts_at<=now()) AND (a.ends_at IS NULL OR a.ends_at>now())
        AND (a.channel_slug IS NULL OR a.channel_slug=$2)
        AND (a.event_id IS NULL OR a.event_id=$3::uuid)`,[actor.id,channelSlug,filters.eventId ?? null])).rows[0];
    effectivePermissions=permissionState?.permissions ?? [];
    dutyPermissions=permissionState?.duty_permissions ?? [];
    onDuty=Boolean(permissionState?.on_duty);
  }
  return {
    effectivePermissions,dutyPermissions,onDuty,
    staffCandidates: staff.rows, assignments: assignments.rows, activeShifts: shifts.rows,
    channelControls: controls.rows, events: events.rows, scores: scores.rows,
    polls: polls.rows, moments: moments.rows, editions: editions.rows,
    nominations: nominations.rows, appeals: appeals.rows, audit: auditRows.rows,
    eligibleRecipients,rewardRecipients,presenceRecords,
  };
}

export type ModeratorAssignmentInput = {
  id?: string;
  staffUserId: string;
  networkSlug?: string;
  channelSlug?: string | null;
  eventId?: string | null;
  roles: PassportModeratorRole[];
  permissions: PassportPermission[];
  startsAt?: string | null;
  endsAt?: string | null;
  reason: string;
};

export async function upsertModeratorAssignment(actor: PassportActor, input: ModeratorAssignmentInput) {
  if (actor.role !== "admin") throw new PassportError("forbidden", 403);
  return withTransaction(async (client) => {
    if(input.eventId&&input.channelSlug)await assertEventChannel(client,input.eventId,input.channelSlug);
    const previous = input.id
      ? (await client.query(`SELECT * FROM passport_moderator_assignments WHERE id=$1 FOR UPDATE`, [input.id])).rows[0] ?? null
      : null;
    const result = input.id
      ? await client.query(
          `UPDATE passport_moderator_assignments SET staff_user_id=$2, network_slug=$3,
             channel_slug=$4,event_id=$5,roles=$6,permissions=$7,starts_at=$8,ends_at=$9,
             revoked_at=NULL,updated_at=now() WHERE id=$1 RETURNING *`,
          [input.id,input.staffUserId,input.networkSlug ?? "core",input.channelSlug ?? null,input.eventId ?? null,input.roles,input.permissions,input.startsAt ?? null,input.endsAt ?? null],
        )
      : await client.query(
          `INSERT INTO passport_moderator_assignments
             (staff_user_id,network_slug,channel_slug,event_id,roles,permissions,starts_at,ends_at,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [input.staffUserId,input.networkSlug ?? "core",input.channelSlug ?? null,input.eventId ?? null,input.roles,input.permissions,input.startsAt ?? null,input.endsAt ?? null,actor.id],
        );
    if (!result.rows[0]) throw new PassportError("not_found", 404);
    await audit(client,actor,"assignment.upsert","assignment",String(result.rows[0].id),input.reason,previous,result.rows[0]);
    return result.rows[0];
  });
}

export async function revokeModeratorAssignment(actor: PassportActor, input: { assignmentId: string; reason: string }) {
  if (actor.role !== "admin") throw new PassportError("forbidden", 403);
  return withTransaction(async (client) => {
    const previous = (await client.query(`SELECT * FROM passport_moderator_assignments WHERE id=$1 FOR UPDATE`,[input.assignmentId])).rows[0];
    if (!previous) throw new PassportError("not_found",404);
    const next = (await client.query(`UPDATE passport_moderator_assignments SET revoked_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[input.assignmentId])).rows[0];
    await client.query(`UPDATE passport_moderator_shifts SET ended_at=now(),end_reason=$2 WHERE assignment_id=$1 AND ended_at IS NULL`,[input.assignmentId,"assignment revoked"]);
    await audit(client,actor,"assignment.revoke","assignment",input.assignmentId,input.reason,previous,next);
    return next;
  });
}

export async function startModeratorShift(actor: PassportActor, input: { assignmentId: string }) {
  return withTransaction(async (client) => {
    const assignment = (await client.query<{ staff_user_id: string }>(`SELECT staff_user_id::text FROM passport_moderator_assignments WHERE id=$1 AND revoked_at IS NULL FOR UPDATE`,[input.assignmentId])).rows[0];
    if (!assignment) throw new PassportError("not_found",404);
    if (actor.role !== "admin" && assignment.staff_user_id !== actor.id) throw new PassportError("forbidden",403);
    const row = (await client.query(`INSERT INTO passport_moderator_shifts (assignment_id,started_by) VALUES ($1,$2)
      ON CONFLICT (assignment_id) WHERE ended_at IS NULL DO UPDATE SET started_by=passport_moderator_shifts.started_by RETURNING *`,[input.assignmentId,actor.id])).rows[0];
    await audit(client,actor,"shift.start","assignment",input.assignmentId,null,null,row);
    return row;
  });
}

export async function endModeratorShift(actor: PassportActor, input: { shiftId: string; reason?: string }) {
  return withTransaction(async (client) => {
    const previous = (await client.query(`SELECT s.*,a.staff_user_id::text FROM passport_moderator_shifts s JOIN passport_moderator_assignments a ON a.id=s.assignment_id WHERE s.id=$1 FOR UPDATE`,[input.shiftId])).rows[0];
    if (!previous) throw new PassportError("not_found",404);
    if (actor.role !== "admin" && previous.staff_user_id !== actor.id) throw new PassportError("forbidden",403);
    const next = (await client.query(`UPDATE passport_moderator_shifts SET ended_at=COALESCE(ended_at,now()),end_reason=COALESCE($2,end_reason) WHERE id=$1 RETURNING *`,[input.shiftId,input.reason ?? null])).rows[0];
    await audit(client,actor,"shift.end","shift",input.shiftId,input.reason ?? null,previous,next);
    return next;
  });
}

export type PassportEventInput = {
  code: string; networkSlug?: string; channelSlug: string; title: string;
  description?: string | null; externalRef?: string | null; startsAt: string;
  endsAt?: string | null; minimumWatchSeconds?: number; attendanceGraceSeconds?: number;
  heartbeatIntervalSeconds?: number; metadata?: Record<string, unknown>;
};

async function assertCanonicalLiveEventRef(
  client:PoolClient,
  externalRef:string,
  channelSlug:string,
):Promise<string>{
  const ref=externalRef.trim();
  if(!ref||ref.length>200||!/^\S(?:[\x20-\x7e]*\S)?$/.test(ref)){
    throw new PassportError("invalid_input",400,"invalid_event_playback_ref");
  }
  const result=await client.query<{playback_ref:string}>(`SELECT playback_ref
    FROM passport_watch_assets
    WHERE channel_slug=$2 AND kind='live' AND last_seen_at>=now()-interval '15 minutes'
      AND (playback_ref=$1 OR $1=ANY(aliases))
    ORDER BY last_seen_at DESC LIMIT 1`,[ref,channelSlug]);
  if(!result.rows[0])throw new PassportError("not_eligible",409,"event_playback_ref_not_current");
  // Preserve the exact catalog alias chosen by Studio so the Player presence
  // bridge can string-compare it without accepting any client-provided alias.
  return ref;
}

export async function createPassportEvent(actor: PassportActor, input: PassportEventInput) {
  return withTransaction(async (client) => {
    await requirePermission(client,actor,"event.manage",{channelSlug:input.channelSlug});
    const row=(await client.query(`INSERT INTO passport_events
      (code,network_slug,channel_slug,title,description,external_ref,starts_at,ends_at,state,
       minimum_watch_seconds,attendance_grace_seconds,heartbeat_interval_seconds,metadata,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11,$12::jsonb,$13) RETURNING *`,
      [input.code,input.networkSlug ?? "core",input.channelSlug,input.title,input.description ?? null,input.externalRef ?? null,input.startsAt,input.endsAt ?? null,input.minimumWatchSeconds ?? 120,input.attendanceGraceSeconds ?? 300,input.heartbeatIntervalSeconds ?? 30,JSON.stringify(input.metadata ?? {}),actor.id])).rows[0];
    await client.query(`INSERT INTO passport_card_editions(code,event_id,channel_slug,name,description,rarity,variant,state,account_bound,giftable,tradeable,craft_value,metadata,created_by)
      VALUES($1,$2,$3,$4,$5,'common','attendance','draft',true,false,false,0,$6::jsonb,$7)`,[`${input.code}:attendance`,row.id,input.channelSlug,`${input.title} Attendance`,input.description ?? `Verified attendance for ${input.title}.`,JSON.stringify({attendance:true,eventCode:input.code}),actor.id]);
    await audit(client,actor,"event.create","event",String(row.id),null,null,row); return row;
  });
}

export async function updatePassportEvent(actor: PassportActor, input: { eventId: string; patch: Partial<PassportEventInput> & { state?: string }; reason: string }) {
  return withTransaction(async (client) => {
    const previous=(await client.query(`SELECT * FROM passport_events WHERE id=$1 FOR UPDATE`,[input.eventId])).rows[0];
    if(!previous) throw new PassportError("not_found",404);
    await requirePermission(client,actor,"event.manage",{channelSlug:previous.channel_slug,eventId:input.eventId});
    const p=input.patch;
    if(p.channelSlug&&p.channelSlug!==previous.channel_slug){
      throw new PassportError("invalid_input",400,"event_channel_is_immutable");
    }
    const requestedState=p.state ?? previous.state;
    if(!passportEventTransitionAllowed(previous.state,requestedState))throw new PassportError("invalid_state",409,"invalid_event_transition");
    let effectiveExternalRef="externalRef" in p?p.externalRef:previous.external_ref;
    if((requestedState==="live"||previous.state==="live")&&(!effectiveExternalRef||typeof effectiveExternalRef!=="string"||effectiveExternalRef.length>200))throw new PassportError("invalid_input",400,"live_event_requires_playback_ref");
    if(requestedState==="live"){
      effectiveExternalRef=await assertCanonicalLiveEventRef(client,effectiveExternalRef as string,previous.channel_slug);
    }
    if(requestedState==="certified"){
      if(Object.keys(p).some((key)=>key!=="state"))throw new PassportError("invalid_input",400,"event_certification_must_be_state_only");
      const latest=(await client.query<{actor_id:string|null}>(`SELECT actor_id FROM passport_admin_audit WHERE action='event.update' AND scope_type='event' AND scope_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[input.eventId])).rows[0];
      if((latest?.actor_id ?? previous.created_by)===actor.id)throw new PassportError("forbidden",403,"two_person_event_certification_required");
    }
    const next=(await client.query(`UPDATE passport_events SET network_slug=COALESCE($2,network_slug),channel_slug=COALESCE($3,channel_slug),
      title=COALESCE($4,title),description=CASE WHEN $5::boolean THEN $6 ELSE description END,
      external_ref=CASE WHEN $7::boolean THEN $8 ELSE external_ref END,starts_at=COALESCE($9,starts_at),
      ends_at=CASE WHEN $10::boolean THEN $11 ELSE ends_at END,state=COALESCE($12,state),
      minimum_watch_seconds=COALESCE($13,minimum_watch_seconds),attendance_grace_seconds=COALESCE($14,attendance_grace_seconds),
      heartbeat_interval_seconds=COALESCE($15,heartbeat_interval_seconds),metadata=COALESCE($16::jsonb,metadata),
      certified_by=CASE WHEN $12='certified' THEN $17 ELSE certified_by END,
      certified_at=CASE WHEN $12='certified' THEN now() ELSE certified_at END,updated_at=now()
      WHERE id=$1 RETURNING *`,[input.eventId,p.networkSlug ?? null,p.channelSlug ?? null,p.title ?? null,"description" in p,p.description ?? null,"externalRef" in p||requestedState==="live",effectiveExternalRef ?? null,p.startsAt ?? null,"endsAt" in p,p.endsAt ?? null,p.state ?? null,p.minimumWatchSeconds ?? null,p.attendanceGraceSeconds ?? null,p.heartbeatIntervalSeconds ?? null,p.metadata ? JSON.stringify(p.metadata) : null,actor.id])).rows[0];
    await client.query(`UPDATE passport_card_editions SET channel_slug=CASE WHEN state='draft' THEN $2 ELSE channel_slug END,
      name=CASE WHEN state='draft' THEN $3 ELSE name END,description=CASE WHEN state='draft' THEN COALESCE($4,description) ELSE description END,
      state=CASE WHEN $5 IN('live','ended','certified') AND state='draft' THEN 'published' ELSE state END,updated_at=now()
      WHERE event_id=$1 AND moment_id IS NULL AND (metadata->>'attendance')::boolean=true`,[input.eventId,next.channel_slug,`${next.title} Attendance`,next.description,next.state]);
    await audit(client,actor,"event.update","event",input.eventId,input.reason,previous,next); return next;
  });
}

export async function freezePassportEvent(actor: PassportActor, input: { channelSlug: string; eventId?: string | null; targets: Array<"polls"|"scores"|"rewards"|"moments"|"chat">; frozen: boolean; reason: string }) {
  return withTransaction(async(client)=>{
    if(input.eventId)await assertEventChannel(client,input.eventId,input.channelSlug);
    if(!input.targets.length)throw new PassportError("invalid_input",400,"freeze_target_required");
    if(input.targets.every(target=>target==="chat")){
      try{
        await requirePermission(client,actor,"chat.freeze",{channelSlug:input.channelSlug,eventId:input.eventId});
      }catch(error){
        if(!(error instanceof PassportError)||error.code!=="forbidden")throw error;
        // Channel leads retain the broader emergency authority while the
        // chat_guardian role remains narrowly limited to chat freezes.
        await requirePermission(client,actor,"channel.freeze",{channelSlug:input.channelSlug,eventId:input.eventId});
      }
    }else{
      await requirePermission(client,actor,"channel.freeze",{channelSlug:input.channelSlug,eventId:input.eventId});
    }
    const scopeKey=input.eventId ?? "*";
    const previous=(await client.query(`SELECT * FROM passport_channel_controls WHERE channel_slug=$1 AND scope_key=$2`,[input.channelSlug,scopeKey])).rows[0] ?? null;
    const flags={polls:previous?.polls_frozen ?? false,scores:previous?.scores_frozen ?? false,rewards:previous?.rewards_frozen ?? false,moments:previous?.moments_frozen ?? false,chat:previous?.chat_frozen ?? false};
    for(const target of input.targets) flags[target]=input.frozen;
    const next=(await client.query(`INSERT INTO passport_channel_controls
      (channel_slug,scope_key,event_id,polls_frozen,scores_frozen,rewards_frozen,moments_frozen,chat_frozen,reason,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(channel_slug,scope_key) DO UPDATE SET event_id=EXCLUDED.event_id,
      polls_frozen=EXCLUDED.polls_frozen,scores_frozen=EXCLUDED.scores_frozen,rewards_frozen=EXCLUDED.rewards_frozen,
      moments_frozen=EXCLUDED.moments_frozen,chat_frozen=EXCLUDED.chat_frozen,reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,
      [input.channelSlug,scopeKey,input.eventId ?? null,flags.polls,flags.scores,flags.rewards,flags.moments,flags.chat,input.reason,actor.id])).rows[0];
    await audit(client,actor,"event.freeze","channel",input.channelSlug,input.reason,previous,next); return next;
  });
}

export async function createPassportPoll(actor: PassportActor,input:{eventId:string;channelSlug:string;question:string;options:string[];kind?:string;audience?:"everyone"|"signed_in"|"live_attendees"|"members";description?:string|null;opensAt?:string|null;closesAt?:string|null;resultsVisibility?:string}){
  return withTransaction(async(client)=>{
    if(input.audience==="members")throw new PassportError("invalid_input",400,"members_audience_unavailable");
    await assertEventChannel(client,input.eventId,input.channelSlug);
    await requirePermission(client,actor,"poll.create",input,{shiftRequired:true});
    if(await passportControlFrozen(client,input.channelSlug,input.eventId,"polls")) throw new PassportError("invalid_state",409,"polls_frozen");
    const poll=(await client.query<{id:string}>(`INSERT INTO polls(question,status,created_by,closes_at,description,opens_at,results_visibility,kind,passport_event_id,channel_slug,lifecycle_state,passport_audience)
      VALUES($1,'closed',$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10) RETURNING id::text`,[input.question,actor.email,input.closesAt ?? null,input.description ?? null,input.opensAt ?? null,input.resultsVisibility ?? "after_vote",input.kind ?? "standard",input.eventId,input.channelSlug,input.audience ?? "signed_in"])).rows[0]!;
    for(const [position,label] of input.options.entries()) await client.query(`INSERT INTO poll_options(poll_id,label,position) VALUES($1,$2,$3)`,[poll.id,label,position]);
    await audit(client,actor,"poll.create","poll",poll.id,null,null,{...input,id:poll.id}); return poll;
  });
}

export async function transitionPassportPoll(actor:PassportActor,input:{pollId:string;state:"draft"|"preview"|"live"|"locked"|"certified"|"cancelled";reason:string;winnerOptionId?:string|null}){
  const result=await withTransaction(async(client)=>{
    const previous=(await client.query(`SELECT * FROM polls WHERE id=$1 FOR UPDATE`,[input.pollId])).rows[0]; if(!previous) throw new PassportError("not_found",404);
    const permission=input.state==="certified"?"poll.certify":input.state==="live"?"poll.publish":"poll.lock";
    await requirePermission(client,actor,permission,{channelSlug:previous.channel_slug,eventId:previous.passport_event_id},{shiftRequired:input.state!=="certified"});
    if(previous.lifecycle_state===input.state){
      if(input.state==="certified"&&input.winnerOptionId&&previous.winner_option_id!==input.winnerOptionId)throw new PassportError("invalid_state",409,"certified_poll_is_immutable");
      return{poll:previous,winners:[] as Array<{user_id:string}>};
    }
    if(!passportPollTransitionAllowed(previous.lifecycle_state,input.state))throw new PassportError("invalid_state",409,"invalid_poll_transition");
    const pollsFrozen=await passportControlFrozen(client,previous.channel_slug,previous.passport_event_id,"polls");if(pollsFrozen&&!(["locked","cancelled"] as string[]).includes(input.state))throw new PassportError("invalid_state",409,"polls_frozen");
    if(input.state==="certified" && previous.created_by===actor.email) throw new PassportError("forbidden",403,"two_person_certification_required");
    if(input.state==="certified"&&["prediction","trivia"].includes(previous.kind)&&!input.winnerOptionId&&!previous.winner_option_id)throw new PassportError("invalid_input",400,"winner_required_for_prediction");
    if(input.winnerOptionId){const option=await client.query(`SELECT 1 FROM poll_options WHERE id=$1 AND poll_id=$2`,[input.winnerOptionId,input.pollId]);if(!option.rows[0])throw new PassportError("invalid_input",400,"winner_option_not_in_poll");}
    const next=(await client.query(`UPDATE polls SET lifecycle_state=$2,status=CASE WHEN $2='live' THEN 'open' ELSE 'closed' END,
      certified_by=CASE WHEN $2='certified' THEN $3 ELSE certified_by END,certified_at=CASE WHEN $2='certified' THEN now() ELSE certified_at END,
      winner_option_id=CASE WHEN $2='certified' THEN COALESCE($4::uuid,winner_option_id) ELSE winner_option_id END,
      updated_at=now() WHERE id=$1 RETURNING *`,[input.pollId,input.state,actor.id,input.winnerOptionId ?? null])).rows[0];
    const winners=input.state==="certified"&&next.winner_option_id?(await client.query<{user_id:string}>(`SELECT user_id FROM poll_votes WHERE poll_id=$1 AND option_id=$2`,[input.pollId,next.winner_option_id])).rows:[];
    for(const winner of winners)await enqueuePassportActivity(client,{userId:winner.user_id,metric:"correct_prediction",amount:1,channelSlug:next.channel_slug,sourceType:"poll",sourceId:input.pollId,idempotencyKey:`correct:${input.pollId}:${winner.user_id}`});
    await audit(client,actor,"poll.transition","poll",input.pollId,input.reason,previous,next); return {poll:next,winners};
  });
  await drainPassportActivityOutbox({sourceType:"poll",sourceId:input.pollId,limit:250});
  return {...result.poll,correctPredictionAwards:result.winners.length};
}

export async function appendScoreRevision(actor:PassportActor,input:{eventId:string;state:Record<string,unknown>;reason:string}){
  return withTransaction(async(client)=>{
    await requirePermission(client,actor,"score.revise",{eventId:input.eventId},{shiftRequired:true});
    const event=(await client.query<{channel_slug:string}>(`SELECT channel_slug FROM passport_events WHERE id=$1`,[input.eventId])).rows[0]; if(!event) throw new PassportError("not_found",404);
    if(await passportControlFrozen(client,event.channel_slug,input.eventId,"scores")) throw new PassportError("invalid_state",409,"scores_frozen");
    const previous=(await client.query(`SELECT * FROM passport_event_scores WHERE event_id=$1 FOR UPDATE`,[input.eventId])).rows[0] ?? {state:{},revision:0}; const revision=Number(previous.revision)+1;
    await client.query(`INSERT INTO passport_score_revisions(event_id,revision,previous_state,next_state,reason,actor_id) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6)`,[input.eventId,revision,JSON.stringify(previous.state ?? {}),JSON.stringify(input.state),input.reason,actor.id]);
    const next=(await client.query(`INSERT INTO passport_event_scores(event_id,state,revision,status,updated_by) VALUES($1,$2::jsonb,$3,'pending_verification',$4)
      ON CONFLICT(event_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,status='pending_verification',updated_by=EXCLUDED.updated_by,certified_by=NULL,certified_at=NULL,updated_at=now() RETURNING *`,[input.eventId,JSON.stringify(input.state),revision,actor.id])).rows[0];
    await audit(client,actor,"score.revise","event",input.eventId,input.reason,previous,next); return next;
  });
}

export async function certifyScore(actor:PassportActor,input:{eventId:string;revision:number;reason:string}){
  return withTransaction(async(client)=>{
    await requirePermission(client,actor,"score.certify",{eventId:input.eventId});
    const previous=(await client.query(`SELECT s.*,e.channel_slug FROM passport_event_scores s JOIN passport_events e ON e.id=s.event_id WHERE s.event_id=$1 FOR UPDATE OF s`,[input.eventId])).rows[0]; if(!previous) throw new PassportError("not_found",404);
    if(await passportControlFrozen(client,previous.channel_slug,input.eventId,"scores"))throw new PassportError("invalid_state",409,"scores_frozen");
    if(previous.status!=="pending_verification")throw new PassportError("invalid_state",409,"score_not_pending_verification");
    if(Number(previous.revision)!==input.revision) throw new PassportError("conflict",409,"score_revision_changed");
    if(previous.updated_by===actor.id) throw new PassportError("forbidden",403,"two_person_certification_required");
    const next=(await client.query(`UPDATE passport_event_scores SET status='certified',certified_by=$2,certified_at=now(),updated_at=now() WHERE event_id=$1 RETURNING *`,[input.eventId,actor.id])).rows[0];
    await audit(client,actor,"score.certify","event",input.eventId,input.reason,previous,next); return next;
  });
}

export type PassportMomentInput={eventId:string;code:string;title:string;description?:string|null;offsetSeconds:number;eligibilityBeforeSeconds?:number;eligibilityAfterSeconds?:number;minimumPresenceSeconds?:number;rarity?:"common"|"rare"|"historic"|"legendary";metadata?:Record<string,unknown>};
export async function createPassportMoment(actor:PassportActor,input:PassportMomentInput){return withTransaction(async(client)=>{
  await requirePermission(client,actor,"moment.create",{eventId:input.eventId},{shiftRequired:true});
  const control=(await client.query<{state:string;channel_slug:string}>(`SELECT state,channel_slug FROM passport_events WHERE id=$1`,[input.eventId])).rows[0];
  if(!control)throw new PassportError("not_found",404,"event_not_found");
  if(control.state==="frozen"||await passportControlFrozen(client,control.channel_slug,input.eventId,"moments"))throw new PassportError("invalid_state",409,"moments_frozen");
  const row=(await client.query(`INSERT INTO passport_moments(event_id,code,title,description,offset_seconds,eligibility_before_seconds,eligibility_after_seconds,minimum_presence_seconds,rarity,metadata,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING *`,[input.eventId,input.code,input.title,input.description ?? null,input.offsetSeconds,input.eligibilityBeforeSeconds ?? 300,input.eligibilityAfterSeconds ?? 180,input.minimumPresenceSeconds ?? 120,input.rarity ?? "common",JSON.stringify(input.metadata ?? {}),actor.id])).rows[0];
  await audit(client,actor,"moment.create","moment",String(row.id),null,null,row);return row;
});}

export async function previewPassportMoment(actor:PassportActor,input:{momentId:string}){
  return withTransaction(async(client)=>{
    const moment=await client.query<{event_id:string;channel_slug:string}>(`SELECT m.event_id::text,e.channel_slug FROM passport_moments m JOIN passport_events e ON e.id=m.event_id WHERE m.id=$1`,[input.momentId]);
    if(!moment.rows[0])throw new PassportError("not_found",404,"moment_not_found");
    await requirePermission(client,actor,"moment.create",{eventId:moment.rows[0].event_id,channelSlug:moment.rows[0].channel_slug},{shiftRequired:true});
    const result=await client.query<{eligible:string}>(`SELECT COUNT(*)::text AS eligible FROM (SELECT h.user_id FROM passport_moments m JOIN passport_events e ON e.id=m.event_id JOIN passport_presence_heartbeats h ON h.event_id=e.id
      WHERE m.id=$1 AND h.received_at BETWEEN e.starts_at + make_interval(secs=>m.offset_seconds-m.eligibility_before_seconds) AND e.starts_at + make_interval(secs=>m.offset_seconds+m.eligibility_after_seconds)
      GROUP BY h.user_id HAVING SUM(h.credited_seconds)>=MAX(m.minimum_presence_seconds)) q`,[input.momentId]);
    return {eligibleCount:Number(result.rows[0]?.eligible ?? 0)};
  });
}

export async function publishPassportMoment(actor:PassportActor,input:{momentId:string;reason:string;edition:{code:string;name?:string;description?:string;artworkUrl?:string|null;variant?:"base"|"signed";signedBy?:string|null;maxSupply?:number|null;accountBound?:boolean;giftable?:boolean;tradeable?:boolean;craftValue?:number}}){return withTransaction(async(client)=>{
  const moment=(await client.query(`SELECT m.*,e.channel_slug,e.state AS event_state FROM passport_moments m JOIN passport_events e ON e.id=m.event_id WHERE m.id=$1 FOR UPDATE OF m`,[input.momentId])).rows[0];if(!moment)throw new PassportError("not_found",404);
  await requirePermission(client,actor,"moment.publish",{eventId:moment.event_id,channelSlug:moment.channel_slug});
  if(moment.state!=="draft")throw new PassportError("invalid_state",409,"only_draft_moments_can_be_published");
  if(moment.event_state==="frozen"||await passportControlFrozen(client,moment.channel_slug,moment.event_id,"moments"))throw new PassportError("invalid_state",409,"moments_frozen");
  if(moment.created_by===actor.id && moment.rarity==="legendary")throw new PassportError("forbidden",403,"two_person_legendary_publish_required");
  const variant=input.edition.variant ?? "base";
  if(variant==="signed"){
    if(!input.edition.signedBy||!MEMBER_SLUGS.has(input.edition.signedBy))throw new PassportError("invalid_input",400,"valid_signer_required");
    await requireChannelLead(client,actor,moment.channel_slug,moment.event_id);
    if(actor.role!=="admin"&&input.edition.signedBy!==actor.memberSlug){
      throw new PassportError("forbidden",403,"signer_must_publish_their_own_signed_edition");
    }
  }else if(input.edition.signedBy)throw new PassportError("invalid_input",400,"signer_requires_signed_variant");
  const accountBound=input.edition.accountBound ?? true;const giftable=input.edition.giftable ?? false;const tradeable=input.edition.tradeable ?? false;const craftValue=input.edition.craftValue ?? 0;
  if(accountBound&&(giftable||tradeable))throw new PassportError("invalid_input",400,"account_bound_editions_cannot_transfer");
  if((!accountBound||giftable||tradeable||craftValue>0)&&actor.role!=="admin")throw new PassportError("forbidden",403,"collection_policy_requires_admin");
  if(craftValue<0||craftValue>10000)throw new PassportError("invalid_input",400,"invalid_craft_value");
  const updated=(await client.query(`UPDATE passport_moments SET state='published',published_by=$2,published_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[input.momentId,actor.id])).rows[0];
  const edition=(await client.query(`INSERT INTO passport_card_editions(code,moment_id,event_id,channel_slug,name,description,artwork_url,rarity,variant,state,account_bound,giftable,tradeable,craft_value,max_supply,created_by,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING *`,[input.edition.code,input.momentId,moment.event_id,moment.channel_slug,input.edition.name ?? moment.title,input.edition.description ?? moment.description ?? moment.title,input.edition.artworkUrl ?? null,moment.rarity,variant,accountBound,giftable,tradeable,craftValue,input.edition.maxSupply ?? null,actor.id,JSON.stringify({signedBy:variant==="signed"?input.edition.signedBy:null,variant,collectionPolicy:{accountBound,giftable,tradeable,craftValue}})])).rows[0];
  await audit(client,actor,"moment.publish","moment",input.momentId,input.reason,moment,{moment:updated,edition});return {moment:updated,edition};
});}

export async function cancelPassportMoment(actor:PassportActor,input:{momentId:string;reason:string}){return withTransaction(async(client)=>{const previous=(await client.query(`SELECT m.*,e.channel_slug FROM passport_moments m JOIN passport_events e ON e.id=m.event_id WHERE m.id=$1 FOR UPDATE`,[input.momentId])).rows[0];if(!previous)throw new PassportError("not_found",404);await requirePermission(client,actor,"moment.publish",{eventId:previous.event_id,channelSlug:previous.channel_slug});if(previous.state!=="draft")throw new PassportError("invalid_state",409,"only_draft_moments_can_be_cancelled");const next=(await client.query(`UPDATE passport_moments SET state='revoked',updated_at=now() WHERE id=$1 AND state='draft' RETURNING *`,[input.momentId])).rows[0];await audit(client,actor,"moment.cancel","moment",input.momentId,input.reason,previous,next);return next;});}

export async function sealCardEdition(actor:PassportActor,input:{editionId:string;reason:string}){return withTransaction(async(client)=>{const previous=(await client.query(`SELECT * FROM passport_card_editions WHERE id=$1 FOR UPDATE`,[input.editionId])).rows[0];if(!previous)throw new PassportError("not_found",404);await requirePermission(client,actor,"edition.seal",{channelSlug:previous.channel_slug,eventId:previous.event_id});if(previous.state==="sealed")return previous;if(previous.state!=="published")throw new PassportError("invalid_state",409,"only_published_editions_can_be_sealed");const count=Number((await client.query<{count:string}>(`SELECT COUNT(*)::text count FROM passport_cards WHERE edition_id=$1`,[input.editionId])).rows[0]?.count ?? 0);const next=(await client.query(`UPDATE passport_card_editions SET state='sealed',edition_size=$2,sealed_at=now(),updated_at=now() WHERE id=$1 AND state='published' RETURNING *`,[input.editionId,count])).rows[0];if(previous.moment_id)await client.query(`UPDATE passport_moments SET state='sealed',updated_at=now() WHERE id=$1`,[previous.moment_id]);await audit(client,actor,"edition.seal","edition",input.editionId,input.reason,previous,next);return next;});}

export type PassportReward={
  type:"achievement"|"card"|"cosmetic"|"xp"|"sparks";
  code?:string;
  amount?:number;
  label?:string;
  rarity?:"common"|"rare"|"historic"|"legendary";
  quantity?:number;
};

type RewardBudgetClass="common"|"rare"|"legendary";
type CanonicalPassportReward=PassportReward&{
  rarity:RewardBudgetClass;
  quantity:number;
  budgetUnitsPerRecipient:number;
  assetChannelSlug:string|null;
};

function budgetClass(rarity:string|null|undefined):RewardBudgetClass{
  if(rarity==="legendary"||rarity==="historic"||rarity==="icon")return"legendary";
  if(rarity==="rare"||rarity==="gold"||rarity==="silver")return"rare";
  return"common";
}

async function canonicalPassportReward(client:PoolClient,reward:PassportReward):Promise<CanonicalPassportReward>{
  if(reward.type==="xp"||reward.type==="sparks"){
    const policy=passportCurrencyRewardPolicy(reward.type,Number(reward.amount));
    return{type:reward.type,amount:policy.amount,label:reward.label,rarity:policy.rarity,quantity:1,budgetUnitsPerRecipient:policy.budgetUnits,assetChannelSlug:null};
  }
  if(!reward.code)throw new PassportError("invalid_input",400,"reward_code_required");
  if(reward.type==="card"){
    const row=(await client.query<{name:string;rarity:string;channel_slug:string}>(`SELECT name,rarity,channel_slug FROM passport_card_editions WHERE id=$1 AND state='published'`,[reward.code])).rows[0];
    if(!row)throw new PassportError("not_found",404,"reward_card_not_available");
    const quantity=reward.quantity ?? 1;
    if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw new PassportError("invalid_input",400,"invalid_card_reward_quantity");
    return{type:"card",code:reward.code,label:row.name,rarity:budgetClass(row.rarity),quantity,budgetUnitsPerRecipient:quantity,assetChannelSlug:row.channel_slug};
  }
  if(reward.quantity!==undefined&&reward.quantity!==1)throw new PassportError("invalid_input",400,"non_card_reward_quantity_must_be_one");
  if(reward.type==="cosmetic"){
    const row=(await client.query<{name:string;rarity:string;channel_slug:string|null}>(`SELECT name,rarity,channel_slug FROM passport_cosmetics WHERE code=$1 AND active`,[reward.code])).rows[0];
    if(!row)throw new PassportError("not_found",404,"cosmetic_not_found");
    return{type:"cosmetic",code:reward.code,label:row.name,rarity:budgetClass(row.rarity),quantity:1,budgetUnitsPerRecipient:1,assetChannelSlug:row.channel_slug};
  }
  const row=(await client.query<{name:string;tier:string;channel_slug:string|null}>(`SELECT name,tier,channel_slug FROM passport_achievement_definitions WHERE code=$1 AND active`,[reward.code])).rows[0];
  if(!row)throw new PassportError("not_found",404,"achievement_not_found");
  return{type:"achievement",code:reward.code,label:row.name,rarity:budgetClass(row.tier),quantity:1,budgetUnitsPerRecipient:1,assetChannelSlug:row.channel_slug};
}

function assertCanonicalRewardChannel(reward:CanonicalPassportReward,channelSlug:string|null|undefined):void{
  if(reward.assetChannelSlug!==null&&reward.assetChannelSlug!==channelSlug){
    throw new PassportError("forbidden",403,"reward_channel_mismatch");
  }
}

async function grantCanonicalRewardInTransaction(client:PoolClient,actor:PassportActor,input:{userId:string;channelSlug?:string|null;reward:CanonicalPassportReward;reason:string;sourceType:string;sourceId:string;idempotencyKey:string}){
  await ensurePassportProfile(client,input.userId);const key=`staff-reward:${input.userId}:${input.idempotencyKey}`;
  if(input.reward.type==="xp")return {granted:await awardPassportXpInTransaction(client,{userId:input.userId,amount:input.reward.amount ?? 0,channelSlug:input.channelSlug,idempotencyKey:key,sourceType:input.sourceType,sourceId:input.sourceId,actorType:"staff",actorId:actor.id})};
  if(input.reward.type==="sparks")return {granted:await addSparksInTransaction(client,{userId:input.userId,amount:input.reward.amount ?? 0,idempotencyKey:key,sourceType:input.sourceType,sourceId:input.sourceId,actorType:"staff",actorId:actor.id})};
  if(!input.reward.code)throw new PassportError("invalid_input",400,"reward_code_required");
  if(input.reward.type==="card"){
    const cards=[];const quantity=input.reward.quantity;
    for(let index=0;index<quantity;index++)cards.push(await grantEditionCardInTransaction(client,{userId:input.userId,editionId:input.reward.code,claimKey:`${key}:${index}`,acquiredVia:"grant",provenance:{reason:input.reason,actorId:actor.id,nominationId:input.sourceId},actorType:"staff",actorId:actor.id,sourceType:input.sourceType,sourceId:input.sourceId}));
    return{cards};
  }
  if(input.reward.type==="cosmetic"){
    const granted=await unlockCosmeticInTransaction(client,{userId:input.userId,cosmeticCode:input.reward.code,grantKey:key,sourceType:input.sourceType,sourceId:input.sourceId,actorType:"staff",actorId:actor.id});
    if(!granted)throw new PassportError("not_eligible",409,"cosmetic_already_owned");
    return {granted};
  }
  const result=await client.query(`INSERT INTO passport_achievement_grants(user_id,achievement_code,progress,state,grant_key,source_type,source_id,earned_at)
    SELECT $1,code,threshold,'active',$3,$4,$5,now() FROM passport_achievement_definitions WHERE code=$2
    ON CONFLICT(user_id,achievement_code) DO UPDATE SET progress=EXCLUDED.progress,state='active',grant_key=EXCLUDED.grant_key,
      source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,earned_at=now(),revoked_at=NULL,revoked_reason=NULL
    WHERE passport_achievement_grants.state='revoked' RETURNING *`,[input.userId,input.reward.code,key,input.sourceType,input.sourceId]);
  if(!result.rows[0])throw new PassportError("not_eligible",409,"achievement_already_owned");await appendPassportLedger(client,{idempotencyKey:`${key}:ledger`,userId:input.userId,action:"achievement.grant",assetType:"achievement",assetId:input.reward.code,channelSlug:input.channelSlug,sourceType:input.sourceType,sourceId:input.sourceId,actorType:"staff",actorId:actor.id,data:{reason:input.reason}});return {achievement:result.rows[0]};
}

/** Intended for audited restoration tooling; ordinary moderator awards use nomination + review. */
export async function grantPassportReward(actor:PassportActor,input:{userId:string;channelSlug?:string|null;reward:PassportReward;reason:string;sourceType:string;sourceId:string;idempotencyKey:string}){return withTransaction(async(client)=>{await requirePermission(client,actor,"reward.approve",{channelSlug:input.channelSlug});const reward=await canonicalPassportReward(client,input.reward);assertCanonicalRewardChannel(reward,input.channelSlug);return grantCanonicalRewardInTransaction(client,actor,{...input,reward});});}

export async function nominatePassportReward(actor:PassportActor,input:{eventId?:string|null;channelSlug:string;reward:PassportReward;userIds:string[];reason:string}){return withTransaction(async(client)=>{if(input.eventId)await assertEventChannel(client,input.eventId,input.channelSlug);await requirePermission(client,actor,"reward.nominate",input,{shiftRequired:Boolean(input.eventId)});const recipientUserIds=[...new Set(input.userIds)];if(!recipientUserIds.length||recipientUserIds.length>100)throw new PassportError("invalid_input",400,"invalid_reward_recipient_count");if(input.eventId){const eligible=(await client.query<{user_id:string}>(`SELECT DISTINCT user_id AS user_id FROM passport_event_presence WHERE event_id=$1 AND state IN ('eligible','verified') AND user_id=ANY($2::text[])`,[input.eventId,recipientUserIds])).rows.map((row)=>row.user_id);assertPassportEligibleRewardRecipients(recipientUserIds,eligible);}const linkedFanId=await actorFanId(client,actor);assertPassportNoSelfGrant(linkedFanId,recipientUserIds);if(await passportControlFrozen(client,input.channelSlug,input.eventId,"rewards"))throw new PassportError("invalid_state",409,"rewards_frozen");const reward=await canonicalPassportReward(client,input.reward);assertCanonicalRewardChannel(reward,input.channelSlug);const row=(await client.query(`INSERT INTO passport_reward_nominations(event_id,channel_slug,reward_type,reward_code,reward_data,user_ids,reason,nominated_by)
  VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING *`,[input.eventId ?? null,input.channelSlug,reward.type,reward.code ?? null,JSON.stringify({amount:reward.amount ?? null,label:reward.label ?? null,rarity:reward.rarity,quantity:reward.quantity,budgetUnitsPerRecipient:reward.budgetUnitsPerRecipient}),recipientUserIds,input.reason,actor.id])).rows[0];await audit(client,actor,"reward.nominate","nomination",String(row.id),input.reason,null,row);return row;});}

async function actorFanId(client:PoolClient,actor:PassportActor):Promise<string|null>{
  const result=await client.query<{id:string}>(`SELECT id FROM fan_users WHERE lower(email)=lower($1) LIMIT 1`,[actor.email]);
  return result.rows[0]?.id ?? null;
}

export async function reviewPassportNomination(actor:PassportActor,input:{nominationId:string;approved:boolean;reason:string}){return withTransaction(async(client)=>{const row=(await client.query(`SELECT * FROM passport_reward_nominations WHERE id=$1 FOR UPDATE`,[input.nominationId])).rows[0];if(!row)throw new PassportError("not_found",404);await requirePermission(client,actor,"reward.approve",{channelSlug:row.channel_slug,eventId:row.event_id});if(row.nominated_by===actor.id)throw new PassportError("forbidden",403,"two_person_reward_approval_required");const linkedFanId=await actorFanId(client,actor);if(input.approved)assertPassportNoSelfGrant(linkedFanId,row.user_ids as string[]);if(row.state!=="pending")throw new PassportError("invalid_state",409);
  if(!input.approved){const denied=(await client.query(`UPDATE passport_reward_nominations SET state='denied',reviewed_by=$2,reviewed_at=now() WHERE id=$1 RETURNING *`,[input.nominationId,actor.id])).rows[0];await audit(client,actor,"reward.review","nomination",input.nominationId,input.reason,row,denied);return denied;}
  if(row.event_id){const eligible=(await client.query<{user_id:string}>(`SELECT DISTINCT user_id FROM passport_event_presence WHERE event_id=$1 AND state IN('eligible','verified') AND user_id=ANY($2::text[])`,[row.event_id,row.user_ids])).rows.map((entry)=>entry.user_id);assertPassportEligibleRewardRecipients(row.user_ids as string[],eligible);}
  if(await passportControlFrozen(client,row.channel_slug,row.event_id,"rewards"))throw new PassportError("invalid_state",409,"rewards_frozen");
  const controls=(await client.query(`INSERT INTO passport_channel_controls(channel_slug,scope_key) VALUES($1,'*') ON CONFLICT(channel_slug,scope_key) DO UPDATE SET channel_slug=EXCLUDED.channel_slug RETURNING *`,[row.channel_slug])).rows[0];
  const reward=await canonicalPassportReward(client,{type:row.reward_type,code:row.reward_code ?? undefined,amount:row.reward_data?.amount ?? undefined,quantity:row.reward_data?.quantity ?? undefined});assertCanonicalRewardChannel(reward,row.channel_slug);const rarity=reward.rarity;const units=(row.user_ids as string[]).length*reward.budgetUnitsPerRecipient;const budgetField=`${rarity}_budget`;const usedField=`${rarity}_used`;if(Number(controls[usedField])+units>Number(controls[budgetField]))throw new PassportError("not_eligible",409,`${rarity}_budget_exceeded`);
  for(const userId of row.user_ids as string[])await grantCanonicalRewardInTransaction(client,actor,{userId,channelSlug:row.channel_slug,reward,reason:input.reason,sourceType:"nomination",sourceId:input.nominationId,idempotencyKey:`${input.nominationId}:${userId}`});
  await client.query(`UPDATE passport_channel_controls SET ${usedField}=${usedField}+$2,updated_at=now(),updated_by=$3 WHERE channel_slug=$1 AND scope_key='*'`,[row.channel_slug,units,actor.id]);
  const canonicalData={...(row.reward_data ?? {}),amount:reward.amount ?? null,label:reward.label ?? null,rarity:reward.rarity,quantity:reward.quantity,budgetUnitsPerRecipient:reward.budgetUnitsPerRecipient,approvedBudgetClass:reward.rarity,approvedBudgetUnitsPerRecipient:reward.budgetUnitsPerRecipient};
  const approved=(await client.query(`UPDATE passport_reward_nominations SET state='approved',reward_data=$3::jsonb,reviewed_by=$2,reviewed_at=now() WHERE id=$1 RETURNING *`,[input.nominationId,actor.id,JSON.stringify(canonicalData)])).rows[0];await audit(client,actor,"reward.review","nomination",input.nominationId,input.reason,row,approved);return approved;
});}

export async function revokePassportNomination(actor:PassportActor,input:{nominationId:string;reason:string;idempotencyKey:string}){
  return withTransaction(async(client)=>{
    const nomination=(await client.query(`SELECT * FROM passport_reward_nominations WHERE id=$1 FOR UPDATE`,[input.nominationId])).rows[0];
    if(!nomination)throw new PassportError("not_found",404);
    await requirePermission(client,actor,"reward.revoke",{channelSlug:nomination.channel_slug,eventId:nomination.event_id});
    if(nomination.state==="revoked")return nomination;
    if(nomination.state!=="approved")throw new PassportError("invalid_state",409,"only_approved_nominations_can_be_revoked");
    const rootKey=`nomination-revoke:${input.nominationId}:${input.idempotencyKey}`;
    const issuedCards=(await client.query<{id:string}>(`SELECT DISTINCT asset_id AS id FROM passport_ledger WHERE source_type='nomination' AND source_id=$1 AND action='card.issue' AND asset_id IS NOT NULL`,[input.nominationId])).rows;
    const cardIds=issuedCards.map(card=>card.id);
    if(cardIds.length){
      const transferred=(await client.query<{id:string}>(
        `SELECT id::text FROM passport_cards
          WHERE id=ANY($1::uuid[])
            AND (owner_user_id IS DISTINCT FROM original_user_id OR acquired_via IN('gift','trade'))
          LIMIT 1`,[cardIds],
      )).rows[0];
      if(transferred){
        throw new PassportError("conflict",409,"transferred_reward_requires_manual_resolution");
      }
    }
    const rootLedger=await appendPassportLedger(client,{idempotencyKey:rootKey,action:"nomination.revoke",assetType:"nomination",assetId:input.nominationId,channelSlug:nomination.channel_slug,sourceType:"nomination",sourceId:input.nominationId,actorType:"staff",actorId:actor.id,data:{reason:input.reason}});
    if(rootLedger===null)return nomination;

    if(cardIds.length){
      const impactedTrades=(await client.query<{trade_id:string}>(`SELECT DISTINCT trade_id::text FROM passport_trade_items WHERE card_id=ANY($1::uuid[]) AND released_at IS NULL`,[cardIds])).rows;
      for(const trade of impactedTrades){await client.query(`UPDATE passport_cards c SET state='active',lock_reason=NULL,updated_at=now() FROM passport_trade_items i WHERE i.trade_id=$1 AND i.card_id=c.id AND c.state='locked' AND c.lock_reason=$2`,[trade.trade_id,`trade:${trade.trade_id}`]);await client.query(`UPDATE passport_trade_items SET released_at=COALESCE(released_at,now()) WHERE trade_id=$1`,[trade.trade_id]);await client.query(`UPDATE passport_trades SET state='revoked',resolved_at=now() WHERE id=$1 AND state IN('pending','awaiting_confirmation','cooling_off')`,[trade.trade_id]);}
      await client.query(`UPDATE passport_gifts SET state='revoked',resolved_at=now() WHERE card_id=ANY($1::uuid[]) AND state='pending'`,[cardIds]);
      await client.query(`UPDATE passport_cards SET state='revoked',lock_reason=NULL,revoked_at=now(),revoked_reason=$2,updated_at=now() WHERE id=ANY($1::uuid[])`,[cardIds,input.reason]);
    }
    const revokedAchievements=(await client.query<{user_id:string;achievement_code:string}>(`UPDATE passport_achievement_grants SET state='revoked',revoked_at=now(),revoked_reason=$2 WHERE source_type='nomination' AND source_id=$1 RETURNING user_id,achievement_code`,[input.nominationId,input.reason])).rows;
    const revokedCosmetics=(await client.query<{user_id:string;cosmetic_code:string}>(`UPDATE passport_cosmetic_unlocks SET state='revoked',revoked_at=now() WHERE source_type='nomination' AND source_id=$1 RETURNING user_id,cosmetic_code`,[input.nominationId])).rows;
    for(const userId of nomination.user_ids as string[]){
      await prunePassportAssetReferences(client,userId,{
        cardIds,
        achievementCodes:revokedAchievements.filter(row=>row.user_id===userId).map(row=>row.achievement_code),
        cosmeticCodes:revokedCosmetics.filter(row=>row.user_id===userId).map(row=>row.cosmetic_code),
      });
      if(cardIds.length)await reconcileCorrectedAchievementRewards(client,{
        userId,rootKey:`${rootKey}:${userId}`,actor,reason:input.reason,
      });
    }

    const currency=(await client.query<{id:string;user_id:string;action:string;delta:number;channel_slug:string|null}>(`SELECT id::text,user_id,action,delta,channel_slug FROM passport_ledger WHERE source_type='nomination' AND source_id=$1 AND action IN('xp.award','sparks.award')`,[input.nominationId])).rows;
    for(const entry of currency){
      const amount=Math.max(0,entry.delta);const compensatingDelta=passportCompensatingDelta(entry.delta);
      const reversal=await appendPassportLedger(client,{idempotencyKey:`${rootKey}:${entry.id}`,userId:entry.user_id,action:entry.action==="xp.award"?"xp.revoke":"sparks.revoke",assetType:entry.action==="xp.award"?"xp":"sparks",delta:compensatingDelta,channelSlug:entry.channel_slug,sourceType:"nomination_reversal",sourceId:input.nominationId,actorType:"staff",actorId:actor.id,reversalOf:Number(entry.id),data:{reason:input.reason}});
      if(reversal===null)continue;
      if(entry.action==="xp.award"){
        await client.query(`UPDATE passport_profiles SET global_xp=GREATEST(0,global_xp-$2),level=floor(sqrt(GREATEST(0,global_xp-$2)::numeric/100))::integer+1,updated_at=now() WHERE user_id=$1`,[entry.user_id,amount]);
        if(entry.channel_slug)await client.query(`UPDATE passport_channel_progress SET xp=GREATEST(0,xp-$3),level=floor(sqrt(GREATEST(0,xp-$3)::numeric/100))::integer+1,updated_at=now() WHERE user_id=$1 AND channel_slug=$2`,[entry.user_id,entry.channel_slug,amount]);
      }else await client.query(`UPDATE passport_profiles SET sparks=GREATEST(0,sparks-$2),updated_at=now() WHERE user_id=$1`,[entry.user_id,amount]);
    }

    const storedRarity=nomination.reward_data?.approvedBudgetClass;const rarity:RewardBudgetClass=storedRarity==="rare"||storedRarity==="legendary"?storedRarity:"common";const perRecipient=Math.max(1,Math.floor(Number(nomination.reward_data?.approvedBudgetUnitsPerRecipient ?? nomination.reward_data?.budgetUnitsPerRecipient ?? nomination.reward_data?.quantity ?? 1)));const units=(nomination.user_ids as string[]).length*perRecipient;const usedField=`${rarity}_used`;
    await client.query(`UPDATE passport_channel_controls SET ${usedField}=GREATEST(0,${usedField}-$2),updated_at=now(),updated_by=$3 WHERE channel_slug=$1 AND scope_key='*'`,[nomination.channel_slug,units,actor.id]);
    const revoked=(await client.query(`UPDATE passport_reward_nominations SET state='revoked',reviewed_by=$2,reviewed_at=now() WHERE id=$1 RETURNING *`,[input.nominationId,actor.id])).rows[0];
    await audit(client,actor,"reward.nomination_revoke","nomination",input.nominationId,input.reason,nomination,revoked);
    return revoked;
  });
}

const PRESENCE_ACTIVITY_METRICS=["event_attendance","events_attended"] as const;

async function assertPresenceCorrectionDependencies(
  client:PoolClient,
  input:{userId:string;eventId:string;channelSlug:string},
):Promise<void>{
  const claimedQuest=await client.query<{code:string}>(`SELECT q.code
    FROM passport_quest_progress p JOIN passport_quest_definitions q ON q.code=p.quest_code
    WHERE p.user_id=$1 AND p.state='claimed'
      AND (q.channel_slug IS NULL OR q.channel_slug=$2)
      AND ((q.objective->>'metric')=ANY($3::text[]) OR q.objective->'steps' ?| $3::text[])
    LIMIT 1`,[input.userId,input.channelSlug,[...PRESENCE_ACTIVITY_METRICS,"visit_channel"]]);
  if(claimedQuest.rows[0]){
    throw new PassportError("conflict",409,"presence_quest_claim_requires_manual_review");
  }
  const affectedGoals=await client.query<{goal_code:string;amount:string}>(`SELECT goal_code,SUM(amount)::text AS amount
    FROM passport_community_goal_contributions
    WHERE user_id=$1 AND revoked_at IS NULL
      AND (contribution_key LIKE $2 OR contribution_key LIKE $3)
    GROUP BY goal_code`,[
      input.userId,
      `activity:${input.userId}:verified:${input.eventId}:goal:%`,
      `activity:${input.userId}:achievement:${input.eventId}:goal:%`,
    ]);
  for(const affected of affectedGoals.rows){
    const unsafe=await client.query<{unsafe:boolean}>(`SELECT
      EXISTS(SELECT 1 FROM passport_community_goal_claims c
        WHERE c.goal_code=$1 AND c.user_id=$2)
      OR (
        COALESCE(p.total,0)-$3::bigint<g.target
        AND EXISTS(SELECT 1 FROM passport_community_goal_claims c WHERE c.goal_code=$1)
      ) AS unsafe
      FROM passport_community_goals g
      LEFT JOIN passport_community_goal_progress p ON p.goal_code=g.code
      WHERE g.code=$1`,[affected.goal_code,input.userId,affected.amount]);
    if(unsafe.rows[0]?.unsafe){
      throw new PassportError("conflict",409,"presence_community_claim_requires_manual_review");
    }
  }
}

async function reconcilePresenceCommunityContributions(
  client:PoolClient,
  input:{userId:string;eventId:string;destructive:boolean;reason:string},
):Promise<string[]>{
  const rows=input.destructive
    ? await client.query<{goal_code:string;amount:number}>(`UPDATE passport_community_goal_contributions
        SET revoked_at=now(),revoked_reason=$4
        WHERE user_id=$1 AND revoked_at IS NULL
          AND (contribution_key LIKE $2 OR contribution_key LIKE $3)
        RETURNING goal_code,amount`,[
          input.userId,
          `activity:${input.userId}:verified:${input.eventId}:goal:%`,
          `activity:${input.userId}:achievement:${input.eventId}:goal:%`,
          input.reason,
        ])
    : await client.query<{goal_code:string;amount:number}>(`UPDATE passport_community_goal_contributions
        SET revoked_at=NULL,revoked_reason=NULL
        WHERE user_id=$1 AND revoked_at IS NOT NULL
          AND (contribution_key LIKE $2 OR contribution_key LIKE $3)
        RETURNING goal_code,amount`,[
          input.userId,
          `activity:${input.userId}:verified:${input.eventId}:goal:%`,
          `activity:${input.userId}:achievement:${input.eventId}:goal:%`,
        ]);
  const amounts=new Map<string,number>();
  for(const row of rows.rows)amounts.set(row.goal_code,(amounts.get(row.goal_code)??0)+row.amount);
  for(const [goalCode,amount] of amounts){
    if(input.destructive){
      await client.query(`UPDATE passport_community_goal_progress p SET
        total=GREATEST(0,p.total-$2),
        state=CASE WHEN GREATEST(0,p.total-$2)>=(SELECT target FROM passport_community_goals WHERE code=$1)
          THEN p.state ELSE 'active' END,
        completed_at=CASE WHEN GREATEST(0,p.total-$2)>=(SELECT target FROM passport_community_goals WHERE code=$1)
          THEN p.completed_at ELSE NULL END,
        updated_at=now() WHERE p.goal_code=$1`,[goalCode,amount]);
    }else{
      await client.query(`UPDATE passport_community_goal_progress p SET
        total=p.total+$2,
        state=CASE WHEN p.total+$2>=(SELECT target FROM passport_community_goals WHERE code=$1)
          THEN 'completed' ELSE p.state END,
        completed_at=CASE WHEN p.completed_at IS NULL AND p.total+$2>=(SELECT target FROM passport_community_goals WHERE code=$1)
          THEN now() ELSE p.completed_at END,
        updated_at=now() WHERE p.goal_code=$1`,[goalCode,amount]);
    }
  }
  return[...amounts.keys()];
}

async function exactValidActivityMetric(
  client:PoolClient,
  input:{userId:string;metric:string;channelSlug:string|null;windowKey:string|null},
):Promise<number>{
  const visitMetric=input.metric==="visit_channel";
  const result=await client.query<{count:string}>(`SELECT COALESCE(${visitMetric
    ? "COUNT(DISTINCT l.channel_slug)"
    : "SUM(CASE WHEN l.asset_id=$2 THEN l.delta ELSE 0 END)"},0)::text AS count
    FROM passport_ledger l
    WHERE l.user_id=$1 AND l.action='activity.record' AND l.channel_slug IS NOT NULL
      AND ($3::text IS NULL OR l.channel_slug=$3)
      AND ($4::text IS NULL OR to_char(l.created_at AT TIME ZONE 'UTC','IYYY-\"W\"IW')=$4)
      AND (${visitMetric?"true":"l.asset_id=$2"})
      AND (l.source_type<>'event' OR EXISTS(
        SELECT 1 FROM passport_event_presence ep
        WHERE ep.user_id=l.user_id AND ep.event_id::text=l.source_id AND ep.state='verified'
      ))`,[input.userId,input.metric,input.channelSlug,input.windowKey]);
  return Math.max(0,Number(result.rows[0]?.count ?? 0));
}

async function reconcilePresenceQuestProgress(
  client:PoolClient,
  input:{userId:string;channelSlug:string},
):Promise<string[]>{
  const rows=(await client.query<{
    code:string;objective:Record<string,unknown>;progress:Record<string,unknown>;
    state:string;completion_count:number;channel_slug:string|null;
  }>(`SELECT q.code,q.objective,p.progress,p.state,p.completion_count,q.channel_slug
    FROM passport_quest_progress p JOIN passport_quest_definitions q ON q.code=p.quest_code
    WHERE p.user_id=$1 AND p.state IN('active','completed')
      AND (q.channel_slug IS NULL OR q.channel_slug=$2)
      AND ((q.objective->>'metric')=ANY($3::text[])
        OR q.objective->'steps' ?| $4::text[])
    FOR UPDATE OF p`,[
      input.userId,input.channelSlug,[...PRESENCE_ACTIVITY_METRICS],[...PRESENCE_ACTIVITY_METRICS,"visit_channel"],
    ])).rows;
  const changed:string[]=[];
  for(const row of rows){
    const steps=Array.isArray(row.objective.steps)
      ? row.objective.steps.filter((step):step is string=>typeof step==="string")
      : [];
    const required=typeof row.objective.required==="number"?row.objective.required:(steps.length||1);
    const windowKey=typeof row.progress.windowKey==="string"?row.progress.windowKey:null;
    let progress:Record<string,unknown>;
    let count:number;
    if(steps.length){
      const prior=Array.isArray(row.progress.steps)
        ? row.progress.steps.filter((step):step is string=>typeof step==="string"&&steps.includes(step))
        : [];
      const affected=new Set<string>([...PRESENCE_ACTIVITY_METRICS,"visit_channel"]);
      const completed=prior.filter(step=>!affected.has(step));
      for(const step of steps.filter(step=>affected.has(step))){
        if(await exactValidActivityMetric(client,{userId:input.userId,metric:step,channelSlug:row.channel_slug,windowKey}))completed.push(step);
      }
      const unique=[...new Set(completed)];
      count=unique.length;
      progress={...row.progress,steps:unique,count};
    }else{
      const metric=typeof row.objective.metric==="string"?row.objective.metric:"";
      count=await exactValidActivityMetric(client,{userId:input.userId,metric,channelSlug:row.channel_slug,windowKey});
      progress={...row.progress,count};
    }
    const state=count>=required?"completed":"active";
    if(state!==row.state||Number(row.progress.count ?? 0)!==count)changed.push(row.code);
    await client.query(`UPDATE passport_quest_progress SET progress=$3::jsonb,state=$4,
      completion_count=GREATEST(0,completion_count-CASE WHEN state='completed' AND $4='active' THEN 1 ELSE 0 END),
      completed_at=CASE WHEN $4='completed' THEN COALESCE(completed_at,now()) ELSE NULL END,
      updated_at=now() WHERE user_id=$1 AND quest_code=$2`,[
        input.userId,row.code,JSON.stringify(progress),state,
      ]);
  }
  return changed;
}

async function reconcileCorrectedAchievementRewards(
  client:PoolClient,
  input:{userId:string;rootKey:string;actor:PassportActor;reason:string},
):Promise<string[]>{
  const grants=(await client.query<{
    code:string;metric:string;channel_slug:string|null;threshold:number;
    reward:Record<string,unknown>;state:string;exact_progress:string;
  }>(`SELECT d.code,d.metric,d.channel_slug,d.threshold,d.reward,g.state,
      CASE WHEN d.metric='events_attended' THEN (
        SELECT COALESCE(SUM(cp.events_attended),0)::text FROM passport_channel_progress cp
         WHERE cp.user_id=$1 AND (d.channel_slug IS NULL OR cp.channel_slug=d.channel_slug)
      ) WHEN d.metric='channels_visited' THEN (
        SELECT COUNT(DISTINCT l.channel_slug)::text FROM passport_ledger l
         WHERE l.user_id=$1 AND l.action='activity.record' AND l.channel_slug IS NOT NULL
           AND (d.channel_slug IS NULL OR l.channel_slug=d.channel_slug)
           AND (l.source_type<>'event' OR EXISTS(
             SELECT 1 FROM passport_event_presence ep
              WHERE ep.user_id=l.user_id AND ep.event_id::text=l.source_id AND ep.state='verified'
           ))
      ) ELSE (
        SELECT COUNT(*)::text FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id
         WHERE c.owner_user_id=$1 AND c.state IN('active','locked','escrowed')
           AND (d.channel_slug IS NULL OR e.channel_slug=d.channel_slug)
      ) END AS exact_progress
    FROM passport_achievement_grants g JOIN passport_achievement_definitions d ON d.code=g.achievement_code
    WHERE g.user_id=$1 AND d.metric IN('events_attended','cards_collected','channels_visited')
    FOR UPDATE OF g`,[input.userId])).rows;
  const changed:string[]=[];
  for(const grant of grants){
    if(grant.state==="revoked")continue;
    const progress=Math.max(0,Number(grant.exact_progress));
    const nextState=progress>=grant.threshold?"active":"progress";
    await client.query(`UPDATE passport_achievement_grants SET progress=$3,state=$4,
      earned_at=CASE WHEN $4='active' THEN COALESCE(earned_at,now()) ELSE earned_at END
      WHERE user_id=$1 AND achievement_code=$2`,[input.userId,grant.code,progress,nextState]);
    if(nextState===grant.state)continue;
    changed.push(grant.code);
    const restoring=nextState==="active";
    await appendPassportLedger(client,{
      idempotencyKey:`${input.rootKey}:achievement:${grant.code}:${restoring?"restore":"revoke"}`,
      userId:input.userId,action:restoring?"achievement.restore_progress":"achievement.revoke_progress",
      assetType:"achievement",assetId:grant.code,channelSlug:grant.channel_slug,
      sourceType:"presence_correction",sourceId:grant.code,actorType:"staff",actorId:input.actor.id,
      data:{reason:input.reason,progress,threshold:grant.threshold},
    });
    for(const kind of ["xp","sparks"] as const){
      const awardAction=kind==="xp"?"xp.award":"sparks.award";
      const originals=(await client.query<{id:string;delta:number;channel_slug:string|null}>(
        `SELECT id::text,delta,channel_slug FROM passport_ledger
          WHERE user_id=$1 AND action=$2 AND source_type='achievement' AND source_id=$3 AND delta>0`,
        [input.userId,awardAction,grant.code],
      )).rows;
      for(const original of originals){
        const amount=original.delta;
        const entry=await appendPassportLedger(client,{
          idempotencyKey:`${input.rootKey}:achievement:${grant.code}:${kind}:${original.id}`,
          userId:input.userId,action:`${kind}.${restoring?"restore":"revoke"}`,
          assetType:kind,assetId:grant.code,delta:restoring?amount:passportCompensatingDelta(amount),
          channelSlug:original.channel_slug,sourceType:"presence_correction",sourceId:grant.code,
          actorType:"staff",actorId:input.actor.id,reversalOf:restoring?undefined:Number(original.id),
          data:{reason:input.reason,originalLedgerId:original.id},
        });
        if(entry===null)continue;
        if(kind==="xp"){
          await client.query(`UPDATE passport_profiles SET global_xp=GREATEST(0,global_xp+$2),
            level=floor(sqrt(GREATEST(0,global_xp+$2)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1`,[input.userId,restoring?amount:-amount]);
          if(original.channel_slug)await client.query(`UPDATE passport_channel_progress
            SET xp=GREATEST(0,xp+$3),level=floor(sqrt(GREATEST(0,xp+$3)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1 AND channel_slug=$2`,[input.userId,original.channel_slug,restoring?amount:-amount]);
        }else{
          await client.query(`UPDATE passport_profiles SET sparks=GREATEST(0,sparks+$2),updated_at=now()
            WHERE user_id=$1`,[input.userId,restoring?amount:-amount]);
        }
      }
    }
    const cosmetic=typeof grant.reward.cosmetic==="string"?grant.reward.cosmetic:null;
    if(cosmetic){
      const cosmeticResult=restoring
        ? await client.query(`UPDATE passport_cosmetic_unlocks SET state='active',revoked_at=NULL
            WHERE user_id=$1 AND cosmetic_code=$2 AND state='revoked'
              AND source_type='achievement' AND source_id=$3 RETURNING cosmetic_code`,[input.userId,cosmetic,grant.code])
        : await client.query(`UPDATE passport_cosmetic_unlocks SET state='revoked',revoked_at=now()
            WHERE user_id=$1 AND cosmetic_code=$2 AND state='active'
              AND source_type='achievement' AND source_id=$3 RETURNING cosmetic_code`,[input.userId,cosmetic,grant.code]);
      if(cosmeticResult.rows[0]){
        await appendPassportLedger(client,{
          idempotencyKey:`${input.rootKey}:achievement:${grant.code}:cosmetic:${cosmetic}`,
          userId:input.userId,action:`cosmetic.${restoring?"restore":"revoke"}`,
          assetType:"cosmetic",assetId:cosmetic,channelSlug:grant.channel_slug,
          sourceType:"presence_correction",sourceId:grant.code,actorType:"staff",actorId:input.actor.id,
          data:{reason:input.reason},
        });
        if(!restoring)await prunePassportAssetReferences(client,input.userId,{cardIds:[],achievementCodes:[],cosmeticCodes:[cosmetic]});
      }
    }
    if(!restoring)await prunePassportAssetReferences(client,input.userId,{cardIds:[],achievementCodes:[grant.code],cosmeticCodes:[]});
  }
  return changed;
}

export type PassportPresenceCorrectionInput={
  eventId:string;
  userId:string;
  decision:"revoke"|"reject"|"reinstate";
  reason:string;
  idempotencyKey:string;
};

/**
 * Audited correction for fraudulent or mistakenly rejected attendance.
 * Destructive corrections are deliberately admin-only: they compensate XP,
 * attendance counts and badge progress and revoke only still-owned attendance
 * cards. A card that has already changed hands requires a separate manual
 * economic unwind rather than silently clawing it from an innocent owner.
 */
export async function correctPassportPresence(
  actor:PassportActor,
  input:PassportPresenceCorrectionInput,
){
  if(actor.role!=="admin")throw new PassportError("forbidden",403,"presence_correction_requires_admin");
  const reason=input.reason.trim();
  if(reason.length<3||reason.length>1000)throw new PassportError("invalid_input",400,"invalid_correction_reason");
  return withTransaction(async(client)=>{
    const row=(await client.query<{
      event_id:string;user_id:string;state:string;claimed_at:string|null;
      watch_seconds:number;heartbeat_count:number;channel_slug:string;
      minimum_watch_seconds:number;
    }>(`SELECT p.event_id::text,p.user_id,p.state,p.claimed_at::text,p.watch_seconds,p.heartbeat_count,
               e.channel_slug,e.minimum_watch_seconds
          FROM passport_event_presence p JOIN passport_events e ON e.id=p.event_id
         WHERE p.event_id=$1 AND p.user_id=$2 FOR UPDATE OF p`,[input.eventId,input.userId])).rows[0];
    if(!row)throw new PassportError("not_found",404,"presence_not_found");

    const destructive=input.decision!=="reinstate";
    const destructiveState=input.decision==="revoke"?"revoked":"rejected";
    if(destructive&&row.state===destructiveState)return{presence:row,changed:false};
    const alreadyUnwound=destructive&&['revoked','rejected'].includes(row.state);
    if(!destructive&&!['revoked','rejected'].includes(row.state)){
      throw new PassportError("invalid_state",409,"presence_not_corrected");
    }
    const claimed=row.claimed_at!==null;
    if(destructive&&claimed&&!alreadyUnwound){
      await assertPresenceCorrectionDependencies(client,{
        userId:input.userId,eventId:input.eventId,channelSlug:row.channel_slug,
      });
    }

    const rootKey=`presence-correction:${input.eventId}:${input.userId}:${input.idempotencyKey}`;
    const rootLedger=await appendPassportLedger(client,{
      idempotencyKey:rootKey,userId:input.userId,action:`presence.${input.decision}`,
      assetType:"attendance",assetId:input.eventId,channelSlug:row.channel_slug,
      sourceType:"presence_correction",sourceId:input.eventId,
      actorType:"staff",actorId:actor.id,data:{reason,previousState:row.state},
    });
    if(rootLedger===null)return{presence:row,changed:false};

    let affectedCardIds:string[]=[];
    let compensatedXp=0;
    let affectedAchievements:string[]=[];
    let affectedQuests:string[]=[];
    let affectedCommunityGoals:string[]=[];

    if(alreadyUnwound){
      const relabelled=(await client.query(
        `UPDATE passport_event_presence SET state=$3,updated_at=now()
          WHERE event_id=$1 AND user_id=$2 RETURNING *`,
        [input.eventId,input.userId,destructiveState],
      )).rows[0];
      await audit(client,actor,`presence.${input.decision}`,"presence",`${input.eventId}:${input.userId}`,reason,row,relabelled);
      return{presence:relabelled,changed:true,affectedCardIds,affectedAchievements,affectedQuests,affectedCommunityGoals,compensatedXp};
    }

    if(destructive){
      const presenceCards=(await client.query<{
        id:string;owner_user_id:string|null;original_user_id:string|null;
        state:string;acquired_via:string;
      }>(`SELECT c.id::text,c.owner_user_id,c.original_user_id,c.state,c.acquired_via
            FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id
           WHERE e.event_id=$1 AND c.original_user_id=$2
             AND c.provenance->>'eventId'=$1::text
           FOR UPDATE OF c`,[input.eventId,input.userId])).rows;
      const transferred=presenceCards.find(card=>
        card.owner_user_id!==input.userId||card.original_user_id!==input.userId||['gift','trade'].includes(card.acquired_via),
      );
      if(transferred){
        throw new PassportError("conflict",409,"presence_assets_transferred_manual_review");
      }
      const cardIds=presenceCards.map(card=>card.id);
      if(cardIds.length){
        const tradeIds=(await client.query<{trade_id:string}>(
          `SELECT DISTINCT trade_id::text FROM passport_trade_items
            WHERE card_id=ANY($1::uuid[]) AND released_at IS NULL`,[cardIds],
        )).rows;
        for(const trade of tradeIds){
          await client.query(`UPDATE passport_trade_items SET released_at=COALESCE(released_at,now()) WHERE trade_id=$1`,[trade.trade_id]);
          await client.query(`UPDATE passport_trades SET state='revoked',resolved_at=now()
            WHERE id=$1 AND state IN('pending','awaiting_confirmation','cooling_off')`,[trade.trade_id]);
        }
        await client.query(`UPDATE passport_gifts SET state='revoked',resolved_at=now()
          WHERE card_id=ANY($1::uuid[]) AND state='pending'`,[cardIds]);
        affectedCardIds=(await client.query<{id:string}>(
          `UPDATE passport_cards SET state='revoked',lock_reason=NULL,revoked_at=now(),
             revoked_reason=$3,updated_at=now()
            WHERE id=ANY($1::uuid[]) AND owner_user_id=$2 AND state IN('active','locked')
          RETURNING id::text`,[cardIds,input.userId,`presence_${input.decision}:${input.eventId}:${reason}`],
        )).rows.map(card=>card.id);
        for(const cardId of affectedCardIds){
          await appendPassportLedger(client,{
            idempotencyKey:`${rootKey}:card:${cardId}`,userId:input.userId,
            action:"card.revoke",assetType:"card",assetId:cardId,channelSlug:row.channel_slug,
            sourceType:"presence_correction",sourceId:input.eventId,actorType:"staff",actorId:actor.id,
            data:{reason},
          });
        }
      }
      if(claimed){
        await client.query(`UPDATE passport_channel_progress
          SET events_attended=GREATEST(0,events_attended-1),updated_at=now()
          WHERE user_id=$1 AND channel_slug=$2`,[input.userId,row.channel_slug]);
        const xpEntries=(await client.query<{id:string;delta:number;channel_slug:string|null}>(
          `SELECT id::text,delta,channel_slug FROM passport_ledger
            WHERE user_id=$1 AND action='xp.award' AND source_type='event' AND source_id=$2 AND delta>0`,
          [input.userId,input.eventId],
        )).rows;
        for(const entry of xpEntries){
          const reversal=await appendPassportLedger(client,{
            idempotencyKey:`${rootKey}:xp:${entry.id}`,userId:input.userId,action:"xp.revoke",
            assetType:"xp",assetId:input.eventId,delta:passportCompensatingDelta(entry.delta),
            channelSlug:entry.channel_slug,sourceType:"presence_correction",sourceId:input.eventId,
            actorType:"staff",actorId:actor.id,reversalOf:Number(entry.id),data:{reason,originalLedgerId:entry.id},
          });
          if(reversal===null)continue;
          compensatedXp+=entry.delta;
          await client.query(`UPDATE passport_profiles SET global_xp=GREATEST(0,global_xp-$2),
            level=floor(sqrt(GREATEST(0,global_xp-$2)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1`,[input.userId,entry.delta]);
          if(entry.channel_slug)await client.query(`UPDATE passport_channel_progress
            SET xp=GREATEST(0,xp-$3),level=floor(sqrt(GREATEST(0,xp-$3)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1 AND channel_slug=$2`,[input.userId,entry.channel_slug,entry.delta]);
        }
      }
      await prunePassportAssetReferences(client,input.userId,{
        cardIds:affectedCardIds,achievementCodes:affectedAchievements,cosmeticCodes:[],
      });
    }else{
      if(claimed){
        affectedCardIds=(await client.query<{id:string}>(
          `UPDATE passport_cards SET state='active',revoked_at=NULL,revoked_reason=NULL,updated_at=now()
            WHERE owner_user_id=$2 AND state='revoked'
              AND provenance->>'eventId'=$1::text
              AND (revoked_reason LIKE 'presence_revoke:'||$1::text||':%'
                OR revoked_reason LIKE 'presence_reject:'||$1::text||':%')
          RETURNING id::text`,[input.eventId,input.userId],
        )).rows.map(card=>card.id);
        for(const cardId of affectedCardIds){
          await appendPassportLedger(client,{
            idempotencyKey:`${rootKey}:card:${cardId}`,userId:input.userId,action:"card.restore",
            assetType:"card",assetId:cardId,channelSlug:row.channel_slug,
            sourceType:"presence_correction",sourceId:input.eventId,actorType:"staff",actorId:actor.id,
            data:{reason},
          });
        }
        await client.query(`INSERT INTO passport_channel_progress(user_id,channel_slug,events_attended,last_active_at)
          VALUES($1,$2,1,now()) ON CONFLICT(user_id,channel_slug) DO UPDATE
          SET events_attended=passport_channel_progress.events_attended+1,last_active_at=now(),updated_at=now()`,
          [input.userId,row.channel_slug],
        );
        const xpEntries=(await client.query<{id:string;delta:number;channel_slug:string|null}>(
          `SELECT id::text,delta,channel_slug FROM passport_ledger
            WHERE user_id=$1 AND action='xp.award' AND source_type='event' AND source_id=$2 AND delta>0`,
          [input.userId,input.eventId],
        )).rows;
        for(const entry of xpEntries){
          const restored=await appendPassportLedger(client,{
            idempotencyKey:`${rootKey}:xp:${entry.id}`,userId:input.userId,action:"xp.restore",
            assetType:"xp",assetId:input.eventId,delta:entry.delta,channelSlug:entry.channel_slug,
            sourceType:"presence_correction",sourceId:input.eventId,actorType:"staff",actorId:actor.id,
            data:{reason,originalLedgerId:entry.id},
          });
          if(restored===null)continue;
          compensatedXp+=entry.delta;
          await client.query(`UPDATE passport_profiles SET global_xp=global_xp+$2,
            level=floor(sqrt((global_xp+$2)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1`,[input.userId,entry.delta]);
          if(entry.channel_slug)await client.query(`UPDATE passport_channel_progress
            SET xp=xp+$3,level=floor(sqrt((xp+$3)::numeric/100))::integer+1,updated_at=now()
            WHERE user_id=$1 AND channel_slug=$2`,[input.userId,entry.channel_slug,entry.delta]);
        }
      }
    }

    const targetState=input.decision==="reinstate"
      ? (claimed?"verified":(row.watch_seconds>=row.minimum_watch_seconds&&row.heartbeat_count>=2?"eligible":"observed"))
      : input.decision==="revoke"?"revoked":"rejected";
    const next=(await client.query(
      `UPDATE passport_event_presence SET state=$3,updated_at=now()
        WHERE event_id=$1 AND user_id=$2 RETURNING *`,
      [input.eventId,input.userId,targetState],
    )).rows[0];

    if(claimed){
      affectedCommunityGoals=await reconcilePresenceCommunityContributions(client,{
        userId:input.userId,eventId:input.eventId,destructive,reason,
      });
      affectedQuests=await reconcilePresenceQuestProgress(client,{
        userId:input.userId,channelSlug:row.channel_slug,
      });
    }
    affectedAchievements=await reconcileCorrectedAchievementRewards(client,{
      userId:input.userId,rootKey,actor,reason,
    });
    await audit(client,actor,`presence.${input.decision}`,"presence",`${input.eventId}:${input.userId}`,reason,row,next);
    return{presence:next,changed:true,affectedCardIds,affectedAchievements,affectedQuests,affectedCommunityGoals,compensatedXp};
  });
}

export async function revokePassportAsset(actor:PassportActor,input:{userId:string;assetType:"card"|"achievement"|"cosmetic";assetId:string;channelSlug?:string|null;reason:string;idempotencyKey:string}){return withTransaction(async(client)=>{await requirePermission(client,actor,"reward.revoke",{channelSlug:input.channelSlug});const key=`revoke:${input.userId}:${input.idempotencyKey}`;const ledger=await appendPassportLedger(client,{idempotencyKey:key,userId:input.userId,action:`${input.assetType}.revoke`,assetType:input.assetType,assetId:input.assetId,channelSlug:input.channelSlug,sourceType:"moderation",sourceId:input.assetId,actorType:"staff",actorId:actor.id,data:{reason:input.reason}});if(ledger===null)return {revoked:false};let result;if(input.assetType==="card")result=await client.query(`UPDATE passport_cards SET state='revoked',lock_reason=NULL,revoked_at=now(),revoked_reason=$3,updated_at=now() WHERE id=$1 AND owner_user_id=$2 RETURNING *`,[input.assetId,input.userId,input.reason]);else if(input.assetType==="achievement")result=await client.query(`UPDATE passport_achievement_grants SET state='revoked',revoked_at=now(),revoked_reason=$3 WHERE user_id=$1 AND achievement_code=$2 RETURNING *`,[input.userId,input.assetId,input.reason]);else result=await client.query(`UPDATE passport_cosmetic_unlocks SET state='revoked',revoked_at=now() WHERE user_id=$1 AND cosmetic_code=$2 RETURNING *`,[input.userId,input.assetId]);if(!result.rows[0])throw new PassportError("not_found",404);await prunePassportAssetReferences(client,input.userId,{cardIds:input.assetType==="card"?[input.assetId]:[],achievementCodes:input.assetType==="achievement"?[input.assetId]:[],cosmeticCodes:input.assetType==="cosmetic"?[input.assetId]:[]});if(input.assetType==="card")await reconcileCorrectedAchievementRewards(client,{userId:input.userId,rootKey:key,actor,reason:input.reason});await audit(client,actor,"reward.revoke",input.assetType,input.assetId,input.reason,null,result.rows[0]);return {revoked:true,asset:result.rows[0]};});}

export async function reviewPassportAppeal(actor:PassportActor,input:{appealId:string;state:"under_review"|"approved"|"denied"|"closed";response:string}){return withTransaction(async(client)=>{await requirePermission(client,actor,"appeal.review");const previous=(await client.query(`SELECT * FROM passport_appeals WHERE id=$1 FOR UPDATE`,[input.appealId])).rows[0];if(!previous)throw new PassportError("not_found",404);const next=(await client.query(`UPDATE passport_appeals SET state=$2,response=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[input.appealId,input.state,input.response,actor.id])).rows[0];await audit(client,actor,"appeal.review","appeal",input.appealId,input.response,previous,next);return next;});}

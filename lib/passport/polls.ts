import "server-only";

import { query } from "@/lib/db";

export type PassportPollAudienceDecision = {
  allowed:boolean;
  audience:"everyone"|"signed_in"|"live_attendees"|"members";
  reason?:"live_attendance_required"|"verified_account_required"|"passport_schema_required";
};

export async function checkPassportPollAudience(pollId:string,userId:string):Promise<PassportPollAudienceDecision>{
  const poll=await query<{passport_audience:PassportPollAudienceDecision["audience"]}>(`SELECT passport_audience FROM polls WHERE id=$1`,[pollId]);
  const audience=poll.rows[0]?.passport_audience ?? "signed_in";
  if(audience==="members"){
    const verified=await query<{allowed:boolean}>(
      `SELECT EXISTS(SELECT 1 FROM fan_users WHERE id=$1 AND email_verified) AS allowed`,
      [userId],
    );
    return verified.rows[0]?.allowed
      ? {allowed:true,audience}
      : {allowed:false,audience,reason:"verified_account_required"};
  }
  if(audience!=="live_attendees")return{allowed:true,audience};
  const schema=await query<{available:boolean}>(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='polls' AND column_name='passport_event_id') AND to_regclass('public.passport_event_presence') IS NOT NULL AS available`);
  if(!schema.rows[0]?.available)return{allowed:false,audience,reason:"passport_schema_required"};
  const eligible=await query<{allowed:boolean}>(`SELECT EXISTS(
    SELECT 1 FROM polls p JOIN passport_event_presence ep ON ep.event_id=p.passport_event_id
    WHERE p.id=$1 AND ep.user_id=$2 AND ep.state IN('eligible','verified')
  ) AS allowed`,[pollId,userId]);
  return eligible.rows[0]?.allowed?{allowed:true,audience}:{allowed:false,audience,reason:"live_attendance_required"};
}

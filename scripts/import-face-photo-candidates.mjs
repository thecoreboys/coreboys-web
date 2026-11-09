/** Import private research candidates; never records consent or enrolls faces. */
import { z } from "zod";

const Https = z.string().max(3000).url().refine(value=>{
  const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port;
});
export const PhotoResearchManifest = z.array(z.object({
  id:z.string().uuid(),kind:z.enum(['member','guest']),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  sourceUrl:Https.refine(value=>value.length<=2000),imageSourceUrl:Https,sourceLabel:z.string().min(1).max(240),
  researchNote:z.string().max(1500),checkedAt:z.string().datetime({offset:true}),
  storageKey:z.string().regex(/^[0-9a-f-]{36}\.webp$/),contentSha256:z.string().regex(/^[a-f0-9]{64}$/),
  byteSize:z.number().int().min(1).max(15728640),width:z.number().int().min(64),height:z.number().int().min(64),
}).strict()).min(1).max(1000).superRefine((rows,ctx)=>{
  const keys=new Set(),ids=new Set(),storage=new Set();
  for(const row of rows){
    const key=`${row.kind}:${row.slug}:${row.contentSha256}`;
    if(keys.has(key)||ids.has(row.id)||storage.has(row.storageKey))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Duplicate candidate in manifest.'});
    keys.add(key);ids.add(row.id);storage.add(row.storageKey);
    if(row.kind==='member'&&!['adapt','ron','lacy','marlon','jason','silky'].includes(row.slug))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Unknown CORE member.'});
  }
});

export async function importPhotoCandidates(db,raw,requester,apply=false){
  const entries=PhotoResearchManifest.parse(raw);
  const owner=(await db.query("SELECT id FROM admin_users WHERE lower(email)=lower($1) AND role='admin' AND deleted_at IS NULL",[requester])).rows[0];
  if(!owner)throw new Error('Requesting owner must have an active admin account.');
  const guests=new Set((await db.query('SELECT slug FROM face_guest_profiles')).rows.map(row=>row.slug));
  if(entries.some(row=>row.kind==='guest'&&!guests.has(row.slug)))throw new Error('Save all guest profiles before preparing their photos.');
  const existing=new Set((await db.query('SELECT canonical_kind,canonical_slug,content_sha256 FROM face_photo_candidates')).rows.map(row=>`${row.canonical_kind}:${row.canonical_slug}:${row.content_sha256}`));
  const pending=entries.filter(row=>!existing.has(`${row.kind}:${row.slug}:${row.contentSha256}`));
  if(!apply)return{mode:'preview',toCreate:pending.length,existingSkipped:entries.length-pending.length};
  let created=0;
  await db.query('BEGIN');
  try{
    for(const p of pending){
      const result=await db.query(`INSERT INTO face_photo_candidates(id,canonical_kind,canonical_slug,source_url,image_source_url,
        source_label,research_note,checked_at,storage_key,content_sha256,byte_size,width,height)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (canonical_kind,canonical_slug,content_sha256) DO NOTHING RETURNING id`,
        [p.id,p.kind,p.slug,p.sourceUrl,p.imageSourceUrl,p.sourceLabel,p.researchNote,p.checkedAt,p.storageKey,p.contentSha256,p.byteSize,p.width,p.height]);
      if(!result.rows.length)continue;
      created++;
      await db.query(`INSERT INTO face_audit_log(actor_type,actor_id,action,target_type,target_id,after_state,request_id)
        VALUES ('system','reference-photo-research','photo_candidate.prepared','face_photo_candidate',$1,$2::jsonb,'photo-intake-20261109')`,
        [p.id,JSON.stringify({requestedBy:owner.id,canonicalKey:`${p.kind}:${p.slug}`,sourceUrl:p.sourceUrl,subjectApproved:false,rightsConfirmed:false,enrollmentCreated:false})]);
    }
    await db.query('COMMIT');
    return{mode:'applied',created,existingSkipped:entries.length-created};
  }catch(error){await db.query('ROLLBACK');throw error;}
}

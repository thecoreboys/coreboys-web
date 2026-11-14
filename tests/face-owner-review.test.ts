import assert from "node:assert/strict";
import test from "node:test";
import { FaceReferenceActionSchema,FaceConsentGrantSchema } from "../lib/face-recognition-contracts";
import { normalizeFaceOverview,EMPTY_FACE_OVERVIEW } from "../components/admin/faces/types";

test("owner photo approval requires an explicit action, confirmation and note",()=>{
  const input={action:"approve_owner",ownerConfirmed:true,note:"Owner confirms exact-photo permission and quality"};
  assert.equal(FaceReferenceActionSchema.safeParse(input).success,true);
  for(const value of [{...input,ownerConfirmed:false},{...input,ownerConfirmed:undefined},{...input,note:""},{...input,reviewedBy:"another-person"}])assert.equal(FaceReferenceActionSchema.safeParse(value).success,false);
  assert.equal(FaceReferenceActionSchema.safeParse({action:"approve",note:"Independent review"}).success,true);
});

test("owner capability defaults off and is never inferred from service readiness",()=>{
  const overview={...EMPTY_FACE_OVERVIEW,service:{...EMPTY_FACE_OVERVIEW.service,status:"ready"}};
  assert.equal(normalizeFaceOverview(overview).ownerPhotoReviewAllowed,false);
  assert.equal(normalizeFaceOverview({...overview,ownerPhotoReviewAllowed:true}).ownerPhotoReviewAllowed,true);
});

test("email-owner attestation remains distinct from a signed release and still requires adult status and bounded permission",()=>{
  const input={consentVersion:"owner-email-v1",captureMethod:"owner_attested_email",evidenceRef:"Owner reports email permission on file",consentTextSha256:"a".repeat(64),subjectConfirmedAdult:true,adultVerifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),permissions:{allowTemplateCreation:true,allowLiveMatching:false,allowArchiveMatching:false,allowPublicTag:false,allowProfileLinks:false},approvedContentIds:[],approvedArchiveScopes:[]};
  assert.equal(FaceConsentGrantSchema.parse(input).captureMethod,"owner_attested_email");
  assert.equal(FaceConsentGrantSchema.safeParse({...input,subjectConfirmedAdult:false}).success,false);
  assert.equal(FaceConsentGrantSchema.safeParse({...input,evidenceRef:""}).success,false);
  assert.equal(FaceConsentGrantSchema.safeParse({...input,permissions:{...input.permissions,allowArchiveMatching:true}}).success,false);
});

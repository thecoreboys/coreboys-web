import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PASSPORT_PRIVACY,
  PassportError,
  assertPassportEligibleRewardRecipients,
  assertPassportNoSelfGrant,
  creditedHeartbeatSeconds,
  normalizePassportPrivacy,
  passportCompensatingDelta,
  passportLevelForXp,
  passportNextLevelXp,
  passportUtcWeekKey,
  passportWatchCompletionMinimum,
  passportPlaybackProviderIds,
  passportEventTransitionAllowed,
  passportPollTransitionAllowed,
  passportCurrencyRewardPolicy,
  presenceIsEligible,
  publicSectionAllowed,
  sanitizePublicPassportProvenance,
  serverCreditedWatchSeconds,
} from "../lib/passport/policy";
import { PassportActionSchema } from "../lib/passport/schemas";

test("Passport levels use stable quadratic thresholds",()=>{
  assert.equal(passportLevelForXp(0),1);
  assert.equal(passportLevelForXp(99),1);
  assert.equal(passportLevelForXp(100),2);
  assert.equal(passportLevelForXp(900),4);
  assert.equal(passportNextLevelXp(100),400);
});

test("events follow a forward-only lifecycle before certification",()=>{
  assert.equal(passportEventTransitionAllowed("draft","scheduled"),true);
  assert.equal(passportEventTransitionAllowed("scheduled","live"),true);
  assert.equal(passportEventTransitionAllowed("live","ended"),true);
  assert.equal(passportEventTransitionAllowed("ended","certified"),true);
  assert.equal(passportEventTransitionAllowed("draft","certified"),false);
  assert.equal(passportEventTransitionAllowed("certified","live"),false);
  assert.equal(passportEventTransitionAllowed("cancelled","scheduled"),false);
});

test("polls cannot publish drafts as certified or reopen final results",()=>{
  assert.equal(passportPollTransitionAllowed("draft","preview"),true);
  assert.equal(passportPollTransitionAllowed("preview","live"),true);
  assert.equal(passportPollTransitionAllowed("live","locked"),true);
  assert.equal(passportPollTransitionAllowed("locked","certified"),true);
  assert.equal(passportPollTransitionAllowed("draft","certified"),false);
  assert.equal(passportPollTransitionAllowed("certified","live"),false);
});

test("staff currency rewards use server-defined caps, tiers, and budget costs",()=>{
  assert.deepEqual(passportCurrencyRewardPolicy("xp",100),{amount:100,rarity:"common",budgetUnits:1});
  assert.deepEqual(passportCurrencyRewardPolicy("xp",500),{amount:500,rarity:"rare",budgetUnits:5});
  assert.deepEqual(passportCurrencyRewardPolicy("xp",1_000),{amount:1_000,rarity:"legendary",budgetUnits:10});
  assert.deepEqual(passportCurrencyRewardPolicy("sparks",250),{amount:250,rarity:"legendary",budgetUnits:10});
  assert.throws(()=>passportCurrencyRewardPolicy("xp",10_000),/xp_reward_too_large/);
  assert.throws(()=>passportCurrencyRewardPolicy("sparks",0),/invalid_currency_reward_amount/);
});

test("privacy defaults keep inventory and activity private",()=>{
  assert.deepEqual(normalizePassportPrivacy(null),DEFAULT_PASSPORT_PRIVACY);
  assert.equal(DEFAULT_PASSPORT_PRIVACY.inventory,"private");
  assert.equal(DEFAULT_PASSPORT_PRIVACY.activity,"private");
  assert.equal(publicSectionAllowed("private",true,false),false);
  assert.equal(publicSectionAllowed("members",false,false),false);
  assert.equal(publicSectionAllowed("members",true,false),true);
  assert.equal(publicSectionAllowed("private",false,true),true);
});

test("heartbeat credit requires continuous visible playback and plausible position advance",()=>{
  const receivedAt=new Date("2026-08-20T20:00:40.000Z");
  const previousReceivedAt=new Date("2026-08-20T20:00:00.000Z");
  const active={previousReceivedAt,receivedAt,previousPlaying:true,previousVisible:true,previousPositionSeconds:10,currentPositionSeconds:50,sameSession:true,playing:true,visible:true};
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:30}),40);
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:10}),20);
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:30,previousPlaying:false}),0);
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:30,currentPositionSeconds:10}),0);
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:30,currentPositionSeconds:200}),0);
  assert.equal(creditedHeartbeatSeconds({...active,heartbeatIntervalSeconds:30,sameSession:false}),0);
  assert.equal(presenceIsEligible({watchSeconds:120,minimumWatchSeconds:120,heartbeatCount:2}),true);
  assert.equal(presenceIsEligible({watchSeconds:120,minimumWatchSeconds:120,heartbeatCount:1}),false);
});

test("self grants are rejected before reward mutation",()=>{
  assert.doesNotThrow(()=>assertPassportNoSelfGrant("fan-a",["fan-b"]));
  assert.throws(
    ()=>assertPassportNoSelfGrant("fan-a",["fan-b","fan-a"]),
    (error:unknown)=>error instanceof PassportError&&error.code==="forbidden"&&error.message==="self_grant_not_allowed",
  );
});

test("event rewards reject recipients outside the verified attendee set",()=>{
  assert.doesNotThrow(()=>assertPassportEligibleRewardRecipients(["fan-a","fan-a"],["fan-a"]));
  assert.throws(
    ()=>assertPassportEligibleRewardRecipients(["fan-a","fan-b"],["fan-a"]),
    (error:unknown)=>error instanceof PassportError&&error.code==="not_eligible"&&error.message==="event_recipient_not_eligible",
  );
});

test("currency revocations are compensating and never create positive value",()=>{
  assert.equal(passportCompensatingDelta(100),-100);
  assert.equal(passportCompensatingDelta(0),-0);
  assert.equal(passportCompensatingDelta(-50),-0);
});

test("weekly repeatable quests use Monday UTC windows",()=>{
  assert.equal(passportUtcWeekKey(new Date("2026-08-23T23:59:59Z")),"2026-08-17");
  assert.equal(passportUtcWeekKey(new Date("2026-08-24T00:00:00Z")),"2026-08-24");
});

test("watch credit is server-timed, ref-bound, monotonic, and plausibly paced",()=>{
  const previousGlobalTickAt=new Date("2026-08-20T20:00:00.000Z");
  const receivedAt=new Date("2026-08-20T20:00:15.000Z");
  assert.equal(serverCreditedWatchSeconds({previousPositionSeconds:null,currentPositionSeconds:15,previousGlobalTickAt,receivedAt,sameCanonicalRef:true}),0);
  assert.equal(serverCreditedWatchSeconds({previousPositionSeconds:0,currentPositionSeconds:15,previousGlobalTickAt,receivedAt,sameCanonicalRef:true}),15);
  assert.equal(serverCreditedWatchSeconds({previousPositionSeconds:0,currentPositionSeconds:15,previousGlobalTickAt,receivedAt,sameCanonicalRef:false}),0);
  assert.equal(serverCreditedWatchSeconds({previousPositionSeconds:15,currentPositionSeconds:15,previousGlobalTickAt,receivedAt,sameCanonicalRef:true}),0);
  assert.equal(serverCreditedWatchSeconds({previousPositionSeconds:0,currentPositionSeconds:120,previousGlobalTickAt,receivedAt,sameCanonicalRef:true}),0);
  assert.equal(passportWatchCompletionMinimum(null),300);
  assert.equal(passportWatchCompletionMinimum(null,true),10);
  assert.equal(passportWatchCompletionMinimum(15),12);
  assert.equal(passportWatchCompletionMinimum(29),24);
  assert.equal(passportWatchCompletionMinimum(60),48);
  assert.equal(passportWatchCompletionMinimum(3600),2880);
  assert.deepEqual(passportPlaybackProviderIds("yt-dQw4w9WgXcQ","youtube"),["yt-dQw4w9WgXcQ","dQw4w9WgXcQ"]);
  assert.deepEqual(passportPlaybackProviderIds("vod-12345","twitch"),["vod-12345","12345"]);
  assert.deepEqual(passportPlaybackProviderIds("clip-AbCd","twitch"),["clip-AbCd","AbCd"]);
  assert.deepEqual(passportPlaybackProviderIds("tt-987","tiktok"),["tt-987","987"]);
  assert.deepEqual(passportPlaybackProviderIds("ig-reel_42","instagram"),["ig-reel_42","reel_42"]);
});

test("public card provenance excludes internal moderation fields",()=>{
  assert.deepEqual(sanitizePublicPassportProvenance({
    eventCode:"house-game",eventTitle:"House Game",variant:"signed",
    actorId:"admin-secret",nominationId:"internal-id",reason:"moderation note",
    edition:{signedBy:"lacy",variant:"signed",collectionPolicy:{tradeable:true}},
  }),{eventCode:"house-game",eventTitle:"House Game",variant:"signed",signedBy:"lacy"});
});

test("Passport action schema accepts canonical heartbeats and rejects ambiguous trades",()=>{
  assert.equal(PassportActionSchema.safeParse({
    action:"presence.heartbeat",
    payload:{eventId:"11111111-1111-4111-8111-111111111111",sessionId:"session_123456",playbackRef:"youtube:abc",positionSeconds:30,playing:true,visible:true},
  }).success,true);
  assert.equal(PassportActionSchema.safeParse({
    action:"trade.create",
    payload:{recipient:"fan@example.com",offeredCardIds:["11111111-1111-4111-8111-111111111111"],requestedCardIds:["11111111-1111-4111-8111-111111111111"],idempotencyKey:"trade-request-1"},
  }).success,false);
});

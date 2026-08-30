import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const webMigration=readFileSync(resolve(process.cwd(),"scripts/migrations/015_core_passport.sql"),"utf8");
const internalSource=readFileSync(resolve(process.cwd(),"lib/passport/internal.ts"),"utf8");
const activitySource=readFileSync(resolve(process.cwd(),"lib/passport/activity.ts"),"utf8");
const adminSource=readFileSync(resolve(process.cwd(),"lib/passport/admin.ts"),"utf8");
const readSource=readFileSync(resolve(process.cwd(),"lib/passport/read.ts"),"utf8");
const presenceSource=readFileSync(resolve(process.cwd(),"lib/passport/presence.ts"),"utf8");
const watchSource=readFileSync(resolve(process.cwd(),"lib/passport/watch.ts"),"utf8");
const progressRouteSource=readFileSync(resolve(process.cwd(),"app/api/account/progress/route.ts"),"utf8");
const watchHookSource=readFileSync(resolve(process.cwd(),"hooks/useWatchProgress.ts"),"utf8");
const socialSource=readFileSync(resolve(process.cwd(),"lib/passport/social.ts"),"utf8");
const actionsSource=readFileSync(resolve(process.cwd(),"lib/passport/actions.ts"),"utf8");
const pointsSource=readFileSync(resolve(process.cwd(),"lib/points.ts"),"utf8");
const communitySource=readFileSync(resolve(process.cwd(),"lib/community.ts"),"utf8");
const watchRegistrySource=readFileSync(resolve(process.cwd(),"lib/passport/watch-registry.ts"),"utf8");
const chatIdentitySource=readFileSync(resolve(process.cwd(),"lib/passport/chat-identities.ts"),"utf8");
const maintenanceSource=readFileSync(resolve(process.cwd(),"app/api/passport/maintenance/route.ts"),"utf8");
const photoModerationSource=readFileSync(resolve(process.cwd(),"app/api/admin/fan-submissions/[id]/route.ts"),"utf8");

test("Passport migration encodes private, append-only, account-bound defaults",()=>{
  assert.match(webMigration,/"inventory":"private"/);
  assert.match(webMigration,/account_bound boolean NOT NULL DEFAULT true/);
  assert.match(webMigration,/passport_ledger is append-only/);
  assert.match(webMigration,/NEW\.user_id IS NULL/);
  assert.match(webMigration,/released_at IS NULL/);
});

test("sealed editions cannot issue new serials and issuance locks max supply",()=>{
  assert.match(internalSource,/WHERE id = \$1\s+FOR UPDATE/);
  assert.match(internalSource,/edition\.state !== "published"/);
  assert.match(adminSource,/only_published_editions_can_be_sealed/);
  assert.match(adminSource,/if\(previous\.state==="sealed"\)return previous/);
});

test("trades require acceptance, both confirmations, cooling off, and released locks",()=>{
  assert.match(socialSource,/state='awaiting_confirmation'/);
  assert.match(socialSource,/proposer_confirmed&&next\.recipient_confirmed/);
  assert.match(socialSource,/TRADE_COOLING_MINUTES = 60/);
  assert.match(socialSource,/state='completed'/);
  assert.match(socialSource,/escrow_integrity_failed/);
});

test("seed metrics and emitters align for predictions and card collection",()=>{
  assert.match(webMigration,/'called-it'[\s\S]*'correct_prediction'/);
  assert.match(webMigration,/UPDATE passport_achievement_definitions SET metric='correct_prediction'/);
  assert.match(internalSource,/metric='cards_collected'/);
  assert.match(adminSource,/metric:"correct_prediction"/);
});

test("poll audience has a repaired named constraint and live eligibility enforcement",()=>{
  assert.match(webMigration,/passport_audience IN \('everyone','signed_in','live_attendees','members'\)/);
  assert.match(webMigration,/conname='polls_passport_audience_check'/);
  const pollSource=readFileSync(resolve(process.cwd(),"lib/passport/polls.ts"),"utf8");
  assert.match(pollSource,/passport_event_presence/);
  assert.match(pollSource,/IN\('eligible','verified'\)/);
});

test("common duplicate recipes enforce their advertised rarity",()=>{
  assert.match(webMigration,/three-common-to-sparks'[\s\S]*3, 'common', 'sparks'/);
  assert.match(webMigration,/five-common-core-red'[\s\S]*5, 'common', 'cosmetic'/);
  assert.match(webMigration,/input_rarity=EXCLUDED\.input_rarity/);
  assert.match(webMigration,/passport_crafting_recipes_output_check/);
  assert.match(webMigration,/output_type='cosmetic' AND output_code IS NOT NULL/);
});

test("signed-in event reads preserve post-event claim readiness",()=>{
  assert.match(readSource,/listActivePassportEvents\(userId: string \| null = null\)/);
  assert.match(readSource,/e\.state IN \('ended','certified'\)/);
  assert.match(readSource,/claimState:PassportActiveEvent\["claimState"\]/);
  assert.match(readSource,/eligible&&row\.state==="certified"/);
  assert.match(readSource,/listActivePassportEvents\(userId\)/);
});

test("event reward nominations enforce verified presence in the service layer",()=>{
  assert.match(adminSource,/passport_event_presence WHERE event_id=\$1 AND state IN \('eligible','verified'\)/);
  assert.match(adminSource,/user_id=ANY\(\$2::text\[\]\)/);
  assert.match(adminSource,/assertPassportEligibleRewardRecipients\(recipientUserIds,eligible\)/);
});

test("public achievements honor activity privacy and explicit showcase selection",()=>{
  assert.match(readSource,/publicSectionAllowed\(profile\.privacy\.activity, signedIn, isOwner\)/);
  assert.match(readSource,/achievement\.earned && showcasedAchievementCodes\.has\(achievement\.code\)/);
});

test("public identity exposes only equipped cosmetics and privacy-safe featured assets",()=>{
  assert.match(readSource,/cosmetic\.unlocked&&equippedCosmeticCodes\.has\(cosmetic\.code\)/);
  assert.match(readSource,/showcaseAllowed && activeLoadout\.featuredCardId && publicShowcaseIds\.has/);
  assert.match(readSource,/activeLoadout\.badgeCodes\.filter\(\(code\) => showcasedAchievementCodes\.has\(code\)\)/);
  assert.match(readSource,/channelsAllowed \? \(profile\.activeLoadoutScope \|\| "global"\) : "global"/);
  assert.match(readSource,/cosmetic\.unlocked&&equippedCosmeticCodes\.has/);
  assert.match(readSource,/eventExternalRef:null/);
  assert.doesNotMatch(readSource,/const dashboard = await getPassportDashboard\(userId\)/);
});

test("published moments cannot be republished or silently cancelled",()=>{
  assert.match(adminSource,/moment\.state!=="draft"[^\n]*only_draft_moments_can_be_published/);
  assert.match(adminSource,/previous\.state!=="draft"[^\n]*only_draft_moments_can_be_cancelled/);
  assert.match(adminSource,/WHERE id=\$1 AND state='draft' RETURNING/);
});

test("an explicit visit-channel activity is not applied to quests twice",()=>{
  assert.match(activitySource,/if\(input\.metric!=="visit_channel"\)await applyQuestMetric/);
});

test("fan exchange recipients require a public handle and explicit opt-in",()=>{
  assert.match(internalSource,/lower\(u\.public_slug\) = lower\(regexp_replace\(\$1/);
  assert.match(internalSource,/p\.exchange_enabled/);
  assert.doesNotMatch(internalSource,/lower\(email\) = lower\(\$1\)/);
  assert.match(internalSource,/recipient_unavailable/);
  assert.match(adminSource,/WHERE id::text=ANY\(\$1::text\[\]\)/);
});

test("a sold-out optional edition does not roll back attendance or other card claims",()=>{
  assert.match(presenceSource,/error instanceof PassportError && error\.code==="not_eligible" && error\.message==="edition_sold_out"/);
  assert.match(presenceSource,/unavailableEditions\.push\(\{editionId:edition\.id,reason:"sold_out"\}\)/);
  assert.match(presenceSource,/throw error;/);
});

test("asset revocation prunes public showcase and active identity references",()=>{
  assert.match(internalSource,/showcase_card_ids=ARRAY\(SELECT card_id[\s\S]*featured_card_id=NULL/);
  assert.match(internalSource,/showcase_achievement_codes=ARRAY\(SELECT code[\s\S]*badge_codes=ARRAY\(SELECT code/);
  assert.match(internalSource,/title_code=CASE WHEN title_code=ANY[\s\S]*reaction_codes=ARRAY\(SELECT code/);
  assert.match(internalSource,/SET display_title=\(SELECT c\.name[\s\S]*u\.state='active'/);
  assert.match(adminSource,/prunePassportAssetReferences\(client,input\.userId/);
});

test("watch progression is catalog-backed, server-timed, and provider-qualified",()=>{
  assert.match(webMigration,/CREATE TABLE IF NOT EXISTS passport_watch_credit_cursors/);
  assert.match(webMigration,/CREATE TABLE IF NOT EXISTS passport_watch_sessions/);
  assert.match(watchSource,/serverCreditedWatchSeconds/);
  assert.match(watchSource,/FROM content_items ci JOIN members m/);
  assert.match(watchSource,/firstChunk=Math\.floor\(snapshot\.row\.projected_seconds\/300\)\+1/);
  assert.match(watchSource,/10\*60\*1000/);
  assert.match(progressRouteSource,/recordPassportWatchProgress/);
  assert.doesNotMatch(progressRouteSource,/recordPassportActivity/);
  assert.match(watchHookSource,/platform,/);
  assert.match(webMigration,/CREATE TABLE IF NOT EXISTS passport_watch_assets/);
  assert.match(webMigration,/short_form boolean NOT NULL DEFAULT false/);
  assert.match(watchRegistrySource,/registerPassportWatchCatalog/);
  assert.match(watchRegistrySource,/shortForm:item\.format==="short"/);
  assert.match(watchSource,/FROM passport_watch_assets/);
  assert.match(watchSource,/asset\.shortForm\?10:300/);
});

test("legacy points and Passport projection are durably committed together",()=>{
  assert.match(pointsSource,/awardPointsInTransaction/);
  assert.match(pointsSource,/withTransaction\(\(client\)=>awardPointsInTransaction/);
  assert.match(pointsSource,/await enqueuePassportActivity\(client/);
  assert.match(pointsSource,/same transaction as fan_points/);
});

test("legacy poll administration cannot bypass Passport governance",()=>{
  assert.match(communitySource,/UPDATE polls SET status[\s\S]*passport_event_id IS NULL/);
  assert.match(communitySource,/winner_option_id[\s\S]*passport_event_id IS NULL/);
  assert.match(communitySource,/DELETE FROM polls WHERE id = \$1 AND passport_event_id IS NULL/);
  assert.match(communitySource,/passport_audience<>'members'[\s\S]*fan_users fu[\s\S]*fu\.email_verified/);
});

test("poll and clip engagement commits the ballot, points, and Passport outbox atomically",()=>{
  assert.match(communitySource,/withTransaction\(async\(client\)=>[\s\S]*awardPointsInTransaction\(client,userId,POINTS\.poll_vote/);
  assert.match(communitySource,/clip-vote:\$\{clipId\}:\$\{userId\}/);
  assert.match(communitySource,/awardPointsInTransaction\(client,userId,POINTS\.clip_upvote/);
});

test("photo approval, audit, points, and Passport projection share one transaction",()=>{
  assert.match(photoModerationSource,/withTransaction\(async\(client\)=>/);
  assert.match(photoModerationSource,/INSERT INTO fan_submission_audit/);
  assert.match(photoModerationSource,/awardPointsInTransaction\(client,row\.user_id/);
});

test("crafting serializes edition counts and refuses an already-owned output",()=>{
  assert.match(actionsSource,/cosmetic_already_owned/);
  assert.match(actionsSource,/pg_advisory_xact_lock\(hashtextextended/);
  assert.match(actionsSource,/craft_integrity_failed/);
});

test("community goals have a durable participant claim path",()=>{
  assert.match(webMigration,/CREATE TABLE IF NOT EXISTS passport_community_goal_claims/);
  assert.match(webMigration,/title-watch-together/);
  assert.match(actionsSource,/export async function claimPassportCommunityGoal/);
  assert.match(actionsSource,/community_goal_participation_required/);
  assert.match(readSource,/COALESCE\(p\.state,'active'\)='completed'[\s\S]*passport_community_goal_claims/);
});

test("first quest progress is serialized before an absent-row upsert",()=>{
  assert.match(activitySource,/passport-quest:\$\{input\.userId\}:\$\{quest\.code\}/);
  assert.match(activitySource,/pg_advisory_xact_lock\(hashtextextended/);
});

test("attendance correction is audited, compensating, and transfer-safe",()=>{
  assert.match(adminSource,/export async function correctPassportPresence/);
  assert.match(adminSource,/presence_correction_requires_admin/);
  assert.match(adminSource,/presence_assets_transferred_manual_review/);
  assert.match(adminSource,/action:"xp\.revoke"/);
  assert.match(adminSource,/action:"xp\.restore"/);
  assert.match(adminSource,/presence_quest_claim_requires_manual_review/);
  assert.match(adminSource,/presence_community_claim_requires_manual_review/);
  assert.match(adminSource,/reconcilePresenceQuestProgress/);
  assert.match(adminSource,/reconcilePresenceCommunityContributions/);
  assert.match(adminSource,/alreadyUnwound=destructive&&\['revoked','rejected'\]\.includes/);
});

test("channel-bound identity never escapes through a global or unrelated chat scope",()=>{
  assert.match(actionsSource,/row\.channel_slug!==null&&row\.channel_slug!==channelSlug/);
  assert.match(actionsSource,/card\.rows\[0\]\.channel_slug!==channelSlug/);
  assert.match(chatIdentitySource,/values\.find\(\(candidate\) => candidate\.scope === "global"\)/);
  assert.doesNotMatch(chatIdentitySource,/activeScope/);
  assert.match(chatIdentitySource,/value\.channel_slug === null \|\| value\.channel_slug === scopeChannel/);
});

test("live attendance binds only to a current server catalog asset",()=>{
  assert.match(webMigration,/kind IN \('live','youtube','vod','clip','tour'\)/);
  assert.match(watchRegistrySource,/item\.kind!=="post"/);
  assert.match(adminSource,/event_playback_ref_not_current/);
  assert.match(adminSource,/last_seen_at>=now\(\)-interval '15 minutes'/);
  assert.match(watchRegistrySource,/`twitch:stream:\$\{liveLogin\}`/);
  assert.match(presenceSource,/staff_accounts_cannot_claim_attendance/);
  assert.match(presenceSource,/event_requires_independent_certification/);
});

test("moment previews and emergency freezes remain server-authorized",()=>{
  assert.match(adminSource,/previewPassportMoment\(actor:PassportActor/);
  assert.match(adminSource,/requirePermission\(client,actor,"moment\.create"[\s\S]*shiftRequired:true/);
  assert.match(adminSource,/requirePermission\(client,actor,"chat\.freeze"/);
  assert.match(adminSource,/requirePermission\(client,actor,"channel\.freeze"/);
});

test("reward assets cannot cross a moderator's channel boundary",()=>{
  assert.match(adminSource,/assetChannelSlug/);
  assert.match(adminSource,/reward_channel_mismatch/);
  assert.match(adminSource,/assertCanonicalRewardChannel\(reward,input\.channelSlug\)/);
  assert.match(adminSource,/assertCanonicalRewardChannel\(reward,row\.channel_slug\)/);
});

test("card issuance and exchange retries serialize idempotency keys",()=>{
  assert.match(internalSource,/Recheck under the lock/);
  assert.match(socialSource,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/);
  assert.match(actionsSource,/const key=`craft:/);
  assert.match(actionsSource,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/);
});

test("timed escrow and Passport projections have an authenticated scheduled sweep",()=>{
  assert.match(socialSource,/export async function settleDuePassportWorkflows/);
  assert.match(socialSource,/FOR UPDATE SKIP LOCKED/);
  assert.match(maintenanceSource,/METRICS_CRON_SECRET/);
  assert.match(maintenanceSource,/drainPassportActivityOutbox/);
});

test("presence credit requires exact configured media and continuous position proof",()=>{
  assert.match(presenceSource,/event_playback_ref_required/);
  assert.match(presenceSource,/previousPlaying:previous\.rows\[0\]\?\.playing/);
  assert.match(presenceSource,/previousPositionSeconds:previous\.rows\[0\]\?\.playback_position_seconds/);
  assert.doesNotMatch(presenceSource,/if\(result\.newlyVerified\)\{/);
});

test("database mirror and reversible migration are registered",(t)=>{
  if (!existsSync(resolve(process.cwd(),"../coreboys-db/migrations/0013_core_passport.sql"))) {
    t.skip("coreboys-db is private and is not available in the web-only CI checkout");
    return;
  }
  const mirror=readFileSync(resolve(process.cwd(),"../coreboys-db/migrations/0013_core_passport.sql"),"utf8");
  const down=readFileSync(resolve(process.cwd(),"../coreboys-db/migrations/down/0013_core_passport.down.sql"),"utf8");
  const hardening=readFileSync(resolve(process.cwd(),"../coreboys-db/migrations/0014_core_passport_hardening.sql"),"utf8");
  const hardeningDown=readFileSync(resolve(process.cwd(),"../coreboys-db/migrations/down/0014_core_passport_hardening.down.sql"),"utf8");
  const journal=readFileSync(resolve(process.cwd(),"../coreboys-db/migrations/meta/_journal.json"),"utf8");
  assert.match(mirror,/CREATE TABLE IF NOT EXISTS passport_profiles/);
  assert.match(mirror,/CREATE TABLE IF NOT EXISTS passport_watch_assets/);
  assert.match(mirror,/statement-breakpoint/);
  assert.match(down,/DROP TABLE IF EXISTS passport_profiles/);
  assert.match(hardening,/Forward hardening/);
  assert.match(hardening,/passport_cards_owner_user_id_fkey[\s\S]*ON DELETE SET NULL/);
  assert.match(hardening,/CREATE TABLE IF NOT EXISTS passport_watch_assets/);
  assert.match(hardeningDown,/must therefore be non-destructive/);
  assert.match(journal,/0013_core_passport/);
  assert.match(journal,/0014_core_passport_hardening/);
});

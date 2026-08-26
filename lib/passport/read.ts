import "server-only";

import { query, withTransaction } from "@/lib/db";
import { ensurePassportProfile } from "@/lib/passport/internal";
import { drainPassportActivityOutbox } from "@/lib/passport/activity";
import {
  normalizePassportPrivacy,
  passportLevelPercent,
  passportNextLevelXp,
  publicSectionAllowed,
  sanitizePublicPassportProvenance,
  PassportError,
} from "@/lib/passport/policy";
import type {
  PassportAchievement,
  PassportActiveEvent,
  PassportAlbum,
  PassportCampaign,
  PassportCard,
  PassportChannelProgress,
  PassportCosmetic,
  PassportCommunityGoal,
  PassportDashboard,
  PassportGift,
  PassportLoadout,
  PassportProfile,
  PassportQuest,
  PassportTrade,
  PassportRecap,
  PublicPassportProfile,
} from "@/lib/passport/types";

type CardRow = {
  id: string;
  edition_id: string;
  edition_code: string;
  name: string;
  description: string;
  artwork_url: string | null;
  rarity: PassportCard["rarity"];
  variant: string;
  channel_slug: string;
  serial_number: number | null;
  edition_size: number | null;
  account_bound: boolean;
  giftable: boolean;
  tradeable: boolean;
  craft_value: number;
  state: PassportCard["state"];
  acquired_via: string;
  acquired_at: string;
  event_id: string | null;
  event_title: string | null;
  event_external_ref: string | null;
  moment_id: string | null;
  moment_offset_seconds: number | null;
  provenance: Record<string, unknown>;
};

const CARD_SELECT = `
  SELECT c.id::text, e.id::text AS edition_id, e.code AS edition_code,
         e.name, e.description, e.artwork_url, e.rarity, e.variant,
         e.channel_slug, c.serial_number, e.edition_size, e.account_bound,
         e.giftable, e.tradeable, e.craft_value, c.state, c.acquired_via,
         c.acquired_at::text, e.event_id::text, ev.title AS event_title,
         ev.external_ref AS event_external_ref,
         e.moment_id::text, m.offset_seconds AS moment_offset_seconds,
         c.provenance
    FROM passport_cards c
    JOIN passport_card_editions e ON e.id = c.edition_id
    LEFT JOIN passport_events ev ON ev.id = e.event_id
    LEFT JOIN passport_moments m ON m.id = e.moment_id`;

function mapCard(row: CardRow): PassportCard {
  return {
    id: row.id,
    editionId: row.edition_id,
    editionCode: row.edition_code,
    name: row.name,
    description: row.description,
    artworkUrl: row.artwork_url,
    rarity: row.rarity,
    variant: row.variant,
    channelSlug: row.channel_slug,
    serialNumber: row.serial_number,
    editionSize: row.edition_size,
    accountBound: row.account_bound,
    giftable: row.giftable,
    tradeable: row.tradeable,
    craftValue: row.craft_value,
    state: row.state,
    acquiredVia: row.acquired_via,
    acquiredAt: row.acquired_at,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventExternalRef: row.event_external_ref,
    momentId: row.moment_id,
    momentOffsetSeconds: row.moment_offset_seconds,
    provenance: row.provenance ?? {},
  };
}

export async function listPassportCards(input: {
  userId: string;
  cursor?: string;
  limit?: number;
  channel?: string;
  album?: string;
}): Promise<{ items: PassportCard[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 40));
  const result = await query<CardRow>(
    `${CARD_SELECT}
     WHERE c.owner_user_id = $1
       AND c.state IN ('active','locked','escrowed')
       AND ($2::text IS NULL OR e.channel_slug = $2)
       AND (
         $3::uuid IS NULL OR
         (c.acquired_at, c.id) < (
           SELECT acquired_at, id FROM passport_cards WHERE id = $3::uuid
         )
       )
       AND ($5::text IS NULL OR EXISTS (
         SELECT 1 FROM passport_album_slots als
          WHERE als.album_code = $5 AND als.edition_id = e.id
       ))
     ORDER BY c.acquired_at DESC, c.id DESC
     LIMIT $4`,
    [input.userId, input.channel ?? null, input.cursor ?? null, limit + 1, input.album ?? null],
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  return { items: rows.map(mapCard), nextCursor: hasMore ? rows.at(-1)?.id ?? null : null };
}

async function getPassportCardsByIds(userId: string, cardIds: string[]): Promise<PassportCard[]> {
  if (!cardIds.length) return [];
  const result = await query<CardRow>(
    `${CARD_SELECT}
      WHERE c.owner_user_id = $1
        AND c.id = ANY($2::uuid[])
        AND c.state IN ('active','locked','escrowed')`,
    [userId,cardIds],
  );
  const mapped = new Map(result.rows.map((row) => [row.id,mapCard(row)]));
  return cardIds.flatMap((id) => mapped.get(id) ? [mapped.get(id)!] : []);
}

export async function listActivePassportEvents(userId: string | null = null): Promise<PassportActiveEvent[]> {
  const result = await query<{
    id: string; code: string; network_slug: string; channel_slug: string; title: string;
    starts_at: string; ends_at: string | null; state: PassportActiveEvent["state"];
    external_ref: string | null; heartbeat_interval_seconds: number;
    minimum_watch_seconds: number; attendance_grace_seconds: number;
    score_state: Record<string, unknown> | null; score_status: string | null;
    score_revision: number | null; score_updated_at: string | null;
    presence_state: PassportActiveEvent["presenceState"];
    watch_seconds: number | null; heartbeat_count: number | null; claimed_at: string | null;
  }>(
    `SELECT e.id::text, e.code, e.network_slug, e.channel_slug, e.title,
            e.starts_at::text, e.ends_at::text, e.state, e.external_ref,
            e.heartbeat_interval_seconds, e.minimum_watch_seconds,
            e.attendance_grace_seconds, s.state AS score_state,
            s.status AS score_status, s.revision AS score_revision,
            s.updated_at::text AS score_updated_at,
            ep.state AS presence_state, ep.watch_seconds, ep.heartbeat_count,
            ep.claimed_at::text AS claimed_at
       FROM passport_events e
       LEFT JOIN passport_event_scores s ON s.event_id=e.id
       LEFT JOIN passport_event_presence ep ON ep.event_id=e.id AND ep.user_id=$1
      WHERE e.state = 'live'
         OR (e.state = 'scheduled' AND e.starts_at BETWEEN now() AND now() + interval '6 hours')
         OR ($1::text IS NOT NULL
             AND ep.event_id IS NOT NULL
             AND e.state IN ('ended','certified')
             AND COALESCE(e.ends_at,e.starts_at) >= now() - interval '30 days')
      ORDER BY CASE e.state WHEN 'live' THEN 0 WHEN 'certified' THEN 1 WHEN 'ended' THEN 2 ELSE 3 END,
               e.starts_at DESC`,
    [userId],
  );
  return result.rows.map((row) => {
    const presenceState=row.presence_state;
    const claimed=presenceState==="verified"||Boolean(row.claimed_at);
    const blocked=presenceState==="rejected"||presenceState==="revoked";
    const eligible=presenceState==="eligible";
    const claimState:PassportActiveEvent["claimState"]=!userId
      ? "signed_out"
      : blocked
        ? "blocked"
        : claimed
          ? "claimed"
          : eligible&&row.state==="certified"
            ? "ready"
            : eligible
              ? "pending_certification"
              : "not_eligible";
    return {
      id: row.id,
      code: row.code,
      networkSlug: row.network_slug,
      channelSlug: row.channel_slug,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      state: row.state,
      externalRef: row.external_ref,
      heartbeatIntervalSeconds: row.heartbeat_interval_seconds,
      minimumWatchSeconds: row.minimum_watch_seconds,
      attendanceGraceSeconds: row.attendance_grace_seconds,
      presenceState,
      watchSeconds:row.watch_seconds ?? 0,
      heartbeatCount:row.heartbeat_count ?? 0,
      claimedAt:row.claimed_at,
      claimState,
      canClaim:claimState==="ready",
      scoreboard: row.score_state && row.score_status && row.score_revision !== null && row.score_updated_at
        ? { state: row.score_state, status: row.score_status, revision: row.score_revision, updatedAt: row.score_updated_at }
        : null,
    };
  });
}

async function listCommunityGoals(userId:string): Promise<PassportCommunityGoal[]> {
  const result=await query<{
    code:string;channel_slug:string|null;name:string;description:string;metric:string;
    target:string;total:string;state:PassportCommunityGoal["state"];reward:Record<string,unknown>;ends_at:string|null;
    contributed:boolean;claimed:boolean;
  }>(`SELECT g.code,g.channel_slug,g.name,g.description,g.metric,g.target::text,
    COALESCE(p.total,0)::text AS total,COALESCE(p.state,'active') AS state,g.reward,g.ends_at::text,
    EXISTS(SELECT 1 FROM passport_community_goal_contributions c WHERE c.goal_code=g.code AND c.user_id=$1 AND c.revoked_at IS NULL) AS contributed,
    EXISTS(SELECT 1 FROM passport_community_goal_claims c WHERE c.goal_code=g.code AND c.user_id=$1) AS claimed
    FROM passport_community_goals g LEFT JOIN passport_community_goal_progress p ON p.goal_code=g.code
    WHERE g.active AND (g.starts_at IS NULL OR g.starts_at<=now()) AND (
      g.ends_at IS NULL OR g.ends_at>=now() OR (
        COALESCE(p.state,'active')='completed'
        AND EXISTS(SELECT 1 FROM passport_community_goal_contributions c WHERE c.goal_code=g.code AND c.user_id=$1 AND c.revoked_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM passport_community_goal_claims c WHERE c.goal_code=g.code AND c.user_id=$1)
      )
    )
    ORDER BY g.ends_at NULLS LAST,g.name`,[userId]);
  return result.rows.map(row=>{const target=Number(row.target);const total=Number(row.total);return{code:row.code,channelSlug:row.channel_slug,name:row.name,description:row.description,metric:row.metric,target,total,percent:Math.min(100,Math.round(total/target*100)),state:row.state,reward:row.reward??{},endsAt:row.ends_at,eligible:row.state==="completed"&&row.contributed&&!row.claimed,claimed:row.claimed};});
}

async function getPassportRecap(userId:string):Promise<PassportRecap>{
  const result=await query<{cards:string;events:string;achievements:string;channels:string;watch_seconds:string}>(`SELECT
    (SELECT COUNT(*) FROM passport_cards WHERE owner_user_id=$1 AND state IN('active','locked','escrowed'))::text AS cards,
    (SELECT COALESCE(SUM(events_attended),0) FROM passport_channel_progress WHERE user_id=$1)::text AS events,
    (SELECT COUNT(*) FROM passport_achievement_grants WHERE user_id=$1 AND state='active')::text AS achievements,
    (SELECT COUNT(*) FROM passport_channel_progress WHERE user_id=$1 AND xp>0)::text AS channels,
    (SELECT COALESCE(SUM(watch_seconds),0) FROM passport_channel_progress WHERE user_id=$1)::text AS watch_seconds`,[userId]);const row=result.rows[0]!;return{cardsCollected:Number(row.cards),eventsAttended:Number(row.events),achievementsEarned:Number(row.achievements),channelsExplored:Number(row.channels),watchSeconds:Number(row.watch_seconds)};
}

async function getProfile(userId: string): Promise<PassportProfile> {
  const result = await query<{
    user_id: string; display_name: string; public_slug: string | null;
    display_title: string | null; active_loadout_scope:string;exchange_enabled:boolean; global_xp: number; level: number; sparks: number;
    showcase_card_ids: string[]; showcase_achievement_codes: string[]; privacy: unknown;
  }>(
    `SELECT p.user_id, u.display_name, u.public_slug, p.display_title,p.active_loadout_scope,p.exchange_enabled,
            p.global_xp, p.level, p.sparks, p.showcase_card_ids::text[],
            p.showcase_achievement_codes, p.privacy
       FROM passport_profiles p
       JOIN fan_users u ON u.id = p.user_id
      WHERE p.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new PassportError("not_found", 404, "profile_not_found");
  return {
    userId: row.user_id,
    displayName: row.display_name,
    publicSlug: row.public_slug,
    displayTitle: row.display_title,
    activeLoadoutScope: row.active_loadout_scope,
    exchangeEnabled:row.exchange_enabled,
    globalXp: row.global_xp,
    level: row.level,
    nextLevelXp: passportNextLevelXp(row.global_xp),
    sparks: row.sparks,
    showcaseCardIds: row.showcase_card_ids ?? [],
    showcaseAchievementCodes: row.showcase_achievement_codes ?? [],
    privacy: normalizePassportPrivacy(row.privacy),
  };
}

async function listChannels(userId: string): Promise<PassportChannelProgress[]> {
  const result = await query<{
    channel_slug: string; xp: number; level: number; watch_seconds: string;
    events_attended: number; last_active_at: string | null;
  }>(
    `SELECT channel_slug, xp, level, watch_seconds::text, events_attended,
            last_active_at::text
       FROM passport_channel_progress
      WHERE user_id = $1
      ORDER BY xp DESC, channel_slug`,
    [userId],
  );
  return result.rows.map((row) => ({
    channelSlug: row.channel_slug,
    xp: row.xp,
    level: row.level,
    nextLevelXp: passportNextLevelXp(row.xp),
    watchSeconds: Number(row.watch_seconds),
    eventsAttended: row.events_attended,
    lastActiveAt: row.last_active_at,
  }));
}

async function listAchievements(userId: string): Promise<PassportAchievement[]> {
  const result = await query<{
    code: string; channel_slug: string | null; family: string; name: string;
    description: string; tier: PassportAchievement["tier"]; icon: string | null;
    threshold: number; progress: number | null; state: string | null;
    earned_at: string | null; secret: boolean; reward: Record<string, unknown>;
  }>(
    `SELECT d.code, d.channel_slug, d.family, d.name, d.description, d.tier,
            d.icon, d.threshold, g.progress, g.state, g.earned_at::text,
            d.secret, d.reward
       FROM passport_achievement_definitions d
       LEFT JOIN passport_achievement_grants g
         ON g.achievement_code = d.code AND g.user_id = $1
      WHERE d.active
      ORDER BY d.sort_order, d.code`,
    [userId],
  );
  return result.rows.map((row) => {
    const earned = row.state === "active";
    return {
      code: row.code,
      channelSlug: row.channel_slug,
      family: row.family,
      name: row.secret && !earned ? "Secret achievement" : row.name,
      description: row.secret && !earned ? "Keep exploring to reveal this achievement." : row.description,
      tier: row.tier,
      icon: row.secret && !earned ? "lock" : row.icon,
      threshold: row.threshold,
      progress: row.progress ?? 0,
      earned,
      earnedAt: row.earned_at,
      secret: row.secret,
      reward: row.secret && !earned ? {} : row.reward ?? {},
    };
  });
}

async function listQuests(userId: string): Promise<PassportQuest[]> {
  const result = await query<{
    code: string; campaign_code: string | null; channel_slug: string | null;
    name: string; description: string; objective: Record<string, unknown>;
    reward: Record<string, unknown>; progress: Record<string, unknown> | null;
    state: PassportQuest["state"] | null; starts_at: string | null; ends_at: string | null;
  }>(
    `SELECT q.code, q.campaign_code, q.channel_slug, q.name, q.description,
            q.objective, q.reward, p.progress, p.state,
            q.starts_at::text, q.ends_at::text
       FROM passport_quest_definitions q
       LEFT JOIN passport_quest_progress p
         ON p.quest_code = q.code AND p.user_id = $1
      WHERE q.active
      ORDER BY q.ends_at NULLS LAST, q.code`,
    [userId],
  );
  return result.rows.map((row) => ({
    code: row.code,
    campaignCode: row.campaign_code,
    channelSlug: row.channel_slug,
    name: row.name,
    description: row.description,
    objective: row.objective ?? {},
    reward: row.reward ?? {},
    progress: row.progress ?? {},
    state: row.state ?? "active",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

function campaignsFor(quests: PassportQuest[]): PassportCampaign[] {
  const groups = new Map<string, PassportQuest[]>();
  for (const quest of quests) {
    if (!quest.campaignCode) continue;
    groups.set(quest.campaignCode, [...(groups.get(quest.campaignCode) ?? []), quest]);
  }
  return [...groups].map(([code, items]) => ({
    code,
    name: code.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
    quests: items.map((item) => item.code),
    completed: items.filter((item) => item.state === "completed" || item.state === "claimed").length,
    total: items.length,
  }));
}

async function listAlbums(userId: string): Promise<PassportAlbum[]> {
  const result = await query<{
    code: string; channel_slug: string | null; name: string; description: string;
    artwork_url: string | null; reward: Record<string, unknown>; required: string;
    collected: string; claimed: boolean;
  }>(
    `SELECT a.code, a.channel_slug, a.name, a.description, a.artwork_url, a.reward,
            COUNT(DISTINCT s.edition_id) FILTER (WHERE s.required)::text AS required,
            COUNT(DISTINCT c.edition_id) FILTER (WHERE s.required)::text AS collected,
            bool_or(ac.state = 'claimed') AS claimed
       FROM passport_albums a
       LEFT JOIN passport_album_slots s ON s.album_code = a.code
       LEFT JOIN passport_cards c
         ON c.edition_id = s.edition_id AND c.owner_user_id = $1
        AND c.state IN ('active','locked','escrowed')
       LEFT JOIN passport_album_completions ac
         ON ac.album_code = a.code AND ac.user_id = $1
      WHERE a.active AND (a.starts_at IS NULL OR a.starts_at<=now()) AND (a.ends_at IS NULL OR a.ends_at>now())
      GROUP BY a.code
      ORDER BY a.ends_at NULLS LAST, a.name`,
    [userId],
  );
  return result.rows.map((row) => {
    const required = Number(row.required);
    const collected = Number(row.collected);
    return {
      code: row.code,
      channelSlug: row.channel_slug,
      name: row.name,
      description: row.description,
      artworkUrl: row.artwork_url,
      collected,
      required,
      complete: required > 0 && collected >= required,
      claimed: Boolean(row.claimed),
      reward: row.reward ?? {},
    };
  });
}

async function listCosmetics(userId: string): Promise<PassportCosmetic[]> {
  const result = await query<{
    code: string; kind: PassportCosmetic["kind"]; channel_slug: string | null;
    name: string; description: string; rarity: PassportCosmetic["rarity"];
    asset: Record<string, unknown>; unlocked: boolean;
  }>(
    `SELECT c.code, c.kind, c.channel_slug, c.name, c.description, c.rarity,
            c.asset, (u.state = 'active') AS unlocked
       FROM passport_cosmetics c
       LEFT JOIN passport_cosmetic_unlocks u
         ON u.cosmetic_code = c.code AND u.user_id = $1
      WHERE c.active
      ORDER BY unlocked DESC, c.kind, c.name`,
    [userId],
  );
  return result.rows.map((row) => ({
    code: row.code, kind: row.kind, channelSlug: row.channel_slug,
    name: row.name, description: row.description, rarity: row.rarity,
    asset: row.asset ?? {}, unlocked: row.unlocked,
  }));
}

async function listLoadouts(userId: string): Promise<PassportLoadout[]> {
  const result = await query<{
    scope: string; title_code: string | null; nameplate_code: string | null;
    frame_code: string | null; theme_code: string | null; reaction_codes: string[];
    featured_card_id: string | null; badge_codes: string[]; updated_at: string;
  }>(
    `SELECT scope, title_code, nameplate_code, frame_code, theme_code,
            reaction_codes, featured_card_id::text, badge_codes, updated_at::text
       FROM passport_loadouts WHERE user_id = $1 ORDER BY scope`,
    [userId],
  );
  return result.rows.map((row) => ({
    scope: row.scope, titleCode: row.title_code, nameplateCode: row.nameplate_code,
    frameCode: row.frame_code, themeCode: row.theme_code,
    reactionCodes: row.reaction_codes ?? [], featuredCardId: row.featured_card_id,
    badgeCodes: row.badge_codes ?? [], updatedAt: row.updated_at,
  }));
}

async function listGifts(userId: string): Promise<PassportGift[]> {
  const result = await query<{
    id: string; card_id: string; card_name: string; sender_user_id: string;
    sender_name: string; recipient_user_id: string; recipient_name: string;
    message: string | null; state: string; expires_at: string; created_at: string;
  }>(
    `SELECT g.id::text, g.card_id::text, e.name AS card_name,
            g.sender_user_id, sender.display_name AS sender_name,
            g.recipient_user_id, recipient.display_name AS recipient_name,
            g.message, g.state, g.expires_at::text, g.created_at::text
       FROM passport_gifts g
       JOIN passport_cards c ON c.id = g.card_id
       JOIN passport_card_editions e ON e.id = c.edition_id
       JOIN fan_users sender ON sender.id = g.sender_user_id
       JOIN fan_users recipient ON recipient.id = g.recipient_user_id
      WHERE g.sender_user_id = $1 OR g.recipient_user_id = $1
      ORDER BY g.created_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id, cardId: row.card_id, cardName: row.card_name,
    senderUserId: row.sender_user_id, senderName: row.sender_name,
    recipientUserId: row.recipient_user_id, recipientName: row.recipient_name,
    message: row.message, state: row.state, expiresAt: row.expires_at, createdAt: row.created_at,
  }));
}

async function listTrades(userId: string): Promise<PassportTrade[]> {
  const result = await query<{
    id: string; proposer_user_id: string; proposer_name: string;
    recipient_user_id: string; recipient_name: string; message: string | null;
    state: string; proposer_confirmed: boolean; recipient_confirmed: boolean;
    executes_at: string | null; expires_at: string; created_at: string;
    offered_card_ids: string[]; requested_card_ids: string[];
    offered_cards: PassportTrade["offeredCards"];
    requested_cards: PassportTrade["requestedCards"];
  }>(
    `SELECT t.id::text, t.proposer_user_id, proposer.display_name AS proposer_name,
            t.recipient_user_id, recipient.display_name AS recipient_name,
            t.message, t.state, t.proposer_confirmed, t.recipient_confirmed,
            t.executes_at::text, t.expires_at::text, t.created_at::text,
            COALESCE((SELECT array_agg(i.card_id::text ORDER BY i.card_id)
                        FROM passport_trade_items i
                       WHERE i.trade_id=t.id AND i.side='offered'),'{}') AS offered_card_ids,
            COALESCE((SELECT array_agg(i.card_id::text ORDER BY i.card_id)
                        FROM passport_trade_items i
                       WHERE i.trade_id=t.id AND i.side='requested'),'{}') AS requested_card_ids,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'id',c.id::text,'name',e.name,'variant',e.variant,'rarity',e.rarity,
                         'serialNumber',c.serial_number,'editionSize',e.edition_size,'artworkUrl',e.artwork_url
                       ) ORDER BY c.id)
                        FROM passport_trade_items i
                        JOIN passport_cards c ON c.id=i.card_id
                        JOIN passport_card_editions e ON e.id=c.edition_id
                       WHERE i.trade_id=t.id AND i.side='offered'),'[]'::jsonb) AS offered_cards,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'id',c.id::text,'name',e.name,'variant',e.variant,'rarity',e.rarity,
                         'serialNumber',c.serial_number,'editionSize',e.edition_size,'artworkUrl',e.artwork_url
                       ) ORDER BY c.id)
                        FROM passport_trade_items i
                        JOIN passport_cards c ON c.id=i.card_id
                        JOIN passport_card_editions e ON e.id=c.edition_id
                       WHERE i.trade_id=t.id AND i.side='requested'),'[]'::jsonb) AS requested_cards
       FROM passport_trades t
       JOIN fan_users proposer ON proposer.id = t.proposer_user_id
       JOIN fan_users recipient ON recipient.id = t.recipient_user_id
      WHERE t.proposer_user_id = $1 OR t.recipient_user_id = $1
      ORDER BY t.created_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id, proposerUserId: row.proposer_user_id, proposerName: row.proposer_name,
    recipientUserId: row.recipient_user_id, recipientName: row.recipient_name,
    message: row.message, state: row.state, offeredCardIds: row.offered_card_ids ?? [],
    requestedCardIds: row.requested_card_ids ?? [], offeredCards: row.offered_cards ?? [],
    requestedCards: row.requested_cards ?? [], proposerConfirmed: row.proposer_confirmed,
    recipientConfirmed: row.recipient_confirmed, executesAt: row.executes_at,
    expiresAt: row.expires_at, createdAt: row.created_at,
  }));
}

export async function getPassportDashboard(userId: string): Promise<PassportDashboard> {
  await drainPassportActivityOutbox({userId,limit:25});
  await withTransaction(async (client) => ensurePassportProfile(client, userId));
  const [profile, channels, achievements, quests, cardsPage, albums, loadouts, cosmeticCatalog, gifts, trades, activeEvents,communityGoals,recap] = await Promise.all([
    getProfile(userId), listChannels(userId), listAchievements(userId), listQuests(userId),
    listPassportCards({ userId, limit: 60 }), listAlbums(userId), listLoadouts(userId),
    listCosmetics(userId), listGifts(userId), listTrades(userId), listActivePassportEvents(userId),listCommunityGoals(userId),getPassportRecap(userId),
  ]);
  return {
    profile,
    globalProgress: {
      xp: profile.globalXp,
      level: profile.level,
      nextLevelXp: profile.nextLevelXp,
      percent: passportLevelPercent(profile.globalXp),
    },
    channels,
    achievements,
    quests,
    campaigns: campaignsFor(quests),
    cards: cardsPage.items,
    albums,
    showcase: { cardIds: profile.showcaseCardIds, achievementCodes: profile.showcaseAchievementCodes },
    loadouts,
    privacy: profile.privacy,
    gifts,
    trades,
    cosmeticCatalog,
    activeEvents,
    communityGoals,
    recap,
  };
}

export async function getPublicPassportProfile(
  publicSlug: string,
  viewerUserId: string | null = null,
): Promise<PublicPassportProfile> {
  const userResult = await query<{ id: string }>(
    `SELECT u.id FROM fan_users u JOIN passport_profiles p ON p.user_id=u.id
      WHERE lower(u.public_slug)=lower($1) AND u.public_card=true`,
    [publicSlug.replace(/^@/, "")],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new PassportError("not_found", 404, "public_profile_not_found");
  // Public reads are intentionally minimal and read-only. They must not drain
  // another fan's outbox, settle escrow, or hydrate private dashboard shelves.
  const [profile,channels,achievements,loadouts,cosmeticCatalog]=await Promise.all([
    getProfile(userId),listChannels(userId),listAchievements(userId),listLoadouts(userId),listCosmetics(userId),
  ]);
  const isOwner = viewerUserId === userId;
  const signedIn = viewerUserId !== null;
  if (!publicSectionAllowed(profile.privacy.profile, signedIn, isOwner)) {
    throw new PassportError("not_found", 404, "public_profile_not_found");
  }
  const showcaseAllowed = publicSectionAllowed(profile.privacy.inventory, signedIn, isOwner);
  const achievementsAllowed = publicSectionAllowed(profile.privacy.activity, signedIn, isOwner);
  const channelsAllowed = publicSectionAllowed(profile.privacy.channelAffinity, signedIn, isOwner);
  const showcasedAchievementCodes = new Set(profile.showcaseAchievementCodes);
  const identityScope = channelsAllowed ? (profile.activeLoadoutScope || "global") : "global";
  const activeLoadout = loadouts.find((loadout) => loadout.scope === identityScope)
    ?? (channelsAllowed ? loadouts.find((loadout) => loadout.scope === "global") : undefined)
    ?? null;
  const equippedCosmeticCodes = new Set([
    activeLoadout?.titleCode,
    activeLoadout?.nameplateCode,
    activeLoadout?.frameCode,
    activeLoadout?.themeCode,
    ...(activeLoadout?.reactionCodes ?? []),
  ].filter((code): code is string => Boolean(code)));
  const publicCosmetics=cosmeticCatalog.filter((cosmetic) =>
    cosmetic.unlocked&&equippedCosmeticCodes.has(cosmetic.code)&&(channelsAllowed||cosmetic.channelSlug===null));
  const allowedCosmeticCodes=new Set(publicCosmetics.map((cosmetic)=>cosmetic.code));
  const publicShowcase=showcaseAllowed
    ? (await getPassportCardsByIds(userId,profile.showcaseCardIds)).map(card=>({
        ...card,eventId:null,momentId:null,eventExternalRef:null,momentOffsetSeconds:null,
        provenance:sanitizePublicPassportProvenance(card.provenance),
      }))
    : [];
  const publicShowcaseIds=new Set(publicShowcase.map((card)=>card.id));
  const publicLoadout = activeLoadout ? {
    ...activeLoadout,
    titleCode: activeLoadout.titleCode&&allowedCosmeticCodes.has(activeLoadout.titleCode)?activeLoadout.titleCode:null,
    nameplateCode: activeLoadout.nameplateCode&&allowedCosmeticCodes.has(activeLoadout.nameplateCode)?activeLoadout.nameplateCode:null,
    frameCode: activeLoadout.frameCode&&allowedCosmeticCodes.has(activeLoadout.frameCode)?activeLoadout.frameCode:null,
    themeCode: activeLoadout.themeCode&&allowedCosmeticCodes.has(activeLoadout.themeCode)?activeLoadout.themeCode:null,
    reactionCodes: activeLoadout.reactionCodes.filter((code)=>allowedCosmeticCodes.has(code)),
    featuredCardId: showcaseAllowed && activeLoadout.featuredCardId && publicShowcaseIds.has(activeLoadout.featuredCardId)
      ? activeLoadout.featuredCardId
      : null,
    badgeCodes: achievementsAllowed
      ? activeLoadout.badgeCodes.filter((code) => showcasedAchievementCodes.has(code))
      : [],
  } : null;
  return {
    profile: {
      displayName: profile.displayName,
      publicSlug: profile.publicSlug,
      displayTitle: channelsAllowed?profile.displayTitle:(publicCosmetics.find((cosmetic)=>cosmetic.code===publicLoadout?.titleCode)?.name ?? null),
      activeLoadoutScope: identityScope,
      level: profile.level,
    },
    identity: {
      scope: activeLoadout?.scope ?? "global",
      loadout: publicLoadout,
      cosmetics: publicCosmetics,
    },
    showcase: publicShowcase,
    achievements: achievementsAllowed
      ? achievements.filter((achievement) => achievement.earned && showcasedAchievementCodes.has(achievement.code))
      : [],
    channels: channelsAllowed ? channels : [],
  };
}

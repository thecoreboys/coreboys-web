import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getFanUserById } from "@/lib/fan-users";
import { listConnections } from "@/lib/oauth/connections";
import { listLoyalty, recentSiteEvents } from "@/lib/oauth/loyalty";
import { getPointsTotal, getRecentActivity } from "@/lib/points";
import { getNotificationPrefs } from "@/lib/community";
import { listProgress } from "@/lib/watch/progress";
import { listWatchFeedback } from "@/lib/watch/feedback";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { query } from "@/lib/db";
import { getNotificationChannelPreferences } from "@/lib/notification-preferences";
import { getPassportDashboard, listPassportCards } from "@/lib/passport/read";
import { exportCommunityAccountData } from "@/lib/fanzone-communities";
import { exportXNominationAccountData } from "@/lib/x/nominations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function exportPassport(userId: string) {
  try {
    const dashboard = await getPassportDashboard(userId);
    const cards = [...dashboard.cards];
    const seen = new Set(cards.map((card) => card.id));
    let cursor = cards.at(-1)?.id;
    for (let page = 0; cursor && page < 250; page += 1) {
      const next = await listPassportCards({ userId, cursor, limit: 100 });
      for (const card of next.items) {
        if (!seen.has(card.id)) {
          seen.add(card.id);
          cards.push(card);
        }
      }
      if (!next.nextCursor || next.nextCursor === cursor) break;
      cursor = next.nextCursor;
    }
    const [presence, heartbeats, cardHistory, ledger, appeals] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT event_id::text,state,first_seen_at,last_seen_at,watch_seconds,
                heartbeat_count,verified_at,claimed_at,updated_at
           FROM passport_event_presence WHERE user_id=$1 ORDER BY last_seen_at DESC`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `SELECT event_id::text,playback_ref,playback_position_seconds,playing,visible,
                credited_seconds,received_at
           FROM passport_presence_heartbeats WHERE user_id=$1 ORDER BY received_at DESC`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `SELECT c.id::text,c.edition_id::text,c.serial_number,c.acquired_via,c.state,
                c.acquired_at,c.updated_at,c.revoked_at,c.revoked_reason
           FROM passport_cards c
          WHERE c.owner_user_id=$1 OR c.original_user_id=$1
          ORDER BY c.acquired_at DESC`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `SELECT id,action,asset_type,asset_id,delta,channel_slug,source_type,source_id,
                reversal_of,created_at
           FROM passport_ledger WHERE user_id=$1 ORDER BY created_at DESC,id DESC`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `SELECT id::text,subject_type,subject_id,reason,state,response,reviewed_at,
                created_at,updated_at
           FROM passport_appeals WHERE user_id=$1 ORDER BY created_at DESC`,
        [userId],
      ),
    ]);
    return {
      ...dashboard,
      cards,
      presence: presence.rows,
      presenceHeartbeats: heartbeats.rows,
      cardHistory: cardHistory.rows,
      ledger: ledger.rows,
      appeals: appeals.rows,
    };
  } catch (error) {
    console.error("Passport account export unavailable", error);
    return null;
  }
}

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureFanOauthSchema();

  const [
    user,
    connections,
    loyalty,
    events,
    points,
    activity,
    prefs,
    channelPrefs,
    watchHistory,
    watchTimeEvidence,
    watchFeedback,
    watchList,
    socialActions,
    passport,
    fanzoneCommunities,
    xPostNominations,
  ] = await Promise.all([
    getFanUserById(uid),
    listConnections(uid),
    listLoyalty(uid),
    recentSiteEvents(uid, 200),
    getPointsTotal(uid),
    getRecentActivity(uid, 100),
    getNotificationPrefs(uid),
    getNotificationChannelPreferences(uid),
    listProgress(uid),
    query<Record<string, unknown>>(
      `SELECT item_ref,kind,source,provider,seconds,observed_at,created_at
         FROM fan_watch_time_events
        WHERE user_id=$1 ORDER BY observed_at DESC,id DESC`,
      [uid],
    ),
    listWatchFeedback(uid),
    query<{ item_ref: string; created_at: Date }>(
      `SELECT item_ref, created_at
         FROM fan_watch_list
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [uid],
    ),
    query<{ provider: string; action: string; target_ref: string; created_at: Date }>(
      `SELECT provider, action, target_ref, created_at
         FROM fan_social_actions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [uid],
    ),
    exportPassport(uid),
    exportCommunityAccountData(uid),
    exportXNominationAccountData(uid),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user,
    connections: connections.map((c) => ({
      provider: c.provider,
      username: c.username,
      connectedAt: c.connectedAt,
      lastSyncAt: c.lastSyncAt,
      status: c.status,
      scopes: c.scopes,
    })),
    loyalty,
    siteEvents: events,
    points,
    activity,
    notificationPrefs: prefs,
    notificationChannelPrefs: channelPrefs,
    watchHistory,
    watchTimeEvidence: watchTimeEvidence.rows,
    watchFeedback: watchFeedback.map((entry) => ({
      scope: entry.scope,
      value: entry.value,
      signal: entry.signal,
      updatedAt:
        entry.updated_at instanceof Date
          ? entry.updated_at.toISOString()
          : String(entry.updated_at),
    })),
    watchList: watchList.rows.map((entry) => ({
      ref: entry.item_ref,
      createdAt:
        entry.created_at instanceof Date
          ? entry.created_at.toISOString()
          : String(entry.created_at),
    })),
    socialActions: socialActions.rows.map((entry) => ({
      provider: entry.provider,
      action: entry.action,
      targetRef: entry.target_ref,
      createdAt:
        entry.created_at instanceof Date
          ? entry.created_at.toISOString()
          : String(entry.created_at),
    })),
    passport,
    fanzoneCommunities,
    xPostNominations,
    note: "OAuth access and refresh tokens are never exported.",
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="core-account-${uid.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import "server-only";

import {
  activatePassportLoadout,
  claimPassportAlbum,
  claimPassportCommunityGoal,
  claimPassportQuest,
  craftPassportCards,
  createPassportAppeal,
  savePassportLoadout,
  updatePassportProfile,
} from "@/lib/passport/actions";
import { claimPassportPresence, recordPassportHeartbeat } from "@/lib/passport/presence";
import { getPassportDashboard } from "@/lib/passport/read";
import {
  createPassportGift,
  createPassportTrade,
  resolvePassportGift,
  resolvePassportTrade,
  settlePassportWorkflows,
} from "@/lib/passport/social";
import type { ParsedPassportAction } from "@/lib/passport/schemas";

export async function getSettledPassportDashboard(userId: string) {
  await settlePassportWorkflows(userId);
  return getPassportDashboard(userId);
}

export async function performPassportAction(userId: string, request: ParsedPassportAction): Promise<unknown> {
  switch (request.action) {
    case "presence.heartbeat":
      return recordPassportHeartbeat(userId, request.payload);
    case "presence.claim":
      return claimPassportPresence(userId, request.payload);
    case "quest.claim":
      return claimPassportQuest(userId, request.payload.questCode, request.payload.idempotencyKey);
    case "showcase.save":
      return updatePassportProfile(userId, {
        cardIds: request.payload.cardIds,
        achievementCodes: request.payload.achievementCodes,
      });
    case "privacy.save":
      return updatePassportProfile(userId, { privacy: request.payload });
    case "profile.update":
      return updatePassportProfile(userId, request.payload);
    case "loadout.save":
      return savePassportLoadout(userId, request.payload);
    case "loadout.activate":
      return activatePassportLoadout(userId, request.payload.scope);
    case "album.claim":
      return claimPassportAlbum(userId, request.payload.albumCode, request.payload.idempotencyKey);
    case "community_goal.claim":
      return claimPassportCommunityGoal(userId, request.payload.goalCode, request.payload.idempotencyKey);
    case "card.craft":
      return craftPassportCards(userId, request.payload);
    case "gift.create":
      return createPassportGift(userId, request.payload);
    case "gift.accept":
      return resolvePassportGift(userId, { giftId: request.payload.giftId, decision: "accept", idempotencyKey: request.payload.idempotencyKey });
    case "gift.decline":
      return resolvePassportGift(userId, { giftId: request.payload.giftId, decision: "decline", idempotencyKey: request.payload.idempotencyKey });
    case "gift.cancel":
      return resolvePassportGift(userId, { giftId: request.payload.giftId, decision: "cancel", idempotencyKey: request.payload.idempotencyKey });
    case "trade.create":
      return createPassportTrade(userId, request.payload);
    case "trade.accept":
      return resolvePassportTrade(userId, { tradeId: request.payload.tradeId, decision: "accept", idempotencyKey: request.payload.idempotencyKey });
    case "trade.confirm":
      return resolvePassportTrade(userId, { tradeId: request.payload.tradeId, decision: "confirm", idempotencyKey: request.payload.idempotencyKey });
    case "trade.decline":
      return resolvePassportTrade(userId, { tradeId: request.payload.tradeId, decision: "decline", idempotencyKey: request.payload.idempotencyKey });
    case "trade.cancel":
      return resolvePassportTrade(userId, { tradeId: request.payload.tradeId, decision: "cancel", idempotencyKey: request.payload.idempotencyKey });
    case "appeal.create":
      return createPassportAppeal(userId, request.payload);
  }
}

export { getPassportDashboard, listPassportCards } from "@/lib/passport/read";
export { recordPassportActivity } from "@/lib/passport/activity";
export { recordPassportWatchProgress } from "@/lib/passport/watch";
export { getPublicPassportProfile, listActivePassportEvents } from "@/lib/passport/read";

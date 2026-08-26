export const PASSPORT_PRIVACY_LEVELS = ["public", "members", "private"] as const;
export type PassportPrivacyLevel = (typeof PASSPORT_PRIVACY_LEVELS)[number];

export type PassportPrivacy = {
  profile: PassportPrivacyLevel;
  inventory: PassportPrivacyLevel;
  activity: PassportPrivacyLevel;
  channelAffinity: PassportPrivacyLevel;
};

export type PassportRarity = "common" | "rare" | "historic" | "legendary";
export type PassportAssetState = "active" | "locked" | "escrowed" | "crafted" | "revoked";

export type PassportProfile = {
  userId: string;
  displayName: string;
  publicSlug: string | null;
  displayTitle: string | null;
  activeLoadoutScope: string;
  exchangeEnabled:boolean;
  globalXp: number;
  level: number;
  nextLevelXp: number;
  sparks: number;
  showcaseCardIds: string[];
  showcaseAchievementCodes: string[];
  privacy: PassportPrivacy;
};

export type PassportChannelProgress = {
  channelSlug: string;
  xp: number;
  level: number;
  nextLevelXp: number;
  watchSeconds: number;
  eventsAttended: number;
  lastActiveAt: string | null;
};

export type PassportAchievement = {
  code: string;
  channelSlug: string | null;
  family: string;
  name: string;
  description: string;
  tier: "bronze" | "silver" | "gold" | "icon";
  icon: string | null;
  threshold: number;
  progress: number;
  earned: boolean;
  earnedAt: string | null;
  secret: boolean;
  reward: Record<string, unknown>;
};

export type PassportQuest = {
  code: string;
  campaignCode: string | null;
  channelSlug: string | null;
  name: string;
  description: string;
  objective: Record<string, unknown>;
  reward: Record<string, unknown>;
  progress: Record<string, unknown>;
  state: "active" | "completed" | "claimed" | "expired" | "revoked";
  startsAt: string | null;
  endsAt: string | null;
};

export type PassportCampaign = {
  code: string;
  name: string;
  quests: string[];
  completed: number;
  total: number;
};

export type PassportCard = {
  id: string;
  editionId: string;
  editionCode: string;
  name: string;
  description: string;
  artworkUrl: string | null;
  rarity: PassportRarity;
  variant: string;
  channelSlug: string;
  serialNumber: number | null;
  editionSize: number | null;
  accountBound: boolean;
  giftable: boolean;
  tradeable: boolean;
  craftValue: number;
  state: PassportAssetState;
  acquiredVia: string;
  acquiredAt: string;
  eventId: string | null;
  eventTitle: string | null;
  eventExternalRef: string | null;
  momentId: string | null;
  momentOffsetSeconds: number | null;
  provenance: Record<string, unknown>;
};

export type PassportAlbum = {
  code: string;
  channelSlug: string | null;
  name: string;
  description: string;
  artworkUrl: string | null;
  collected: number;
  required: number;
  complete: boolean;
  claimed: boolean;
  reward: Record<string, unknown>;
};

export type PassportCosmetic = {
  code: string;
  kind: "title" | "nameplate" | "frame" | "theme" | "reaction" | "avatar_frame" | "card_back";
  channelSlug: string | null;
  name: string;
  description: string;
  rarity: PassportRarity;
  asset: Record<string, unknown>;
  unlocked: boolean;
};

export type PassportLoadout = {
  scope: string;
  titleCode: string | null;
  nameplateCode: string | null;
  frameCode: string | null;
  themeCode: string | null;
  reactionCodes: string[];
  featuredCardId: string | null;
  badgeCodes: string[];
  updatedAt: string;
};

export type PassportGift = {
  id: string;
  cardId: string;
  cardName: string;
  senderUserId: string;
  senderName: string;
  recipientUserId: string;
  recipientName: string;
  message: string | null;
  state: string;
  expiresAt: string;
  createdAt: string;
};

export type PassportTradeCardSummary = {
  id: string;
  name: string;
  variant: string;
  rarity: PassportRarity;
  serialNumber: number | null;
  editionSize: number | null;
  artworkUrl: string | null;
};

export type PassportTrade = {
  id: string;
  proposerUserId: string;
  proposerName: string;
  recipientUserId: string;
  recipientName: string;
  message: string | null;
  state: string;
  offeredCardIds: string[];
  requestedCardIds: string[];
  offeredCards: PassportTradeCardSummary[];
  requestedCards: PassportTradeCardSummary[];
  proposerConfirmed: boolean;
  recipientConfirmed: boolean;
  executesAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type PassportActiveEvent = {
  id: string;
  code: string;
  networkSlug: string;
  channelSlug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  state: "scheduled" | "live" | "ended" | "certified";
  externalRef: string | null;
  heartbeatIntervalSeconds: number;
  minimumWatchSeconds: number;
  attendanceGraceSeconds: number;
  presenceState: "observed" | "eligible" | "verified" | "rejected" | "revoked" | null;
  watchSeconds: number;
  heartbeatCount: number;
  claimedAt: string | null;
  claimState: "signed_out" | "not_eligible" | "pending_certification" | "ready" | "claimed" | "blocked";
  canClaim: boolean;
  scoreboard: { state: Record<string, unknown>; status: string; revision: number; updatedAt: string } | null;
};

export type PassportCommunityGoal = {
  code: string;
  channelSlug: string | null;
  name: string;
  description: string;
  metric: string;
  target: number;
  total: number;
  percent: number;
  state: "active" | "completed" | "retired";
  reward: Record<string, unknown>;
  endsAt: string | null;
  eligible:boolean;
  claimed:boolean;
};

export type PassportRecap = {
  cardsCollected: number;
  eventsAttended: number;
  achievementsEarned: number;
  channelsExplored: number;
  watchSeconds: number;
};

export type PassportDashboard = {
  profile: PassportProfile;
  globalProgress: { xp: number; level: number; nextLevelXp: number; percent: number };
  channels: PassportChannelProgress[];
  achievements: PassportAchievement[];
  quests: PassportQuest[];
  campaigns: PassportCampaign[];
  cards: PassportCard[];
  albums: PassportAlbum[];
  showcase: { cardIds: string[]; achievementCodes: string[] };
  loadouts: PassportLoadout[];
  privacy: PassportPrivacy;
  gifts: PassportGift[];
  trades: PassportTrade[];
  cosmeticCatalog: PassportCosmetic[];
  activeEvents: PassportActiveEvent[];
  communityGoals: PassportCommunityGoal[];
  recap: PassportRecap;
};

export type PassportHeartbeatPayload = {
  eventId: string;
  sessionId: string;
  playbackRef: string;
  positionSeconds: number;
  playing: boolean;
  visible: boolean;
};

export type PassportClaimPayload = {
  eventId: string;
  editionId?: string;
  idempotencyKey: string;
};

export type PassportActionRequest =
  | { action: "presence.heartbeat"; payload: PassportHeartbeatPayload }
  | { action: "presence.claim"; payload: PassportClaimPayload }
  | { action: "quest.claim"; payload: { questCode: string; idempotencyKey: string } }
  | { action: "showcase.save"; payload: { cardIds: string[]; achievementCodes: string[] } }
  | { action: "privacy.save"; payload: PassportPrivacy }
  | { action: "profile.update"; payload: { displayTitle?: string | null; exchangeEnabled?:boolean; privacy?: PassportPrivacy; cardIds?: string[]; achievementCodes?: string[] } }
  | { action: "loadout.save"; payload: Omit<PassportLoadout, "updatedAt"> }
  | { action: "loadout.activate"; payload: { scope: string } }
  | { action: "album.claim"; payload: { albumCode: string; idempotencyKey: string } }
  | { action: "community_goal.claim"; payload: { goalCode: string; idempotencyKey: string } }
  | { action: "card.craft"; payload: { recipeCode: string; cardIds: string[]; idempotencyKey: string } }
  | { action: "gift.create"; payload: { cardId: string; recipient: string; message?: string; idempotencyKey: string } }
  | { action: "gift.accept" | "gift.decline" | "gift.cancel"; payload: { giftId: string; idempotencyKey: string } }
  | { action: "trade.create"; payload: { recipient: string; offeredCardIds: string[]; requestedCardIds: string[]; message?: string; idempotencyKey: string } }
  | { action: "trade.accept" | "trade.confirm" | "trade.decline" | "trade.cancel"; payload: { tradeId: string; idempotencyKey: string } }
  | { action: "appeal.create"; payload: { subjectType: string; subjectId: string; reason: string; idempotencyKey: string } };

export type PassportActionResponse = {
  ok: true;
  result?: unknown;
  dashboard?: PassportDashboard;
};

export type PublicPassportIdentity = {
  scope: string;
  loadout: PassportLoadout | null;
  cosmetics: PassportCosmetic[];
};

export type PublicPassportProfile = {
  profile: Pick<PassportProfile, "displayName" | "publicSlug" | "displayTitle" | "activeLoadoutScope" | "level">;
  identity: PublicPassportIdentity;
  showcase: PassportCard[];
  achievements: PassportAchievement[];
  channels: PassportChannelProgress[];
};

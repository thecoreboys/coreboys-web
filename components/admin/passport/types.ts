export type PassportChannel = {
  slug: string;
  name: string;
  community: string;
  host: string;
  accent: string;
  artwork: string;
};

export type PassportStaffCandidate = {
  id: string;
  displayName: string;
  email: string;
  role?: "admin" | "member_manager";
};

export type PassportAssignment = {
  id: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string;
  scopeType: "network" | "channel" | "event";
  channelSlug: string | null;
  eventId: string | null;
  permissions: string[];
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type PassportShift = {
  id: string;
  assignmentId: string;
  staffId: string;
  staffName: string;
  role: string;
  channelSlug: string;
  eventId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type PassportEvent = {
  id: string;
  channelSlug: string;
  title: string;
  description: string | null;
  playbackRef: string | null;
  status: "draft" | "scheduled" | "live" | "ended" | "certified" | "cancelled" | "frozen";
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  freeze: PassportFreeze | null;
};

/** Public identity fields for an attendee who is eligible for event rewards. */
export type PassportEligibleRecipient = {
  id: string;
  displayName: string;
  publicSlug: string | null;
};

export type PassportPresenceRecord = {
  userId: string;
  displayName: string;
  publicSlug: string | null;
  state: "observed" | "eligible" | "verified" | "rejected" | "revoked";
  watchSeconds: number;
  heartbeatCount: number;
  claimedAt: string | null;
  updatedAt: string | null;
};

export type PassportPoll = {
  id: string;
  eventId: string | null;
  channelSlug: string;
  question: string;
  kind: "standard" | "prediction" | "trivia" | "mvp";
  options: Array<{ id: string; label: string; votes: number }>;
  status: "draft" | "preview" | "live" | "locked" | "certified";
  audience: "everyone" | "signed_in" | "live_attendees" | "members";
  createdByName: string;
  certifiedByName: string | null;
  winnerOptionId: string | null;
  createdAt: string;
};

export type PassportScoreboard = {
  id: string;
  eventId: string;
  title: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  status: "unofficial" | "verified" | "final";
  lastRevisionId: string | null;
  verifiedByName: string | null;
  revisions: PassportScoreRevision[];
};

export type PassportScoreRevision = {
  id: string;
  homeScore: number;
  awayScore: number;
  reason: string;
  actorName: string;
  verifiedByName: string | null;
  createdAt: string;
};

export type PassportMoment = {
  id: string;
  eventId: string;
  channelSlug: string;
  title: string;
  description: string | null;
  rarity: "common" | "rare" | "historic" | "legendary";
  timestampSeconds: number;
  windowBeforeSeconds: number;
  windowAfterSeconds: number;
  watchThresholdPercent: number;
  status: "draft" | "preview" | "published" | "sealed" | "cancelled";
  estimatedRecipients: number | null;
  createdByName: string;
  edition: PassportEdition | null;
  createdAt: string;
};

export type PassportEdition = {
  id: string;
  name: string;
  artworkUrl: string | null;
  rarity: "common" | "rare" | "historic" | "legendary";
  variant: string;
  signedBy: string | null;
  accountBound: boolean;
  giftable: boolean;
  tradeable: boolean;
  craftValue: number;
  status: "draft" | "open" | "sealed";
  maxSupply: number | null;
  editionSize: number | null;
  issuedCount: number;
  sealedAt: string | null;
};

export type PassportReward = {
  id: string;
  channelSlug: string;
  eventId: string | null;
  recipientUserId: string;
  recipientName: string;
  recipientPublicSlug: string | null;
  rewardType: "achievement" | "card" | "cosmetic" | "xp" | "sparks";
  rewardKey: string;
  rewardLabel: string;
  rarity: "common" | "rare" | "historic" | "legendary";
  quantity: number;
  reason: string;
  status: "nominated" | "previewed" | "pending_approval" | "approved" | "rejected" | "revoked";
  nominatedById: string;
  nominatedByName: string;
  approvedByName: string | null;
  createdAt: string;
};

export type PassportBudget = {
  channelSlug: string;
  commonLimit: number;
  commonUsed: number;
  rareLimit: number;
  rareUsed: number;
  historicLimit: number;
  historicUsed: number;
  legendaryLimit: number;
  legendaryUsed: number;
};

export type PassportFreeze = {
  id: string;
  channelSlug: string;
  eventId: string | null;
  capabilities: string[];
  reason: string;
  active: boolean;
  actorName: string;
  createdAt: string;
};

export type PassportAppeal = {
  id: string;
  channelSlug: string;
  userId: string;
  userName: string;
  subjectType: "reward" | "card" | "achievement" | "moderation";
  subjectId: string | null;
  message: string;
  status: "open" | "reviewing" | "approved" | "denied";
  reviewerName: string | null;
  resolution: string | null;
  createdAt: string;
};

export type PassportAuditEntry = {
  id: string;
  channelSlug: string | null;
  eventId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
};

export type PassportAdminOverview = {
  currentStaff: PassportStaffCandidate;
  effectivePermissions: string[];
  dutyPermissions: string[];
  onDuty: boolean;
  staff: PassportStaffCandidate[];
  eligibleRecipients: PassportEligibleRecipient[];
  presenceRecords: PassportPresenceRecord[];
  assignments: PassportAssignment[];
  activeShifts: PassportShift[];
  events: PassportEvent[];
  polls: PassportPoll[];
  scoreboards: PassportScoreboard[];
  moments: PassportMoment[];
  rewards: PassportReward[];
  budgets: PassportBudget[];
  freezes: PassportFreeze[];
  appeals: PassportAppeal[];
  audit: PassportAuditEntry[];
};

export type PassportAdminResponse = {
  overview: PassportAdminOverview;
};

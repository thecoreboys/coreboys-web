import type {
  FanzoneCommunityDirectoryEntry,
  FanzoneCommunityKey,
} from "@/lib/fanzone-community-config";

export type CommunityContentKind = "official_update" | "calendar" | "showcase";
export type CommunityIdeaStatus =
  | "under_review"
  | "planned"
  | "shipped"
  | "declined"
  | "removed";

export type CommunityQuestion = {
  id: string;
  communityKey: FanzoneCommunityKey;
  author: string;
  body: string;
  status: "approved" | "answered" | "pending" | "denied" | "removed";
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  mine: boolean;
};

export type CommunityIdea = {
  id: string;
  communityKey: FanzoneCommunityKey;
  author: string;
  category: "content" | "event" | "site" | "community" | "other";
  title: string;
  problem: string;
  proposal: string;
  status: CommunityIdeaStatus;
  moderationState: "pending" | "approved" | "denied" | "removed";
  votes: number;
  voted: boolean;
  mine: boolean;
  createdAt: string;
};

export type CommunityCalendarItem = {
  id: string;
  communityKey: FanzoneCommunityKey;
  title: string;
  body: string | null;
  href: string | null;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
};

export type CommunityStaffContent = {
  id: string;
  communityKey: FanzoneCommunityKey;
  kind: "official_update" | "showcase";
  title: string;
  body: string | null;
  href: string | null;
  imageUrl: string | null;
  publishedAt: string;
};

export type CommunityFeedItem = {
  id: string;
  communityKey: FanzoneCommunityKey;
  kind: "official" | "art" | "clip" | "poll" | "live" | "showcase";
  title: string;
  eyebrow: string;
  href: string;
  imageUrl: string | null;
  publishedAt: string;
  external: boolean;
};

export type CommunityViewerState = {
  signedIn: boolean;
  selectedKey: FanzoneCommunityKey;
  joinedKeys: FanzoneCommunityKey[];
  favoriteKeys: FanzoneCommunityKey[];
  recommendedKeys: FanzoneCommunityKey[];
  alerts: {
    live: boolean;
    updates: boolean;
    weeklyDigest: boolean;
  };
  x: {
    connected: boolean;
    username: string | null;
    connectionStatus: "active" | "expired" | "revoked" | "not_connected";
    lastSyncAt: string | null;
    officialFollow: "following" | "not_following" | "unknown";
    followCheckedAt: string | null;
    communityAttested: boolean;
    attestedAt: string | null;
    verified: false;
  };
};

export type CommunityPulse = {
  liveNow: number;
  newToday: number;
  openPolls: number;
  upcoming: number;
};

export type FanzoneCommunitiesResponse = {
  communities: Array<
    FanzoneCommunityDirectoryEntry & {
      memberCount: number;
      currentActivity: string | null;
      currentActivityAt: string | null;
    }
  >;
  selected: FanzoneCommunityKey;
  viewer: CommunityViewerState;
  pulse: CommunityPulse;
  feed: CommunityFeedItem[];
  questions: CommunityQuestion[];
  ideas: CommunityIdea[];
  calendar: CommunityCalendarItem[];
  staffContent: CommunityStaffContent[];
};

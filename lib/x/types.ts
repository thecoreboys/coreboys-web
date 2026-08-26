/** Client-safe public contracts for CORE's X surfaces. */

export const X_COMMUNITY_KEYS = [
  "core",
  "flock",
  "stable",
  "thugs",
  "m3",
  "nms",
  "slg",
] as const;

export type XCommunityKey = (typeof X_COMMUNITY_KEYS)[number];

export type XCommunityDirectoryEntry = {
  key: XCommunityKey;
  name: string;
  ownerSlug: string | null;
  ownerLabel: string;
  ownerHandle: string | null;
  ownerUrl: string | null;
  logo: string;
  /** Whether this owner has an official X profile mapped in the roster. */
  profileConnectionState: "connected" | "missing";
  /** Visitor pages consume the shared cron snapshot and never call X. */
  feedDelivery: "cached_roster" | "unavailable";
  configured: boolean;
  /** The exact numeric X Community id. Null means the operator has not configured one. */
  communityId: string | null;
  /** Canonical X Community URL. Never substituted with a profile URL. */
  communityUrl: string | null;
  description: string | null;
  memberCount: number | null;
  featuredPostIds: string[];
  metadataState: "configured" | "verified" | "unavailable" | "not_configured";
};

export type XPostReference = {
  postId: string;
  url: string;
  authorHandle?: string | null;
  creatorSlug?: string | null;
  featured?: boolean;
};

export type XSpaceReference = {
  spaceId: string;
  url: string;
  title: string;
  creatorSlug: string | null;
  creatorLabel: string;
  creatorHandle: string | null;
  state: "live" | "scheduled";
  startsAt: string | null;
};

export type XNominationStatus = "pending" | "approved" | "denied";

export type XNominationPublic = {
  id: string;
  postId: string;
  postUrl: string;
  communityKey: XCommunityKey;
  memberSlug: string | null;
  note: string | null;
  status: XNominationStatus;
  featured: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  denialReason?: string | null;
};

export const X_ACTION_KINDS = [
  "like",
  "unlike",
  "repost",
  "unrepost",
  "reply",
  "follow",
  "unfollow",
] as const;

export type XActionKind = (typeof X_ACTION_KINDS)[number];

export type XActionAvailability = {
  enabled: boolean;
  reason:
    | "available"
    | "disabled"
    | "credentials_missing"
    | "credit_gate_missing"
    | "monthly_ceiling_reached"
    | "sign_in"
    | "reconnect";
  connectHref: string;
  requiredScopes: string[];
};

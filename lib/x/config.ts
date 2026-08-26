import "server-only";

import { parseXCommunitiesJson, parseXFeaturedPostIds } from "./parsing";
import { X_ROSTER_OWNERS } from "./roster";
import type { XCommunityDirectoryEntry } from "./types";

export function getConfiguredXFeaturedPostIds(): string[] {
  const directory = parseXCommunitiesJson(process.env.X_COMMUNITIES_JSON);
  return [...new Set([
    ...parseXFeaturedPostIds(process.env.X_FEATURED_POST_IDS),
    ...Object.values(directory).flatMap((entry) => entry?.featuredPostIds ?? []),
  ])].slice(0, 1);
}

/**
 * Return every expected community, including honest not-configured rows.
 * A profile URL is never presented as an X Community URL.
 */
export function getXCommunityDirectory(): XCommunityDirectoryEntry[] {
  const configured = parseXCommunitiesJson(process.env.X_COMMUNITIES_JSON);
  return X_ROSTER_OWNERS.map((owner) => {
    const row = configured[owner.communityKey];
    return {
      key: owner.communityKey,
      name: owner.communityName,
      ownerSlug: owner.memberSlug,
      ownerLabel: owner.ownerLabel,
      ownerHandle: owner.handle,
      ownerUrl: owner.profileUrl,
      logo: owner.logo,
      profileConnectionState: owner.handle && owner.profileUrl ? "connected" : "missing",
      feedDelivery: owner.handle ? "cached_roster" : "unavailable",
      configured: Boolean(row),
      communityId: row?.communityId ?? null,
      communityUrl: row?.communityUrl ?? null,
      description: row?.description ?? null,
      memberCount: null,
      featuredPostIds: row?.featuredPostIds ?? [],
      metadataState: row ? "configured" : "not_configured",
    };
  });
}

/** Resolve the exact X profile/Community pair for a network channel owner. */
export function getXCommunityForMemberSlug(
  memberSlug: string | null,
): XCommunityDirectoryEntry | null {
  return getXCommunityDirectory().find((entry) => entry.ownerSlug === memberSlug) ?? null;
}

export function xNativeActionsEnvironment() {
  const ceiling = Number(process.env.X_API_MONTHLY_CEILING_USD);
  const creditBalance = Number(process.env.X_API_CREDIT_BALANCE_USD);
  const credentials = Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim());
  const explicitEnable = process.env.X_NATIVE_ACTIONS_ENABLED === "true";
  const validCeiling = Number.isFinite(ceiling) && ceiling > 0;
  // An explicit balance is a deliberate operator acknowledgement that paid
  // API credits are available. Missing/zero/invalid values keep writes off.
  const creditGate = Number.isFinite(creditBalance) && creditBalance > 0;
  return {
    enabled: explicitEnable && credentials && validCeiling && creditGate,
    explicitEnable,
    credentials,
    creditGate,
    monthlyCeilingUsd: validCeiling ? ceiling : 0,
    declaredCreditBalanceUsd: creditGate ? creditBalance : 0,
  };
}

import { GROUP } from "@/lib/group";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import type { XCommunityKey } from "./types";

export const X_ROSTER_MEMBER_SLUGS = [
  "adapt",
  "ron",
  "lacy",
  "marlon",
  "jason",
  "silky",
] as const;

export type XRosterMemberSlug = (typeof X_ROSTER_MEMBER_SLUGS)[number];
export type XRosterOwnerSlug = XRosterMemberSlug | null;

const COMMUNITY_BY_MEMBER_SLUG: Readonly<Record<XRosterMemberSlug, XCommunityKey>> = {
  adapt: "flock",
  ron: "stable",
  lacy: "thugs",
  marlon: "m3",
  jason: "nms",
  silky: "slg",
};

export type XRosterOwner = {
  communityKey: XCommunityKey;
  communityName: string;
  memberSlug: XRosterOwnerSlug;
  ownerLabel: string;
  handle: string | null;
  profileUrl: string | null;
  logo: string;
};

function memberOwner(memberSlug: XRosterMemberSlug): XRosterOwner {
  const member = MEMBERS_BY_SLUG[memberSlug];
  const social = member?.socials.find((candidate) => candidate.platform === "x");
  return {
    communityKey: COMMUNITY_BY_MEMBER_SLUG[memberSlug],
    communityName: member?.comm.name ?? memberSlug,
    memberSlug,
    ownerLabel: member?.stageName ?? memberSlug,
    handle: social?.handle?.trim() || null,
    profileUrl: social?.url?.trim() || null,
    logo: member?.comm.logo ?? "/brand/app-icon-1024.png",
  };
}

/**
 * The canonical one-to-one ownership map for CORE's organization X account
 * and all six creator accounts. Both the cached roster query and X Community
 * directory consume this map so a post can never drift into another person's
 * channel because two independent lists fell out of sync.
 */
export const X_ROSTER_OWNERS: readonly XRosterOwner[] = Object.freeze([
  {
    communityKey: "core",
    communityName: "CORE Community",
    memberSlug: null,
    ownerLabel: GROUP.name,
    handle: GROUP.socials.x.handle?.trim() || null,
    profileUrl: GROUP.socials.x.url?.trim() || null,
    logo: "/brand/app-icon-1024.png",
  },
  ...X_ROSTER_MEMBER_SLUGS.map(memberOwner),
]);

export function getXRosterOwner(memberSlug: string | null): XRosterOwner | null {
  return X_ROSTER_OWNERS.find((owner) => owner.memberSlug === memberSlug) ?? null;
}

export function configuredXRosterFeedAccounts(): Array<{
  handle: string;
  authorSlug: string | null;
  authorLabel: string;
}> {
  return X_ROSTER_OWNERS.flatMap((owner) => owner.handle
    ? [{
        handle: owner.handle,
        authorSlug: owner.memberSlug,
        authorLabel: `${owner.ownerLabel} · ${owner.handle}`,
      }]
    : []);
}

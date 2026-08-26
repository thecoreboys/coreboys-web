import { GROUP } from "@/lib/group";
import { MEMBERS_BY_SLUG } from "@/lib/members";

export const FANZONE_COMMUNITY_KEYS = [
  "core",
  "flock",
  "stable",
  "thugs",
  "m3",
  "nms",
  "slg",
] as const;

export type FanzoneCommunityKey = (typeof FANZONE_COMMUNITY_KEYS)[number];

export type FanzoneCommunityDirectoryEntry = {
  key: FanzoneCommunityKey;
  name: string;
  ownerLabel: string;
  memberSlug: string | null;
  logoUrl: string;
  accent: string;
  description: string;
  officialXUrl: string;
  officialXHandle: string;
};

type DirectorySeed = Omit<
  FanzoneCommunityDirectoryEntry,
  "ownerLabel" | "logoUrl" | "accent" | "officialXUrl" | "officialXHandle"
>;

const SEEDS: readonly DirectorySeed[] = [
  {
    key: "core",
    name: "CORE",
    memberSlug: null,
    description: "The shared house community: official updates, live moments, fan work, and what is next.",
  },
  {
    key: "flock",
    name: "Flock",
    memberSlug: "adapt",
    description: "Adapt's community space for the latest streams, clips, questions, and fan ideas.",
  },
  {
    key: "stable",
    name: "Stable",
    memberSlug: "ron",
    description: "StableRonaldo's community space for live moments, predictions, clips, and updates.",
  },
  {
    key: "thugs",
    name: "Thugs",
    memberSlug: "lacy",
    description: "Lacy's community space for streams, clips, questions, and fan-created highlights.",
  },
  {
    key: "m3",
    name: "M3",
    memberSlug: "marlon",
    description: "Marlon's community space for live moments, new posts, polls, and creative work.",
  },
  {
    key: "nms",
    name: "NMS",
    memberSlug: "jason",
    description: "JasonTheWeen's community space for streams, clips, updates, and community picks.",
  },
  {
    key: "slg",
    name: "SLG",
    memberSlug: "silky",
    description: "Silky's community space for live moments, clips, questions, and community ideas.",
  },
] as const;

function xSocial(memberSlug: string) {
  const member = MEMBERS_BY_SLUG[memberSlug];
  const social = member?.socials.find((item) => item.platform === "x");
  return {
    url: social?.url ?? "https://x.com",
    handle: social?.handle ?? "X",
  };
}

export const FANZONE_COMMUNITIES: readonly FanzoneCommunityDirectoryEntry[] = SEEDS.map((seed) => {
  if (!seed.memberSlug) {
    return {
      ...seed,
      ownerLabel: GROUP.name,
      logoUrl: "/brand/logo-core-white.png",
      accent: "#db0368",
      officialXUrl: GROUP.socials.x.url,
      officialXHandle: GROUP.socials.x.handle,
    };
  }
  const member = MEMBERS_BY_SLUG[seed.memberSlug];
  const x = xSocial(seed.memberSlug);
  return {
    ...seed,
    ownerLabel: member?.stageName ?? seed.name,
    logoUrl: member?.comm.logo ?? "/brand/logo-core-white.png",
    accent: member?.accent ?? "#db0368",
    officialXUrl: x.url,
    officialXHandle: x.handle,
  };
});

export const FANZONE_COMMUNITIES_BY_KEY: Readonly<
  Record<FanzoneCommunityKey, FanzoneCommunityDirectoryEntry>
> = Object.freeze(
  Object.fromEntries(FANZONE_COMMUNITIES.map((community) => [community.key, community])) as Record<
    FanzoneCommunityKey,
    FanzoneCommunityDirectoryEntry
  >,
);

export function isFanzoneCommunityKey(value: string): value is FanzoneCommunityKey {
  return (FANZONE_COMMUNITY_KEYS as readonly string[]).includes(value);
}

export function communityKeyForMember(memberSlug: string | null | undefined): FanzoneCommunityKey {
  if (!memberSlug) return "core";
  return FANZONE_COMMUNITIES.find((community) => community.memberSlug === memberSlug)?.key ?? "core";
}

export function loyaltySubjectForCommunity(key: FanzoneCommunityKey): string {
  return FANZONE_COMMUNITIES_BY_KEY[key].memberSlug ?? "house";
}

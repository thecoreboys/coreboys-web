import { MEMBERS as SHARED_MEMBERS, CREW as SHARED_CREW } from "@coreboys/shared";
import type { Member as SharedMember, CrewMember } from "@coreboys/shared";

/**
 * Web-side display order. The shared package keeps members in canonical order
 * (Marlon, Lacy, Silky, Adapt, Ron, Jason); the landing page rhythms differently.
 */
const DISPLAY_ORDER: readonly string[] = [
  "marlon",
  "ron",
  "adapt",
  "jason",
  "lacy",
  "silky",
];

/**
 * Web-only fields that don't belong in the shared package: bios, derived
 * twitchLogin, the public-portrait path under /public, and a stage-name override
 * (the shared `name` is short; the site sometimes wants the longer form).
 */
type WebExtras = {
  stageName: string;
  bio: string;
  portrait: string;
  twitchLogin: string;
};

const EXTRAS: Record<string, WebExtras> = {
  marlon: {
    stageName: "Marlon",
    portrait: "/members/marlon/portrait.jpg",
    twitchLogin: "marlon",
    bio: "One of the most-watched IRL streamers of his generation. Brings camera-on-shoulder energy and an unfiltered through-line: at CORE, he is the connective tissue between studio polish and street tempo.",
  },
  ron: {
    stageName: "Stable Ronaldo",
    portrait: "/members/ron/portrait.jpg",
    twitchLogin: "stableronaldo",
    bio: "Built a household name in competitive Fortnite before pivoting into a creator who streams the way other people host shows. The strategist of CORE — calls the play, then runs it.",
  },
  adapt: {
    stageName: "Adapt",
    portrait: "/members/adapt/portrait.jpg",
    twitchLogin: "adapt",
    bio: "Built one of the original FaZe channels and a generation's idea of what a creator could be. At CORE, he is the producer's instinct in front of the camera.",
  },
  jason: {
    stageName: "Jason TheWeen",
    portrait: "/members/jason/portrait.jpg",
    twitchLogin: "jasontheween",
    bio: "Came up streaming long-form gameplay and grew it into one of Twitch's most consistent draws. The signal at CORE — when he's live, the room shifts.",
  },
  lacy: {
    stageName: "Lacy",
    portrait: "/members/lacy/portrait.jpg",
    twitchLogin: "lacy",
    bio: "A multi-channel operator who turned IRL streaming into a format. The reporter's eye at CORE: nothing happens in the house that doesn't end up on camera.",
  },
  silky: {
    stageName: "Silky",
    portrait: "/members/silky/portrait.jpg",
    twitchLogin: "silky",
    bio: "Streamer's streamer with a decade in the trenches. The veteran voice in the room — the one who keeps the rest honest.",
  },
};

export type Member = SharedMember & WebExtras;

export const MEMBERS: readonly Member[] = DISPLAY_ORDER.map((slug) => {
  const base = SHARED_MEMBERS.find((m) => m.slug === slug);
  if (!base) throw new Error(`@coreboys/shared MEMBERS missing slug "${slug}"`);
  const extras = EXTRAS[slug];
  if (!extras) throw new Error(`No web extras configured for "${slug}"`);
  return { ...base, ...extras } satisfies Member;
});

export const MEMBERS_BY_SLUG: Readonly<Record<string, Member>> = Object.freeze(
  Object.fromEntries(MEMBERS.map((m) => [m.slug, m])),
);

export const CREW: readonly CrewMember[] = SHARED_CREW;

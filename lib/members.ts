import { MEMBERS as SHARED_MEMBERS, CREW as SHARED_CREW } from "@coreboys/shared";
import type { Member as SharedMember, CrewMember } from "@coreboys/shared";

/**
 * Web-side display order. The shared package keeps members in canonical order
 * (Marlon, Lacy, Silky, Adapt, Ron, Jason); the landing page rhythms differently.
 */
const DISPLAY_ORDER: readonly string[] = [
  "adapt",
  "ron",
  "lacy",
  "marlon",
  "jason",
  "silky",
];

/**
 * Each member also carries a "comm" — the streaming community/collective
 * they rep alongside CORE. The logo file lives in /public/comms/{slug}.png
 * (synced from /assets via scripts/sync-assets.mjs).
 */
type Comm = { name: string; logo: string };

/**
 * Web-only fields that don't belong in the shared package: bios, derived
 * twitchLogin, the public-portrait path under /public, and a stage-name override
 * (the shared `name` is short; the site sometimes wants the longer form).
 */
/** Public mailing address for fan mail. Optional per member. */
export type PoBox = {
  recipient: string;
  lines: string[];
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

type WebExtras = {
  stageName: string;
  bio: string;
  /** A real, sync'd photo path. The full gallery comes from getMemberPhotos(). */
  portrait: string;
  twitchLogin: string;
  comm: Comm;
  /** Two-digit roster index used in editorial chrome. */
  index: string;
  /** Primary YouTube channel ID (UCxxxx) — used by lib/social-feed for RSS. */
  youtubeChannelId?: string;
  /** Optional public PO box — drives the fan-mail postcard on /m/[slug]. */
  poBox?: PoBox;

  // Extended optional fields — surfaced on /m/[slug] when present and
  // editable from /admin/people. Phase 4: persisted in
  // editable_member_overrides.
  alias?: string;
  /** Free-form list — "Streamer", "Producer", "Founder". */
  roles?: string[];
  /** Marketing height — e.g. "6'1"". */
  height?: string;
  /** Marketing weight — e.g. "175 lb". */
  weight?: string;
  nickname?: string;
  favoriteGame?: string;
  /** Inline markdown links allowed: `[text](url)`. Renderer at
   *  components/typography is wired for this. */
  description?: string;
  /** Public business / management contact email. */
  managementEmail?: string;
};

const EXTRAS: Record<string, WebExtras> = {
  marlon: {
    stageName: "Marlon",
    portrait: "/members/marlon/501451406_17948777939981240_5261041131384952857_n.jpg",
    twitchLogin: "marlon",
    comm: { name: "M3", logo: "/comms/marlon.png" },
    index: "01",
    poBox: {
      recipient: "Marlon (Mar3lg)",
      lines: ["5609 Yolanda Ave #570730"],
      city: "Tarzana",
      region: "CA",
      postalCode: "91356",
      country: "USA",
    },
    bio: "One of the most-watched IRL streamers of his generation. Brings camera-on-shoulder energy and an unfiltered through-line — at CORE, he is the connective tissue between studio polish and street tempo.",
    managementEmail: "marlon@night.co",
  },
  ron: {
    stageName: "StableRonaldo",
    portrait: "/members/ron/473827093_18056047141976123_132385488460551222_n.jpg",
    twitchLogin: "stableronaldo",
    comm: { name: "Stable", logo: "/comms/ron.png" },
    index: "02",
    poBox: {
      recipient: "StableRonaldo",
      lines: ["PO Box 2459"],
      city: "Van Nuys",
      region: "CA",
      postalCode: "91404",
      country: "USA",
    },
    bio: "Built a household name in competitive Fortnite before pivoting into a creator who streams the way other people host shows. The strategist of CORE — calls the play, then runs it.",
    managementEmail: "stableronaldobusiness@gmail.com",
  },
  adapt: {
    stageName: "Adapt",
    portrait: "/members/adapt/499956978_18510367990012207_3921953249872508742_n.jpg",
    twitchLogin: "adapt",
    comm: { name: "Flock", logo: "/comms/adapt.png" },
    index: "03",
    poBox: {
      recipient: "Adapt",
      lines: ["PO Box 2820"],
      city: "Toluca Lake",
      region: "CA",
      postalCode: "91610",
      country: "USA",
    },
    bio: "Built one of the original FaZe channels and a generation's idea of what a creator could be. At CORE, he is the producer's instinct in front of the camera.",
    managementEmail: "ahdaptingbusiness@gmail.com",
  },
  jason: {
    stageName: "JasonTheWeen",
    portrait: "/members/jason/491447862_18270248428283012_4997814083388906750_n.jpg",
    twitchLogin: "jasontheween",
    comm: { name: "NMS", logo: "/comms/jason.png" },
    index: "04",
    poBox: {
      recipient: "JasonTheWeen",
      lines: ["15701 Sherman Way #7854"],
      city: "Van Nuys",
      region: "CA",
      postalCode: "91409",
      country: "USA",
    },
    bio: "Came up streaming long-form gameplay and grew it into one of Twitch's most consistent draws. The signal at CORE — when he's live, the room shifts.",
    managementEmail: "jasontheweenbusiness@gmail.com",
  },
  lacy: {
    stageName: "Lacy",
    portrait: "/members/lacy/480159516_17937399995981240_2154745760776665815_n.jpg",
    twitchLogin: "lacy",
    comm: { name: "Thugs", logo: "/comms/lacy.png" },
    index: "05",
    poBox: {
      recipient: "Lacy",
      lines: ["PO Box 55427"],
      city: "Sherman Oaks",
      region: "CA",
      postalCode: "91413",
      country: "USA",
    },
    bio: "A multi-channel operator who turned IRL streaming into a format. The reporter's eye at CORE — nothing happens in the house that doesn't end up on camera.",
    managementEmail: "lacybizinquiries@gmail.com",
  },
  silky: {
    stageName: "Silky",
    portrait: "/members/silky/652808737_18088306450960858_1463966219028193956_n.jpg",
    twitchLogin: "silky",
    comm: { name: "SLG", logo: "/comms/silky.png" },
    index: "06",
    bio: "Streamer's streamer with a decade in the trenches. The veteran voice in the room — the one who keeps the rest honest.",
    managementEmail: "yungsilkmgmt@gmail.com",
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

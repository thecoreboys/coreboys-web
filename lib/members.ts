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
  /** ISO date of the most recent owner/admin address confirmation. */
  verifiedAt?: string;
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
  /** Optional public PO box — drives the fan-mail postcard on /about/[slug]. */
  poBox?: PoBox;

  // Extended optional fields — surfaced on /about/[slug] when present and
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
  /** Manual follower / subscriber counts for platforms without a free
   *  public stats API. Rendered as the metric on /about/[slug] socials.
   *  YouTube subs come from the YouTube API and don't need this; Twitch
   *  comes from Helix. Use this for tiktok / instagram / x / snapchat. */
  manualCounts?: Partial<Record<"tiktok" | "instagram" | "x" | "snapchat", number>>;
};

// Placeholder follower counts for platforms without a free public API.
// Replace with real numbers; any value of 0 is treated as "no data" and
// the metric is hidden on the member page social link.
const TODO_COUNTS = { tiktok: 0, instagram: 0, x: 0, snapchat: 0 } as const;

const EXTRAS: Record<string, WebExtras> = {
  marlon: {
    stageName: "Marlon",
    portrait: "/members/marlon/625895312_18099497024503355_9103766418092766992_n.jpg",
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
    bio: "One of the most-watched IRL streamers of his generation—blending studio polish with street tempo. Future Time Magazine’s Sexiest Man of the Year. His comm may be M3, but we’re all D1s for real. Great at sports, and an entertainer at heart.",
    managementEmail: "marlon@night.co",
    manualCounts: { ...TODO_COUNTS },
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
    bio: "FNCS champion with his hit single covering Payphone. He’s a creator, a household name, and an icon for generations. Some might say he’s a TikTok car guy—but he’s got the sickest GT3 RS on the internet. He is the clip.",
    managementEmail: "stableronaldobusiness@gmail.com",
    manualCounts: { ...TODO_COUNTS },
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
    bio: "The ultimate OG — the Unc. Some might say he’s old, some might say he’s chopped, but one thing’s undeniable: he knows how to entertain the flock. A leading voice at CORE who keeps the whole house moving.",
    managementEmail: "ahdaptingbusiness@gmail.com",
    manualCounts: { ...TODO_COUNTS },
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
    bio: "Collab after collab, clip after clip—from Valorant to breakout streamer of the year. It all comes full circle as he entertains his audience with thrill-seeking challenges. When he’s live, the room shifts.",
    managementEmail: "jasontheweenbusiness@gmail.com",
    manualCounts: { ...TODO_COUNTS },
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
    bio: "IRL streaming pioneer—loves McDonald’s (but who doesn’t?). Hired one of the most annoying cameramen in existence. Some might say he’s chopped or the Ozempic final boss, but his transformation, success, and clips speak for themselves.",
    managementEmail: "lacybizinquiries@gmail.com",
    manualCounts: { ...TODO_COUNTS },
  },
  silky: {
    stageName: "Silky",
    portrait: "/members/silky/652808737_18088306450960858_1463966219028193956_n.jpg",
    twitchLogin: "silky",
    comm: { name: "SLG", logo: "/comms/silky.png" },
    index: "06",
    bio: "Streamer who came up streaming from the trenches. A veteran voice and true Unc. Raising the average age of the group by over a decade, an OG and pioneer of Twitch streaming. If he says he’s live, give him an extra 2 hours. #wootiming",
    managementEmail: "yungsilkmgmt@gmail.com",
    manualCounts: { ...TODO_COUNTS },
  },
};

export type Member = SharedMember & WebExtras;

function activeSocials(member: SharedMember): SharedMember["socials"] {
  // @LacyIRLs is a retired/dead channel URL. Keep it out of every web
  // surface (catalog ingestion, member pages, link menus, and search) rather
  // than leaving a broken source that can be mistaken for an active account.
  return member.socials.filter((social) => !(
    social.platform === "youtube" &&
    /(?:^@?lacyirls$|youtube\.com\/@lacyirls)/i.test(`${social.handle ?? ""} ${social.url ?? ""}`)
  ));
}

export const MEMBERS: readonly Member[] = DISPLAY_ORDER.map((slug) => {
  const base = SHARED_MEMBERS.find((m) => m.slug === slug);
  if (!base) throw new Error(`@coreboys/shared MEMBERS missing slug "${slug}"`);
  const extras = EXTRAS[slug];
  if (!extras) throw new Error(`No web extras configured for "${slug}"`);
  return { ...base, socials: activeSocials(base), ...extras } satisfies Member;
});

export const MEMBERS_BY_SLUG: Readonly<Record<string, Member>> = Object.freeze(
  Object.fromEntries(MEMBERS.map((m) => [m.slug, m])),
);

export const CREW: readonly CrewMember[] = SHARED_CREW;

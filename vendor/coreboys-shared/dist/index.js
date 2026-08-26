import { z } from 'zod';

// src/schemas/member.ts
var PlatformSchema = z.enum([
  "youtube",
  "tiktok",
  "instagram",
  "twitch",
  "x",
  "snapchat",
  "wikipedia"
]);
var PLATFORM_HOSTS = {
  youtube: [/(^|\.)youtube\.com$/i, /^youtu\.be$/i],
  tiktok: [/(^|\.)tiktok\.com$/i],
  instagram: [/(^|\.)instagram\.com$/i],
  twitch: [/(^|\.)twitch\.tv$/i],
  // x.com is canonical; twitter.com is the legacy alias we still tolerate.
  x: [/(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i],
  snapchat: [/(^|\.)snapchat\.com$/i],
  wikipedia: [
    /(^|\.)wikipedia\.org$/i,
    /(^|\.)fandom\.com$/i,
    /(^|\.)twitch-streamers\.fandom\.com$/i
  ]
};
function isUrlForPlatform(url, platform) {
  let host;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  return PLATFORM_HOSTS[platform].some((re) => re.test(host));
}
function assertNeverPlatform(p) {
  throw new Error(`Unhandled platform: ${String(p)}`);
}

// src/schemas/member.ts
var AccentSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "accent must be a hex color");
var SlugSchema = z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case");
var IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO 8601 (YYYY-MM-DD)");
var SocialSchema = z.object({
  platform: PlatformSchema,
  url: z.string().url(),
  handle: z.string().min(1).optional(),
  label: z.string().min(1).optional()
}).refine((s) => isUrlForPlatform(s.url, s.platform), {
  message: "url host doesn't match platform",
  path: ["url"]
});
var MemberSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  realName: z.string().min(1),
  birthDate: IsoDateSchema.optional(),
  wikipedia: z.array(z.string().url()).default([]),
  socials: z.array(SocialSchema).min(1),
  accent: AccentSchema
});
var CrewRoleSchema = z.enum([
  "cameraman",
  "management",
  "editor",
  "producer"
]);
function assertNeverCrewRole(r) {
  throw new Error(`Unhandled crew role: ${String(r)}`);
}
var CrewMemberSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  role: CrewRoleSchema,
  /** Optional public-facing title when the crew member spans multiple jobs. */
  roleLabel: z.string().min(1).optional(),
  worksWith: z.array(SlugSchema).min(1, "every crew member must work with at least one member"),
  socials: z.array(SocialSchema).default([])
});
var LiveEntrySchema = z.object({
  memberSlug: z.string().min(1),
  platform: PlatformSchema,
  isLive: z.boolean(),
  url: z.string().url(),
  title: z.string().optional(),
  viewerCount: z.number().int().nonnegative().optional(),
  startedAt: z.string().datetime().optional(),
  thumbnailUrl: z.string().url().optional()
});
var LiveResponseSchema = z.object({
  fetchedAt: z.string().datetime(),
  entries: z.array(LiveEntrySchema)
});
var ContentKindSchema = z.enum([
  "video",
  "short",
  "post",
  "clip",
  "vod"
]);
function assertNeverContentKind(k) {
  throw new Error(`Unhandled content kind: ${String(k)}`);
}
var ContentItemSchema = z.object({
  id: z.string().min(1),
  memberSlug: z.string().min(1),
  platform: PlatformSchema,
  kind: ContentKindSchema,
  url: z.string().url(),
  title: z.string().min(1),
  publishedAt: z.string().datetime(),
  thumbnailUrl: z.string().url().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  viewCount: z.number().int().nonnegative().optional()
});
var MemberIdSchema = z.string().uuid().brand();
var SocialIdSchema = z.string().uuid().brand();
var CrewMemberIdSchema = z.string().uuid().brand();
var ContentIdSchema = z.string().uuid().brand();
var LiveSnapshotIdSchema = z.string().uuid().brand();
var AuditEventIdSchema = z.string().min(20).brand();
var PersonIdSchema = z.string().uuid().brand();
var AuthorIdSchema = z.string().uuid().brand();
var PostIdSchema = z.string().uuid().brand();
var MediaIdSchema = z.string().uuid().brand();
var FaceTagIdSchema = z.string().uuid().brand();
var PersonKindSchema = z.enum(["member", "crew", "external"]);
function assertNeverPersonKind(p) {
  throw new Error(`Unhandled person kind: ${String(p)}`);
}
var PersonBaseSchema = z.object({
  id: PersonIdSchema,
  consentForFaceIndexing: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
var MemberPersonDataSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  realName: z.string().min(1),
  accent: AccentSchema,
  portraitUrl: z.string().url().optional(),
  socials: z.array(SocialSchema).default([])
});
var CrewPersonDataSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1),
  role: CrewRoleSchema,
  avatarUrl: z.string().url().optional(),
  socials: z.array(SocialSchema).default([])
});
var ExternalPersonDataSchema = z.object({
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  socials: z.array(SocialSchema).default([])
});
var MemberPersonSchema = PersonBaseSchema.extend({
  kind: z.literal("member"),
  member: MemberPersonDataSchema
});
var CrewPersonSchema = PersonBaseSchema.extend({
  kind: z.literal("crew"),
  crew: CrewPersonDataSchema
});
var ExternalPersonSchema = PersonBaseSchema.extend({
  kind: z.literal("external"),
  external: ExternalPersonDataSchema
});
var PersonSchema = z.discriminatedUnion("kind", [
  MemberPersonSchema,
  CrewPersonSchema,
  ExternalPersonSchema
]);
var AuthorRoleSchema = z.enum(["owner", "editor", "writer"]);
function assertNeverAuthorRole(r) {
  throw new Error(`Unhandled author role: ${String(r)}`);
}
var AuthorSchema = z.object({
  id: AuthorIdSchema,
  /** Clerk's `user_<…>` id; immutable for the lifetime of the user. */
  clerkUserId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  role: AuthorRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
var PostStatusSchema = z.enum(["draft", "scheduled", "published", "archived"]);
function assertNeverPostStatus(s) {
  throw new Error(`Unhandled post status: ${String(s)}`);
}
var PostSchema = z.object({
  id: PostIdSchema,
  slug: SlugSchema,
  title: z.string().min(1).max(180),
  subtitle: z.string().max(280).optional(),
  excerpt: z.string().max(300).optional(),
  authorId: AuthorIdSchema,
  coverMediaId: MediaIdSchema.optional(),
  /** Tiptap JSON document. Editor owns the inner schema. */
  bodyJson: z.unknown(),
  status: PostStatusSchema,
  /** Set when status moves to `published`. */
  publishedAt: z.string().datetime().optional(),
  /** Required when `status === "scheduled"`; undefined otherwise. */
  scheduledFor: z.string().datetime().optional(),
  /** Person ids referenced inside the body. Denormalized; api-maintained. */
  taggedPersonIds: z.array(PersonIdSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).refine(
  (p) => p.status === "scheduled" ? !!p.scheduledFor : true,
  { message: "scheduled status requires scheduledFor", path: ["scheduledFor"] }
).refine(
  (p) => p.status === "published" ? !!p.publishedAt : true,
  { message: "published status requires publishedAt", path: ["publishedAt"] }
);
var MediaKindSchema = z.enum(["image", "video"]);
function assertNeverMediaKind(k) {
  throw new Error(`Unhandled media kind: ${String(k)}`);
}
var FaceDetectionStatusSchema = z.enum([
  "pending",
  "processing",
  "complete",
  "skipped",
  "failed"
]);
var BoundingBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1)
});
var MediaSchema = z.object({
  id: MediaIdSchema,
  kind: MediaKindSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i, "contentHash must be a hex SHA-256"),
  url: z.string().url(),
  s3Mirror: z.string().regex(/^s3:\/\/[a-z0-9.\-_/]+$/i, "s3Mirror must be an s3://bucket/key URI").optional(),
  contentType: z.string().min(3),
  bytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Video only. Null/undefined for images. */
  durationSeconds: z.number().int().nonnegative().optional(),
  uploadedById: AuthorIdSchema,
  faceDetection: z.object({
    status: FaceDetectionStatusSchema,
    attemptedAt: z.string().datetime().optional(),
    error: z.string().max(500).optional()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
var FaceTagSourceSchema = z.enum(["auto", "manual"]);
function assertNeverFaceTagSource(s) {
  throw new Error(`Unhandled face-tag source: ${String(s)}`);
}
var FaceTagSchema = z.object({
  id: FaceTagIdSchema,
  mediaId: MediaIdSchema,
  personId: PersonIdSchema,
  source: FaceTagSourceSchema,
  /** 0–1 match score from Rekognition. Undefined for manual tags. */
  confidence: z.number().min(0).max(1).optional(),
  boundingBox: BoundingBoxSchema,
  /** Video tag interval start, seconds. Undefined for images. */
  startTimeSeconds: z.number().nonnegative().optional(),
  /** Video tag interval end, seconds. Undefined for images. */
  endTimeSeconds: z.number().nonnegative().optional(),
  /**
   * Author who created the tag. Required for `source: "manual"`,
   * undefined for `source: "auto"` (no human in the loop).
   */
  createdById: AuthorIdSchema.optional(),
  createdAt: z.string().datetime()
}).refine(
  (t) => t.startTimeSeconds === void 0 || t.endTimeSeconds === void 0 || t.endTimeSeconds > t.startTimeSeconds,
  { message: "endTimeSeconds must be greater than startTimeSeconds", path: ["endTimeSeconds"] }
).refine(
  (t) => t.source === "manual" ? t.createdById !== void 0 : t.createdById === void 0,
  {
    message: "manual tags require createdById; auto tags must omit it",
    path: ["createdById"]
  }
).refine(
  (t) => t.source === "auto" ? t.confidence !== void 0 : t.confidence === void 0,
  {
    message: "auto tags require confidence; manual tags must omit it",
    path: ["confidence"]
  }
);
var TalentTagSchema = z.object({
  id: PersonIdSchema,
  kind: PersonKindSchema,
  name: z.string().min(1),
  href: z.string(),
  avatarUrl: z.string().url().optional(),
  role: CrewRoleSchema.optional(),
  socials: z.array(SocialSchema).default([])
});

// src/data/members.ts
var MEMBERS = [
  {
    slug: "marlon",
    name: "Marlon",
    realName: "Marlon Lundgren Garcia",
    birthDate: "2001-09-07",
    accent: "#f4f4f5",
    wikipedia: ["https://en.wikipedia.org/wiki/Marlon_(streamer)"],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/@Mar3lg",
        handle: "@Mar3lg",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@OtherSideOfMarlon",
        handle: "@OtherSideOfMarlon",
        label: "Other Side"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@MarlonVODs",
        handle: "@MarlonVODs",
        label: "VODs"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@marlon3lg",
        handle: "@marlon3lg"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/marlon3lg",
        handle: "@marlon3lg"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/marlon",
        handle: "marlon"
      },
      {
        platform: "x",
        url: "https://x.com/Mar3lg",
        handle: "@Mar3lg"
      },
      {
        platform: "snapchat",
        url: "https://www.snapchat.com/@marlonluga",
        handle: "@marlonluga"
      }
    ]
  },
  {
    slug: "lacy",
    name: "Lacy",
    realName: "Nicholas Fosco",
    accent: "#ef4444",
    wikipedia: ["https://youtube.fandom.com/wiki/Lacy_Live"],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/@lacyhimself",
        handle: "@lacyhimself",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@LacyIRLs",
        handle: "@LacyIRLs",
        label: "IRL"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@lacylive",
        handle: "@lacylive",
        label: "Live"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@lacy",
        handle: "@lacy"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/lacy.himself/",
        handle: "@lacy.himself"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/lacy/",
        handle: "lacy"
      },
      {
        platform: "x",
        url: "https://x.com/LacyHimself",
        handle: "@LacyHimself"
      },
      {
        platform: "snapchat",
        url: "https://www.snapchat.com/@lacy.himself",
        handle: "@lacy.himself"
      }
    ]
  },
  {
    slug: "silky",
    name: "Silky",
    realName: "Jerry Woo",
    birthDate: "1997-10-21",
    accent: "#f59e0b",
    wikipedia: ["https://streamers.fandom.com/wiki/Silky"],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/@Silky2",
        handle: "@Silky2",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@SilkyLive",
        handle: "@SilkyLive",
        label: "Live"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@yungsilk",
        handle: "@yungsilk"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/silky.durag/",
        handle: "@silky.durag"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/silky",
        handle: "silky"
      },
      {
        platform: "x",
        url: "https://x.com/SilkySzn",
        handle: "@SilkySzn"
      }
    ]
  },
  {
    slug: "adapt",
    name: "Adapt",
    realName: "Alexander Hamilton Prynkiewicz",
    accent: "#ef4444",
    wikipedia: ["https://youtube.fandom.com/wiki/FaZe_Adapt"],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/@adapt",
        handle: "@adapt",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@FaZeAdaptLive",
        handle: "@FaZeAdaptLive",
        label: "Live"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@fazeadapt",
        handle: "@fazeadapt"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/thefazeadapt",
        handle: "@thefazeadapt"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/adapt",
        handle: "adapt"
      },
      {
        platform: "x",
        url: "https://x.com/FaZeAdapt",
        handle: "@FaZeAdapt"
      },
      {
        platform: "snapchat",
        url: "https://www.snapchat.com/@adaptsnaps",
        handle: "@adaptsnaps"
      }
    ]
  },
  {
    slug: "ron",
    name: "Ron",
    realName: "Rani Netz",
    birthDate: "2003-01-15",
    accent: "#3b82f6",
    wikipedia: [
      "https://en.wikipedia.org/wiki/Stable_Ronaldo",
      "https://streamers.fandom.com/wiki/StableRonaldo"
    ],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/channel/stableronaldoyt",
        handle: "stableronaldoyt",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@StableRonaldoLive",
        handle: "@StableRonaldoLive",
        label: "Live"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@TheStableYT",
        handle: "@TheStableYT",
        label: "The Stable"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@realstableronaldo",
        handle: "@realstableronaldo"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/stableronaldo/",
        handle: "@stableronaldo"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/stableronaldo",
        handle: "stableronaldo"
      },
      {
        platform: "x",
        url: "https://x.com/StableRonaldo",
        handle: "@StableRonaldo"
      },
      {
        platform: "snapchat",
        url: "https://www.snapchat.com/@stableronaldoo",
        handle: "@stableronaldoo"
      }
    ]
  },
  {
    slug: "jason",
    name: "Jason",
    realName: "Jason Nguyen",
    birthDate: "2004-05-09",
    accent: "#fbbf24",
    wikipedia: ["https://twitch-streamers.fandom.com/wiki/Jason_the_ween"],
    socials: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/c/jasontheweenie",
        handle: "jasontheweenie",
        label: "Main"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@JasonTheWeenIRL",
        handle: "@JasonTheWeenIRL",
        label: "IRL"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@JasonTheWeenCIips",
        handle: "@JasonTheWeenCIips",
        label: "Clips"
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/@JasonTheWeenVOD",
        handle: "@JasonTheWeenVOD",
        label: "VODs"
      },
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@jasontheween",
        handle: "@jasontheween"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/jasontheween/",
        handle: "@jasontheween"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/jasontheween",
        handle: "jasontheween"
      },
      {
        platform: "x",
        url: "https://x.com/jasontheween",
        handle: "@jasontheween"
      },
      {
        platform: "snapchat",
        url: "https://www.snapchat.com/@jasontheweens",
        handle: "@jasontheweens"
      }
    ]
  }
];
var MEMBERS_BY_SLUG = Object.freeze(
  Object.fromEntries(MEMBERS.map((m) => [m.slug, m]))
);

// src/data/team.ts
var CREW = [
  {
    slug: "drew-wall",
    name: "Drew Wall",
    role: "cameraman",
    worksWith: ["lacy"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/drewwall_/",
        handle: "@drewwall_"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/drewwall14/",
        handle: "@drewwall14"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/drewwall",
        handle: "drewwall"
      }
    ]
  },
  {
    slug: "laiys",
    name: "Laiys",
    role: "cameraman",
    worksWith: ["ron"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/Laiys_",
        handle: "@Laiys_"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/laiysxdxd/",
        handle: "@laiysxdxd"
      },
      {
        platform: "twitch",
        url: "https://www.twitch.tv/Laiys",
        handle: "laiys"
      }
    ]
  },
  {
    slug: "gilbert",
    name: "Gilbert",
    role: "cameraman",
    worksWith: ["adapt"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/gilbertsclips",
        handle: "@gilbertsclips"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/gilbertsclips",
        handle: "@gilbertsclips"
      }
    ]
  },
  {
    slug: "lazer",
    name: "Lazer",
    role: "cameraman",
    worksWith: ["silky"],
    socials: [
      {
        platform: "instagram",
        url: "https://www.instagram.com/mrlazerboyfzn/",
        handle: "@mrlazerboyfzn"
      },
      {
        platform: "x",
        url: "https://x.com/MrLazerboyFZN",
        handle: "@MrLazerboyFZN"
      }
    ]
  },
  {
    slug: "john-ngo",
    name: "John Ngo",
    role: "cameraman",
    worksWith: ["jason"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/itsjawhn",
        handle: "@itsjawhn"
      },
      {
        platform: "instagram",
        url: "https://www.instagram.com/jawhnnn/",
        handle: "@jawhnnn"
      }
    ]
  },
  {
    slug: "wojito",
    name: "Wojito",
    role: "management",
    worksWith: ["jason"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/Wojito",
        handle: "@Wojito"
      }
    ]
  },
  {
    slug: "said",
    name: "Said (Smiley)",
    role: "management",
    worksWith: ["silky"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/_saidd1",
        handle: "@_saidd1"
      }
    ]
  },
  {
    slug: "sixty",
    name: "Sixty",
    role: "producer",
    roleLabel: "Technical Productions",
    worksWith: ["jason"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/sixtyvari0us",
        handle: "@sixtyvari0us"
      }
    ]
  },
  {
    slug: "bepsy",
    name: "Bepsy",
    role: "cameraman",
    roleLabel: "Cameraman & Technology Operator",
    worksWith: ["ron"],
    socials: [
      {
        platform: "x",
        url: "https://x.com/bepsy_",
        handle: "@bepsy_"
      }
    ]
  }
];
var CREW_BY_SLUG = Object.freeze(
  Object.fromEntries(CREW.map((c) => [c.slug, c]))
);

// src/helpers/taggable.ts
function toTalentTag(person) {
  switch (person.kind) {
    case "member": {
      const tag = {
        id: person.id,
        kind: "member",
        name: person.member.name,
        href: `/m/${person.member.slug}`,
        socials: person.member.socials
      };
      if (person.member.portraitUrl !== void 0) {
        tag.avatarUrl = person.member.portraitUrl;
      }
      return tag;
    }
    case "crew": {
      const tag = {
        id: person.id,
        kind: "crew",
        name: person.crew.name,
        href: "#",
        role: person.crew.role,
        socials: person.crew.socials
      };
      if (person.crew.avatarUrl !== void 0) {
        tag.avatarUrl = person.crew.avatarUrl;
      }
      return tag;
    }
    case "external": {
      const firstSocial = person.external.socials[0]?.url ?? "#";
      const tag = {
        id: person.id,
        kind: "external",
        name: person.external.name,
        href: firstSocial,
        socials: person.external.socials
      };
      if (person.external.avatarUrl !== void 0) {
        tag.avatarUrl = person.external.avatarUrl;
      }
      return tag;
    }
    default:
      assertNeverPersonKind(person);
  }
}

// src/constants.ts
var PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "twitch",
  "x",
  "snapchat",
  "wikipedia"
];
var GROUP_NAME = "The Core Boys";
var GROUP_TAGLINE = "Create Own Run Everything";
var GROUP_SOCIALS = [
  {
    platform: "youtube",
    url: "https://www.youtube.com/@createownruneverything",
    handle: "@createownruneverything"
  },
  {
    platform: "tiktok",
    url: "https://www.tiktok.com/@officialcoreboys",
    handle: "@officialcoreboys"
  },
  {
    platform: "x",
    url: "https://x.com/thecoreboys",
    handle: "@thecoreboys"
  },
  {
    platform: "instagram",
    url: "https://www.instagram.com/createownruneverything",
    handle: "@createownruneverything"
  }
];
var MEMBER_SLUGS = MEMBERS.map((m) => m.slug);

export { AccentSchema, AuditEventIdSchema, AuthorIdSchema, AuthorRoleSchema, AuthorSchema, BoundingBoxSchema, CREW, CREW_BY_SLUG, ContentIdSchema, ContentItemSchema, ContentKindSchema, CrewMemberIdSchema, CrewMemberSchema, CrewPersonDataSchema, CrewPersonSchema, CrewRoleSchema, ExternalPersonDataSchema, ExternalPersonSchema, FaceDetectionStatusSchema, FaceTagIdSchema, FaceTagSchema, FaceTagSourceSchema, GROUP_NAME, GROUP_SOCIALS, GROUP_TAGLINE, IsoDateSchema, LiveEntrySchema, LiveResponseSchema, LiveSnapshotIdSchema, MEMBERS, MEMBERS_BY_SLUG, MEMBER_SLUGS, MediaIdSchema, MediaKindSchema, MediaSchema, MemberIdSchema, MemberPersonDataSchema, MemberPersonSchema, MemberSchema, PLATFORMS, PersonIdSchema, PersonKindSchema, PersonSchema, PlatformSchema, PostIdSchema, PostSchema, PostStatusSchema, SlugSchema, SocialIdSchema, SocialSchema, TalentTagSchema, assertNeverAuthorRole, assertNeverContentKind, assertNeverCrewRole, assertNeverFaceTagSource, assertNeverMediaKind, assertNeverPersonKind, assertNeverPlatform, assertNeverPostStatus, isUrlForPlatform, toTalentTag };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
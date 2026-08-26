import { z } from 'zod';

/**
 * Tagged-union of every platform we know about, as a Postgres-friendly
 * lowercase string literal. Adding a value here cascades to:
 *
 *   - `coreboys-db` schema (platform enum) — needs a migration.
 *   - `coreboys-api` OpenAPI spec.
 *   - `coreboys-web` `<SocialIcon>` map.
 *
 * Reach for {@link assertNeverPlatform} when narrowing in a switch so the
 * compiler catches a missing branch the moment the union grows.
 */
declare const PlatformSchema: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
/**
 * @returns true if the URL's host is plausible for the given platform.
 * Used inside `SocialSchema` as a `.refine()`-attached check so a TikTok
 * social pointing at `https://example.com` fails parse.
 */
declare function isUrlForPlatform(url: string, platform: z.infer<typeof PlatformSchema>): boolean;
/**
 * Exhaustiveness helper for `switch (platform)` blocks. Calling this in the
 * `default:` branch turns a missing case into a compile error AND a
 * runtime exception:
 *
 *     switch (platform) {
 *       case "youtube": …; break;
 *       …
 *       default: assertNeverPlatform(platform);
 *     }
 */
declare function assertNeverPlatform(p: never): never;

/** Hex color string. Six-digit or three-digit form. */
declare const AccentSchema: z.ZodString;
/** Lowercase, kebab-case slug. Used for URLs and primary lookups. */
declare const SlugSchema: z.ZodString;
/** ISO 8601 calendar date (YYYY-MM-DD). No time component. */
declare const IsoDateSchema: z.ZodString;
/**
 * One social link belonging to a member. The `url` is validated **per
 * platform** — a TikTok URL must live on `tiktok.com`, etc. See
 * {@link isUrlForPlatform} for the host predicates.
 */
declare const SocialSchema: z.ZodEffects<z.ZodObject<{
    platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
    url: z.ZodString;
    handle: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    handle?: string | undefined;
    label?: string | undefined;
}, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    handle?: string | undefined;
    label?: string | undefined;
}>, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    handle?: string | undefined;
    label?: string | undefined;
}, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    handle?: string | undefined;
    label?: string | undefined;
}>;
/**
 * Canonical Member shape. The source of truth for who's in the group + the
 * facts visible on every consumer. Db-backed consumers extend this with a
 * branded `MemberId` (`MemberSchema.extend({ id: MemberIdSchema })`).
 *
 * `socials` carries at least one entry — a member with zero public links
 * isn't a Core Boy, definitionally.
 */
declare const MemberSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    realName: z.ZodString;
    birthDate: z.ZodOptional<z.ZodString>;
    wikipedia: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    socials: z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">;
    accent: z.ZodString;
}, "strip", z.ZodTypeAny, {
    wikipedia: string[];
    slug: string;
    name: string;
    realName: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    accent: string;
    birthDate?: string | undefined;
}, {
    slug: string;
    name: string;
    realName: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    accent: string;
    wikipedia?: string[] | undefined;
    birthDate?: string | undefined;
}>;

type Platform = z.infer<typeof PlatformSchema>;
type Accent = z.infer<typeof AccentSchema>;
type Social = z.infer<typeof SocialSchema>;
type Member = z.infer<typeof MemberSchema>;

/**
 * Roles a crew member can hold. Mirrors the `crew_role` Postgres enum in
 * `coreboys-db`. Reach for {@link assertNeverCrewRole} when narrowing in a
 * switch.
 */
declare const CrewRoleSchema: z.ZodEnum<["cameraman", "management", "editor", "producer"]>;
/**
 * Exhaustiveness helper for `switch (role)` blocks. See the matching
 * `assertNeverPlatform` in `schemas/platform.ts`.
 */
declare function assertNeverCrewRole(r: never): never;
/**
 * Behind-the-scenes person (cameraman, management, editor, producer). The
 * `worksWith` array references member slugs — referential integrity is
 * checked by the test suite, not at runtime, because Zod doesn't have
 * cross-document context here.
 */
declare const CrewMemberSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["cameraman", "management", "editor", "producer"]>;
    /** Optional public-facing title when the crew member spans multiple jobs. */
    roleLabel: z.ZodOptional<z.ZodString>;
    worksWith: z.ZodArray<z.ZodString, "many">;
    socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    slug: string;
    name: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    role: "cameraman" | "management" | "editor" | "producer";
    worksWith: string[];
    roleLabel?: string | undefined;
}, {
    slug: string;
    name: string;
    role: "cameraman" | "management" | "editor" | "producer";
    worksWith: string[];
    socials?: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[] | undefined;
    roleLabel?: string | undefined;
}>;

type CrewRole = z.infer<typeof CrewRoleSchema>;
type CrewMember = z.infer<typeof CrewMemberSchema>;

/**
 * One member's current live state on a single platform. `isLive: false`
 * carries no further fields; `isLive: true` pulls the title / viewer count /
 * thumbnail / start time / etc. from the upstream provider (Twitch Helix today).
 */
declare const LiveEntrySchema: z.ZodObject<{
    memberSlug: z.ZodString;
    platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
    isLive: z.ZodBoolean;
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    viewerCount: z.ZodOptional<z.ZodNumber>;
    startedAt: z.ZodOptional<z.ZodString>;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    memberSlug: string;
    isLive: boolean;
    title?: string | undefined;
    viewerCount?: number | undefined;
    startedAt?: string | undefined;
    thumbnailUrl?: string | undefined;
}, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    memberSlug: string;
    isLive: boolean;
    title?: string | undefined;
    viewerCount?: number | undefined;
    startedAt?: string | undefined;
    thumbnailUrl?: string | undefined;
}>;
/**
 * Wire shape returned by the api's `/v1/live` endpoint. `cached: boolean`
 * tells the caller whether the payload came from a fresh upstream fetch
 * or the SWR cache — useful for client-side jitter and debugging.
 */
declare const LiveResponseSchema: z.ZodObject<{
    fetchedAt: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        memberSlug: z.ZodString;
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        isLive: z.ZodBoolean;
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        viewerCount: z.ZodOptional<z.ZodNumber>;
        startedAt: z.ZodOptional<z.ZodString>;
        thumbnailUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        memberSlug: string;
        isLive: boolean;
        title?: string | undefined;
        viewerCount?: number | undefined;
        startedAt?: string | undefined;
        thumbnailUrl?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        memberSlug: string;
        isLive: boolean;
        title?: string | undefined;
        viewerCount?: number | undefined;
        startedAt?: string | undefined;
        thumbnailUrl?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        memberSlug: string;
        isLive: boolean;
        title?: string | undefined;
        viewerCount?: number | undefined;
        startedAt?: string | undefined;
        thumbnailUrl?: string | undefined;
    }[];
    fetchedAt: string;
}, {
    entries: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        memberSlug: string;
        isLive: boolean;
        title?: string | undefined;
        viewerCount?: number | undefined;
        startedAt?: string | undefined;
        thumbnailUrl?: string | undefined;
    }[];
    fetchedAt: string;
}>;

type LiveEntry = z.infer<typeof LiveEntrySchema>;
type LiveResponse = z.infer<typeof LiveResponseSchema>;

/**
 * Distinct kinds of content we track. `vod` is a Twitch VOD; `clip` is a
 * Twitch clip; `short` is a vertical < 60s; `post` is text-led (X, IG
 * captions, etc.); `video` is the catch-all long-form form-factor.
 */
declare const ContentKindSchema: z.ZodEnum<["video", "short", "post", "clip", "vod"]>;
/**
 * Exhaustiveness helper for `switch (kind)` blocks.
 */
declare function assertNeverContentKind(k: never): never;
/**
 * One piece of content authored by a member on a platform. `externalId`
 * is the platform's stable identifier (e.g. YouTube videoId), used to
 * dedupe re-ingested rows; `(platform, externalId)` is unique in `coreboys-db`.
 */
declare const ContentItemSchema: z.ZodObject<{
    id: z.ZodString;
    memberSlug: z.ZodString;
    platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
    kind: z.ZodEnum<["video", "short", "post", "clip", "vod"]>;
    url: z.ZodString;
    title: z.ZodString;
    publishedAt: z.ZodString;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
    durationSeconds: z.ZodOptional<z.ZodNumber>;
    viewCount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    memberSlug: string;
    title: string;
    id: string;
    kind: "video" | "short" | "post" | "clip" | "vod";
    publishedAt: string;
    thumbnailUrl?: string | undefined;
    durationSeconds?: number | undefined;
    viewCount?: number | undefined;
}, {
    platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
    url: string;
    memberSlug: string;
    title: string;
    id: string;
    kind: "video" | "short" | "post" | "clip" | "vod";
    publishedAt: string;
    thumbnailUrl?: string | undefined;
    durationSeconds?: number | undefined;
    viewCount?: number | undefined;
}>;

type ContentKind = z.infer<typeof ContentKindSchema>;
type ContentItem = z.infer<typeof ContentItemSchema>;

/**
 * Branded ID schemas. Each one validates a UUID at the wire layer and stamps
 * a phantom brand at the type layer so the compiler refuses to mix them up:
 *
 *     const m: MemberId = ...
 *     const s: SocialId = m;       // ❌ TypeScript: brand mismatch
 *     api.deleteMember(s);          // ❌ same
 *
 * Use `MemberIdSchema.parse(uuidString)` to attach the brand at runtime.
 *
 * Branded ids are deliberately optional in the canonical content schemas
 * (`MemberSchema`, `SocialSchema`, `CrewMemberSchema`) — those represent the
 * shape of canonical data sourced from this package's `data/` arrays, which
 * don't carry DB-issued ids. DB-backed consumers (`coreboys-db`,
 * `coreboys-api`) extend these schemas with the matching `*IdSchema` field.
 */
/** UUID v4/v7 string branded as a Member's primary key. */
declare const MemberIdSchema: z.ZodBranded<z.ZodString, "MemberId">;
/** UUID branded as a Social's primary key. */
declare const SocialIdSchema: z.ZodBranded<z.ZodString, "SocialId">;
/** UUID branded as a CrewMember's primary key. */
declare const CrewMemberIdSchema: z.ZodBranded<z.ZodString, "CrewMemberId">;
/** UUID branded as a ContentItem's primary key. */
declare const ContentIdSchema: z.ZodBranded<z.ZodString, "ContentId">;
/** UUID branded as a LiveStatusSnapshot's primary key. */
declare const LiveSnapshotIdSchema: z.ZodBranded<z.ZodString, "LiveSnapshotId">;
/** ULID branded as an AuditLog row's primary key. */
declare const AuditEventIdSchema: z.ZodBranded<z.ZodString, "AuditEventId">;
/**
 * UUID branded as a Person's primary key. A Person is the polymorphic
 * tagging entity that wraps a Member, a CrewMember, or an external
 * collaborator — see `PersonSchema`.
 */
declare const PersonIdSchema: z.ZodBranded<z.ZodString, "PersonId">;
/** UUID branded as an Author's primary key (admin profile, Clerk-linked). */
declare const AuthorIdSchema: z.ZodBranded<z.ZodString, "AuthorId">;
/** UUID branded as a blog Post's primary key. */
declare const PostIdSchema: z.ZodBranded<z.ZodString, "PostId">;
/** UUID branded as a Media row's primary key (image / video upload). */
declare const MediaIdSchema: z.ZodBranded<z.ZodString, "MediaId">;
/** UUID branded as a FaceTag's primary key. */
declare const FaceTagIdSchema: z.ZodBranded<z.ZodString, "FaceTagId">;

/** Branded primary key for {@link Member}. */
type MemberId = z.infer<typeof MemberIdSchema>;
/** Branded primary key for {@link Social}. */
type SocialId = z.infer<typeof SocialIdSchema>;
/** Branded primary key for {@link CrewMember}. */
type CrewMemberId = z.infer<typeof CrewMemberIdSchema>;
/** Branded primary key for {@link ContentItem}. */
type ContentId = z.infer<typeof ContentIdSchema>;
/** Branded primary key for a `live_status_snapshots` row. */
type LiveSnapshotId = z.infer<typeof LiveSnapshotIdSchema>;
/** Branded primary key for an `audit_log` row. */
type AuditEventId = z.infer<typeof AuditEventIdSchema>;
/** Branded primary key for a `Person` (member / crew / external). */
type PersonId = z.infer<typeof PersonIdSchema>;
/** Branded primary key for an `Author` (admin profile). */
type AuthorId = z.infer<typeof AuthorIdSchema>;
/** Branded primary key for a `Post`. */
type PostId = z.infer<typeof PostIdSchema>;
/** Branded primary key for a `Media` row (image / video upload). */
type MediaId = z.infer<typeof MediaIdSchema>;
/** Branded primary key for a `FaceTag`. */
type FaceTagId = z.infer<typeof FaceTagIdSchema>;

/**
 * Three-valued discriminator for {@link PersonSchema}. Each kind carries a
 * different denormalized payload so the renderer can display a Person
 * without a follow-up lookup against `MEMBERS` / `CREW`.
 *
 * Reach for {@link assertNeverPersonKind} when narrowing in a switch.
 */
declare const PersonKindSchema: z.ZodEnum<["member", "crew", "external"]>;
/** Exhaustiveness helper for `switch (kind)` blocks over `PersonKind`. */
declare function assertNeverPersonKind(p: never): never;
/**
 * Denormalized member payload carried inside a `kind: "member"` Person.
 * Mirrors the subset of `MemberSchema` the renderer needs, plus the
 * portrait URL (which lives on the DB row, not in the canonical content
 * arrays).
 */
declare const MemberPersonDataSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    realName: z.ZodString;
    accent: z.ZodString;
    portraitUrl: z.ZodOptional<z.ZodString>;
    socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    slug: string;
    name: string;
    realName: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    accent: string;
    portraitUrl?: string | undefined;
}, {
    slug: string;
    name: string;
    realName: string;
    accent: string;
    socials?: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[] | undefined;
    portraitUrl?: string | undefined;
}>;
/** Denormalized crew payload carried inside a `kind: "crew"` Person. */
declare const CrewPersonDataSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["cameraman", "management", "editor", "producer"]>;
    avatarUrl: z.ZodOptional<z.ZodString>;
    socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    slug: string;
    name: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    role: "cameraman" | "management" | "editor" | "producer";
    avatarUrl?: string | undefined;
}, {
    slug: string;
    name: string;
    role: "cameraman" | "management" | "editor" | "producer";
    socials?: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[] | undefined;
    avatarUrl?: string | undefined;
}>;
/**
 * Full payload for an external collaborator — someone outside the org's
 * member + crew lists who shows up in an article or gets manually face-
 * tagged on a piece of media.
 */
declare const ExternalPersonDataSchema: z.ZodObject<{
    name: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    avatarUrl?: string | undefined;
    bio?: string | undefined;
}, {
    name: string;
    socials?: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[] | undefined;
    avatarUrl?: string | undefined;
    bio?: string | undefined;
}>;
/** `kind: "member"` variant of {@link PersonSchema}. */
declare const MemberPersonSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"member">;
    member: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        realName: z.ZodString;
        accent: z.ZodString;
        portraitUrl: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        realName: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        accent: string;
        portraitUrl?: string | undefined;
    }, {
        slug: string;
        name: string;
        realName: string;
        accent: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        portraitUrl?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "member";
    member: {
        slug: string;
        name: string;
        realName: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        accent: string;
        portraitUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "member";
    member: {
        slug: string;
        name: string;
        realName: string;
        accent: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        portraitUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>;
/** `kind: "crew"` variant of {@link PersonSchema}. */
declare const CrewPersonSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"crew">;
    crew: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<["cameraman", "management", "editor", "producer"]>;
        avatarUrl: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        role: "cameraman" | "management" | "editor" | "producer";
        avatarUrl?: string | undefined;
    }, {
        slug: string;
        name: string;
        role: "cameraman" | "management" | "editor" | "producer";
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "crew";
    crew: {
        slug: string;
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        role: "cameraman" | "management" | "editor" | "producer";
        avatarUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "crew";
    crew: {
        slug: string;
        name: string;
        role: "cameraman" | "management" | "editor" | "producer";
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>;
/** `kind: "external"` variant of {@link PersonSchema}. */
declare const ExternalPersonSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"external">;
    external: z.ZodObject<{
        name: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodString>;
        bio: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    }, {
        name: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "external";
    external: {
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "external";
    external: {
        name: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>;
/**
 * The unified tagging entity. Tag this in articles, on media, and against
 * face matches. Discriminated on `kind` — switch with help from
 * {@link assertNeverPersonKind}.
 *
 * Wire shape only: this is what the api hands to consumers, NOT the raw
 * DB row. The api resolves member / crew refs into the embedded data on
 * read.
 */
declare const PersonSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"member">;
    member: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        realName: z.ZodString;
        accent: z.ZodString;
        portraitUrl: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        realName: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        accent: string;
        portraitUrl?: string | undefined;
    }, {
        slug: string;
        name: string;
        realName: string;
        accent: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        portraitUrl?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "member";
    member: {
        slug: string;
        name: string;
        realName: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        accent: string;
        portraitUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "member";
    member: {
        slug: string;
        name: string;
        realName: string;
        accent: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        portraitUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>, z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"crew">;
    crew: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<["cameraman", "management", "editor", "producer"]>;
        avatarUrl: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        role: "cameraman" | "management" | "editor" | "producer";
        avatarUrl?: string | undefined;
    }, {
        slug: string;
        name: string;
        role: "cameraman" | "management" | "editor" | "producer";
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "crew";
    crew: {
        slug: string;
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        role: "cameraman" | "management" | "editor" | "producer";
        avatarUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "crew";
    crew: {
        slug: string;
        name: string;
        role: "cameraman" | "management" | "editor" | "producer";
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>, z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    consentForFaceIndexing: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
} & {
    kind: z.ZodLiteral<"external">;
    external: z.ZodObject<{
        name: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodString>;
        bio: z.ZodOptional<z.ZodString>;
        socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
            url: z.ZodString;
            handle: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }, {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    }, {
        name: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"PersonId">;
    kind: "external";
    external: {
        name: string;
        socials: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[];
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}, {
    id: string;
    kind: "external";
    external: {
        name: string;
        socials?: {
            platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
            url: string;
            handle?: string | undefined;
            label?: string | undefined;
        }[] | undefined;
        avatarUrl?: string | undefined;
        bio?: string | undefined;
    };
    consentForFaceIndexing: boolean;
    createdAt: string;
    updatedAt: string;
}>]>;

/** Discriminator literal for {@link Person}. */
type PersonKind = z.infer<typeof PersonKindSchema>;
/** Denormalized member payload carried by `Person` of `kind: "member"`. */
type MemberPersonData = z.infer<typeof MemberPersonDataSchema>;
/** Denormalized crew payload carried by `Person` of `kind: "crew"`. */
type CrewPersonData = z.infer<typeof CrewPersonDataSchema>;
/** Full payload for an external collaborator. */
type ExternalPersonData = z.infer<typeof ExternalPersonDataSchema>;
type MemberPerson = z.infer<typeof MemberPersonSchema>;
type CrewPerson = z.infer<typeof CrewPersonSchema>;
type ExternalPerson = z.infer<typeof ExternalPersonSchema>;
/**
 * The unified tagging entity — a discriminated union over `kind`.
 * See {@link PersonSchema} for shape details.
 */
type Person = z.infer<typeof PersonSchema>;

/**
 * Author roles. Mirrors the role tier used by the cms's `RoleGate`:
 *   - `owner`  — manage roles, delete posts, rotate keys
 *   - `editor` — write + edit any post, publish
 *   - `writer` — write own drafts, publish own posts
 *
 * The api enforces these server-side; the cms hides actions client-side.
 */
declare const AuthorRoleSchema: z.ZodEnum<["owner", "editor", "writer"]>;
/** Exhaustiveness helper for `switch (role)` blocks over `AuthorRole`. */
declare function assertNeverAuthorRole(r: never): never;
/**
 * Author profile — one row per admin who can write or edit posts.
 * Linked to a Clerk user via `clerkUserId`; the Clerk session is the
 * source of truth for sign-in, this row is the source of truth for the
 * editorial profile (display name, bio, avatar) shown publicly on posts.
 */
declare const AuthorSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "AuthorId">;
    /** Clerk's `user_<…>` id; immutable for the lifetime of the user. */
    clerkUserId: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodString;
    bio: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["owner", "editor", "writer"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    role: "editor" | "owner" | "writer";
    id: string & z.BRAND<"AuthorId">;
    createdAt: string;
    updatedAt: string;
    clerkUserId: string;
    email: string;
    displayName: string;
    avatarUrl?: string | undefined;
    bio?: string | undefined;
}, {
    role: "editor" | "owner" | "writer";
    id: string;
    createdAt: string;
    updatedAt: string;
    clerkUserId: string;
    email: string;
    displayName: string;
    avatarUrl?: string | undefined;
    bio?: string | undefined;
}>;

type AuthorRole = z.infer<typeof AuthorRoleSchema>;
type Author = z.infer<typeof AuthorSchema>;

/**
 * Lifecycle states for a Post:
 *   draft      — only authors / editors can see; never on the public site
 *   scheduled  — publish at `scheduledFor`; visible only via preview token
 *   published  — public, indexed, in feeds
 *   archived   — hidden but preserved (URL still resolvable for old links)
 */
declare const PostStatusSchema: z.ZodEnum<["draft", "scheduled", "published", "archived"]>;
/** Exhaustiveness helper. */
declare function assertNeverPostStatus(s: never): never;
/**
 * A blog post.
 *
 * `bodyJson` carries the Tiptap / ProseMirror document tree. We keep it
 * as `z.unknown()` here because the editor owns the document schema —
 * validating it inside `@coreboys/shared` would make every Tiptap
 * extension change a breaking shared release. The api validates against
 * an `editor-schema.json` it ships with the cms.
 *
 * `taggedPersonIds` is a denormalized index of people mentioned in the
 * body; the api maintains it on every save so feeds and "posts that
 * mention X" lookups are fast.
 */
declare const PostSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PostId">;
    slug: z.ZodString;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    excerpt: z.ZodOptional<z.ZodString>;
    authorId: z.ZodBranded<z.ZodString, "AuthorId">;
    coverMediaId: z.ZodOptional<z.ZodBranded<z.ZodString, "MediaId">>;
    /** Tiptap JSON document. Editor owns the inner schema. */
    bodyJson: z.ZodUnknown;
    status: z.ZodEnum<["draft", "scheduled", "published", "archived"]>;
    /** Set when status moves to `published`. */
    publishedAt: z.ZodOptional<z.ZodString>;
    /** Required when `status === "scheduled"`; undefined otherwise. */
    scheduledFor: z.ZodOptional<z.ZodString>;
    /** Person ids referenced inside the body. Denormalized; api-maintained. */
    taggedPersonIds: z.ZodDefault<z.ZodArray<z.ZodBranded<z.ZodString, "PersonId">, "many">>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string & z.BRAND<"PostId">;
    createdAt: string;
    updatedAt: string;
    authorId: string & z.BRAND<"AuthorId">;
    taggedPersonIds: (string & z.BRAND<"PersonId">)[];
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: (string & z.BRAND<"MediaId">) | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
}, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: string | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
    taggedPersonIds?: string[] | undefined;
}>, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string & z.BRAND<"PostId">;
    createdAt: string;
    updatedAt: string;
    authorId: string & z.BRAND<"AuthorId">;
    taggedPersonIds: (string & z.BRAND<"PersonId">)[];
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: (string & z.BRAND<"MediaId">) | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
}, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: string | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
    taggedPersonIds?: string[] | undefined;
}>, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string & z.BRAND<"PostId">;
    createdAt: string;
    updatedAt: string;
    authorId: string & z.BRAND<"AuthorId">;
    taggedPersonIds: (string & z.BRAND<"PersonId">)[];
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: (string & z.BRAND<"MediaId">) | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
}, {
    status: "draft" | "scheduled" | "published" | "archived";
    slug: string;
    title: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    publishedAt?: string | undefined;
    subtitle?: string | undefined;
    excerpt?: string | undefined;
    coverMediaId?: string | undefined;
    bodyJson?: unknown;
    scheduledFor?: string | undefined;
    taggedPersonIds?: string[] | undefined;
}>;

type PostStatus = z.infer<typeof PostStatusSchema>;
type Post = z.infer<typeof PostSchema>;

/**
 * Image vs video. Audio + GIF are deliberately not in scope here — when
 * we add them, extend this enum + the corresponding face-detection
 * pipeline branch.
 */
declare const MediaKindSchema: z.ZodEnum<["image", "video"]>;
/** Exhaustiveness helper for `switch (kind)` blocks over `MediaKind`. */
declare function assertNeverMediaKind(k: never): never;
/**
 * Where in the face-detection pipeline a Media row currently sits.
 *
 *   pending    — uploaded, not yet handed to Rekognition
 *   processing — Rekognition job in flight
 *   complete   — face boxes written; ready to render
 *   skipped    — kind/size unsupported, or upload was a non-photo
 *   failed     — Rekognition errored; `faceDetectionError` carries the message
 */
declare const FaceDetectionStatusSchema: z.ZodEnum<["pending", "processing", "complete", "skipped", "failed"]>;
/**
 * Normalized bounding box for a face detected on a Media item. Coordinates
 * are 0–1 fractions of the image dimensions so the renderer doesn't need
 * to know the source resolution to position the overlay.
 */
declare const BoundingBoxSchema: z.ZodObject<{
    left: z.ZodNumber;
    top: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    left: number;
    top: number;
    width: number;
    height: number;
}, {
    left: number;
    top: number;
    width: number;
    height: number;
}>;
/**
 * Media row. Every image and video uploaded by an admin lives here —
 * cover images, in-article images, gallery uploads. De-duped by
 * `contentHash` (SHA-256 of the source bytes). The `url` is the public
 * R2 URL; `s3Mirror` is the `s3://bucket/key` Rekognition reads from
 * (Rekognition specifically requires real S3, not R2's S3-compatible
 * surface — we dual-write).
 */
declare const MediaSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "MediaId">;
    kind: z.ZodEnum<["image", "video"]>;
    contentHash: z.ZodString;
    url: z.ZodString;
    s3Mirror: z.ZodOptional<z.ZodString>;
    contentType: z.ZodString;
    bytes: z.ZodNumber;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
    /** Video only. Null/undefined for images. */
    durationSeconds: z.ZodOptional<z.ZodNumber>;
    uploadedById: z.ZodBranded<z.ZodString, "AuthorId">;
    faceDetection: z.ZodObject<{
        status: z.ZodEnum<["pending", "processing", "complete", "skipped", "failed"]>;
        attemptedAt: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "processing" | "complete" | "skipped" | "failed";
        attemptedAt?: string | undefined;
        error?: string | undefined;
    }, {
        status: "pending" | "processing" | "complete" | "skipped" | "failed";
        attemptedAt?: string | undefined;
        error?: string | undefined;
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
    id: string & z.BRAND<"MediaId">;
    kind: "video" | "image";
    createdAt: string;
    updatedAt: string;
    contentHash: string;
    contentType: string;
    bytes: number;
    uploadedById: string & z.BRAND<"AuthorId">;
    faceDetection: {
        status: "pending" | "processing" | "complete" | "skipped" | "failed";
        attemptedAt?: string | undefined;
        error?: string | undefined;
    };
    durationSeconds?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
    s3Mirror?: string | undefined;
}, {
    url: string;
    id: string;
    kind: "video" | "image";
    createdAt: string;
    updatedAt: string;
    contentHash: string;
    contentType: string;
    bytes: number;
    uploadedById: string;
    faceDetection: {
        status: "pending" | "processing" | "complete" | "skipped" | "failed";
        attemptedAt?: string | undefined;
        error?: string | undefined;
    };
    durationSeconds?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
    s3Mirror?: string | undefined;
}>;

type MediaKind = z.infer<typeof MediaKindSchema>;
type FaceDetectionStatus = z.infer<typeof FaceDetectionStatusSchema>;
type BoundingBox = z.infer<typeof BoundingBoxSchema>;
type Media = z.infer<typeof MediaSchema>;

/**
 * Two ways a FaceTag can be created:
 *
 *   auto   — Rekognition `SearchFacesByImage` matched a face above
 *            our confidence threshold against the indexed collection.
 *            `confidence` carries the match score (0–1).
 *
 *   manual — An admin clicked the face in the cms tagger and picked a
 *            person. `confidence` is undefined for manual tags.
 *            `createdById` records who tagged it.
 */
declare const FaceTagSourceSchema: z.ZodEnum<["auto", "manual"]>;
/** Exhaustiveness helper. */
declare function assertNeverFaceTagSource(s: never): never;
/**
 * A single face → person link on a piece of media.
 *
 * Time fields (`startTimeSeconds` / `endTimeSeconds`) are video-only.
 * For images, both are undefined. For Phase B video face tracking, an
 * appearance gets one FaceTag row per contiguous interval the face is
 * on screen — short enough that a hover-tooltip frame can lock to it.
 */
declare const FaceTagSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "FaceTagId">;
    mediaId: z.ZodBranded<z.ZodString, "MediaId">;
    personId: z.ZodBranded<z.ZodString, "PersonId">;
    source: z.ZodEnum<["auto", "manual"]>;
    /** 0–1 match score from Rekognition. Undefined for manual tags. */
    confidence: z.ZodOptional<z.ZodNumber>;
    boundingBox: z.ZodObject<{
        left: z.ZodNumber;
        top: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        left: number;
        top: number;
        width: number;
        height: number;
    }, {
        left: number;
        top: number;
        width: number;
        height: number;
    }>;
    /** Video tag interval start, seconds. Undefined for images. */
    startTimeSeconds: z.ZodOptional<z.ZodNumber>;
    /** Video tag interval end, seconds. Undefined for images. */
    endTimeSeconds: z.ZodOptional<z.ZodNumber>;
    /**
     * Author who created the tag. Required for `source: "manual"`,
     * undefined for `source: "auto"` (no human in the loop).
     */
    createdById: z.ZodOptional<z.ZodBranded<z.ZodString, "AuthorId">>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string & z.BRAND<"FaceTagId">;
    createdAt: string;
    mediaId: string & z.BRAND<"MediaId">;
    personId: string & z.BRAND<"PersonId">;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: (string & z.BRAND<"AuthorId">) | undefined;
}, {
    id: string;
    createdAt: string;
    mediaId: string;
    personId: string;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: string | undefined;
}>, {
    id: string & z.BRAND<"FaceTagId">;
    createdAt: string;
    mediaId: string & z.BRAND<"MediaId">;
    personId: string & z.BRAND<"PersonId">;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: (string & z.BRAND<"AuthorId">) | undefined;
}, {
    id: string;
    createdAt: string;
    mediaId: string;
    personId: string;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: string | undefined;
}>, {
    id: string & z.BRAND<"FaceTagId">;
    createdAt: string;
    mediaId: string & z.BRAND<"MediaId">;
    personId: string & z.BRAND<"PersonId">;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: (string & z.BRAND<"AuthorId">) | undefined;
}, {
    id: string;
    createdAt: string;
    mediaId: string;
    personId: string;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: string | undefined;
}>, {
    id: string & z.BRAND<"FaceTagId">;
    createdAt: string;
    mediaId: string & z.BRAND<"MediaId">;
    personId: string & z.BRAND<"PersonId">;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: (string & z.BRAND<"AuthorId">) | undefined;
}, {
    id: string;
    createdAt: string;
    mediaId: string;
    personId: string;
    source: "auto" | "manual";
    boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    confidence?: number | undefined;
    startTimeSeconds?: number | undefined;
    endTimeSeconds?: number | undefined;
    createdById?: string | undefined;
}>;

type FaceTagSource = z.infer<typeof FaceTagSourceSchema>;
type FaceTag = z.infer<typeof FaceTagSchema>;

/**
 * Flat display shape consumed by the public-site renderer. Produced from
 * a `Person` via {@link toTalentTag} so the renderer never branches on
 * `kind` itself — it just renders a name, an avatar, an href, and an
 * optional role + socials.
 *
 * The `href` resolution per kind:
 *   - member   → `/m/<slug>`
 *   - crew     → `/m/<crewSlug-or-first-worksWith>` (today crew has no
 *                standalone page; href falls back to "#" when no
 *                resolution rule applies)
 *   - external → first social URL, or "#" if no socials
 */
declare const TalentTagSchema: z.ZodObject<{
    id: z.ZodBranded<z.ZodString, "PersonId">;
    kind: z.ZodEnum<["member", "crew", "external"]>;
    name: z.ZodString;
    href: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["cameraman", "management", "editor", "producer"]>>;
    socials: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        platform: z.ZodEnum<["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"]>;
        url: z.ZodString;
        handle: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }, {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    socials: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[];
    id: string & z.BRAND<"PersonId">;
    kind: "member" | "crew" | "external";
    href: string;
    role?: "cameraman" | "management" | "editor" | "producer" | undefined;
    avatarUrl?: string | undefined;
}, {
    name: string;
    id: string;
    kind: "member" | "crew" | "external";
    href: string;
    socials?: {
        platform: "youtube" | "tiktok" | "instagram" | "twitch" | "x" | "snapchat" | "wikipedia";
        url: string;
        handle?: string | undefined;
        label?: string | undefined;
    }[] | undefined;
    role?: "cameraman" | "management" | "editor" | "producer" | undefined;
    avatarUrl?: string | undefined;
}>;

/**
 * Flat display shape consumed by the public-site talent-tag renderer.
 * Produce one from a `Person` via `toTalentTag(person)`.
 */
type TalentTag = z.infer<typeof TalentTagSchema>;

declare const MEMBERS: readonly Member[];
declare const MEMBERS_BY_SLUG: Readonly<Record<string, Member>>;

declare const CREW: readonly CrewMember[];
declare const CREW_BY_SLUG: Readonly<Record<string, CrewMember>>;

/**
 * Project a {@link Person} into the flat {@link TalentTag} display shape
 * the public-site renderer consumes. Exhaustive over `PersonKind` —
 * adding a new kind to the union turns this into a compile error until
 * the new branch lands.
 *
 * `href` resolution per kind:
 *
 *   - `member`   → `/m/<slug>` (the marketing-site member page)
 *   - `crew`     → `#` (no standalone crew page today; the cms can add
 *                  a `crewSlug → memberSlug` mapping later, at which point
 *                  this resolves to `/m/<memberSlug>`)
 *   - `external` → first social URL, or `#` when the person has no socials
 *
 * `avatarUrl` falls through to the embedded data when present; member
 * variants use `member.portraitUrl`, crew variants use `crew.avatarUrl`,
 * external variants use `external.avatarUrl`.
 */
declare function toTalentTag(person: Person): TalentTag;

declare const PLATFORMS: readonly ["youtube", "tiktok", "instagram", "twitch", "x", "snapchat", "wikipedia"];
declare const GROUP_NAME: "The Core Boys";
declare const GROUP_TAGLINE: "Create Own Run Everything";
declare const GROUP_SOCIALS: readonly Social[];
declare const MEMBER_SLUGS: readonly string[];

export { type Accent, AccentSchema, type AuditEventId, AuditEventIdSchema, type Author, type AuthorId, AuthorIdSchema, type AuthorRole, AuthorRoleSchema, AuthorSchema, type BoundingBox, BoundingBoxSchema, CREW, CREW_BY_SLUG, type ContentId, ContentIdSchema, type ContentItem, ContentItemSchema, type ContentKind, ContentKindSchema, type CrewMember, type CrewMemberId, CrewMemberIdSchema, CrewMemberSchema, type CrewPerson, type CrewPersonData, CrewPersonDataSchema, CrewPersonSchema, type CrewRole, CrewRoleSchema, type ExternalPerson, type ExternalPersonData, ExternalPersonDataSchema, ExternalPersonSchema, type FaceDetectionStatus, FaceDetectionStatusSchema, type FaceTag, type FaceTagId, FaceTagIdSchema, FaceTagSchema, type FaceTagSource, FaceTagSourceSchema, GROUP_NAME, GROUP_SOCIALS, GROUP_TAGLINE, IsoDateSchema, type LiveEntry, LiveEntrySchema, type LiveResponse, LiveResponseSchema, type LiveSnapshotId, LiveSnapshotIdSchema, MEMBERS, MEMBERS_BY_SLUG, MEMBER_SLUGS, type Media, type MediaId, MediaIdSchema, type MediaKind, MediaKindSchema, MediaSchema, type Member, type MemberId, MemberIdSchema, type MemberPerson, type MemberPersonData, MemberPersonDataSchema, MemberPersonSchema, MemberSchema, PLATFORMS, type Person, type PersonId, PersonIdSchema, type PersonKind, PersonKindSchema, PersonSchema, type Platform, PlatformSchema, type Post, type PostId, PostIdSchema, PostSchema, type PostStatus, PostStatusSchema, SlugSchema, type Social, type SocialId, SocialIdSchema, SocialSchema, type TalentTag, TalentTagSchema, assertNeverAuthorRole, assertNeverContentKind, assertNeverCrewRole, assertNeverFaceTagSource, assertNeverMediaKind, assertNeverPersonKind, assertNeverPlatform, assertNeverPostStatus, isUrlForPlatform, toTalentTag };

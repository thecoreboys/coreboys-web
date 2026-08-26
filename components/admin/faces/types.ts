import { z } from "zod";

export type FaceSocialLink = {
  platform: string;
  url: string;
  handle?: string;
  label?: string;
};

export type FaceCanonicalPerson = {
  key: string;
  kind: "member" | "crew";
  slug: string;
  displayName: string;
  secondaryLabel: string;
  portraitUrl: string | null;
  profileHref: string;
  socials: FaceSocialLink[];
};

export type FaceConsentPurpose = {
  templateCreation: boolean;
  liveMatching: boolean;
  archiveMatching: boolean;
  publicTagging: boolean;
  socialLinking: boolean;
};

export type FaceConsent = FaceConsentPurpose & {
  status: "active" | "expired" | "revoked" | "missing";
  adultConfirmed: boolean;
  subjectConfirmedAt: string | null;
  confirmationMethod: "signed_release" | "subject_portal" | null;
  evidenceReference: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  approvedContentIds: string[];
  approvedArchiveScopes: Array<{ contentId: string; startMs: number; endMs: number }>;
};

export type FaceReference = {
  id: string;
  fileName: string;
  sourceKind: "subject_provided" | "creator_session" | "licensed_archive";
  capturedAt: string | null;
  createdAt: string;
  status: "pending_review" | "accepted" | "rejected" | "deletion_pending" | "deleted";
  subjectApproved: boolean;
  qualityIssues: string[];
  previewUrl: string | null;
  uploadedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export type FaceIdentity = {
  id: string;
  canonicalKey: string;
  displayName: string;
  templateCount: number;
  enrollmentStatus: "not_enrolled" | "pending" | "ready" | "suspended" | "revoked";
  consent: FaceConsent;
  references: FaceReference[];
  updatedAt: string;
};

export type FaceSource = {
  id: string;
  name: string;
  contentId: string;
  kind: "live" | "archive";
  provider: string;
  status: "idle" | "connecting" | "running" | "stopped" | "error";
  mode: "manual_only" | "review_only" | "automatic";
  recognitionEnabled: boolean;
  allVisiblePeopleConsented: boolean;
  killSwitchActive: boolean;
  allowedIdentityIds: string[];
  activeSessionId: string | null;
  lastFrameAt: string | null;
  errorMessage: string | null;
};

export type FaceJob = {
  id: string;
  sourceId: string;
  sourceName: string;
  kind: "live_session" | "archive_scan" | "reference_processing";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progressPercent: number | null;
  startedAt: string | null;
  updatedAt: string;
  errorMessage: string | null;
};

export type FaceCandidate = {
  identityId: string;
  displayName: string;
  score: number;
};

export type FaceReview = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceKind: "live" | "archive";
  occurredAt: string;
  thumbnailUrl: string | null;
  candidates: FaceCandidate[];
  assignedIdentityId: string | null;
  status: "pending" | "assigned" | "unknown" | "approved" | "rejected" | "published";
  publishedPresenceId: string | null;
  reviewerNote: string | null;
  matchMethod: "manual" | "automatic";
  contentId: string;
  startMs: number;
  endMs: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  reviewHref: string | null;
};

export type FacePublishedPresence = {
  id: string;
  identityId: string;
  displayName: string;
  canonicalKey: string;
  sourceName: string;
  startedAt: string;
  endedAt: string | null;
  public: boolean;
  profileHref: string;
  socialLinks: FaceSocialLink[];
};

export type FaceAuditEntry = {
  id: string;
  action: string;
  actorName: string;
  targetLabel: string;
  reason: string | null;
  createdAt: string;
};

export type FaceAdminOverview = {
  apiVersion: string;
  service: {
    status: "ready" | "degraded" | "offline";
    message: string | null;
    analyzerVersion: string | null;
    lastHeartbeatAt: string | null;
  };
  counts: {
    consentedAdults: number;
    enrolled: number;
    pendingReview: number;
    activeSources: number;
    published: number;
  };
  identities: FaceIdentity[];
  sources: FaceSource[];
  jobs: FaceJob[];
  reviews: FaceReview[];
  published: FacePublishedPresence[];
  audit: FaceAuditEntry[];
};

export const EMPTY_FACE_OVERVIEW: FaceAdminOverview = {
  apiVersion: "unavailable",
  service: {
    status: "offline",
    message: null,
    analyzerVersion: null,
    lastHeartbeatAt: null,
  },
  counts: {
    consentedAdults: 0,
    enrolled: 0,
    pendingReview: 0,
    activeSources: 0,
    published: 0,
  },
  identities: [],
  sources: [],
  jobs: [],
  reviews: [],
  published: [],
  audit: [],
};

const NullableString = z.string().nullable();
const SocialLinkSchema = z.object({
  platform: z.string(),
  url: z.string().url().refine((value) => value.startsWith("https://")),
  handle: z.string().optional(),
  label: z.string().optional(),
});
const ConsentSchema = z.object({
  status: z.enum(["active", "expired", "revoked", "missing"]),
  adultConfirmed: z.boolean(),
  subjectConfirmedAt: NullableString,
  confirmationMethod: z.enum(["signed_release", "subject_portal"]).nullable(),
  evidenceReference: NullableString,
  expiresAt: NullableString,
  revokedAt: NullableString,
  templateCreation: z.boolean(),
  liveMatching: z.boolean(),
  archiveMatching: z.boolean(),
  publicTagging: z.boolean(),
  socialLinking: z.boolean(),
  approvedContentIds: z.array(z.string().min(1).max(300)).max(100),
  approvedArchiveScopes: z.array(z.object({
    contentId: z.string().min(1).max(300),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })).max(100),
});
const ReferenceSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  sourceKind: z.enum(["subject_provided", "creator_session", "licensed_archive"]),
  capturedAt: NullableString,
  createdAt: z.string(),
  status: z.enum(["pending_review", "accepted", "rejected", "deletion_pending", "deleted"]),
  subjectApproved: z.boolean(),
  qualityIssues: z.array(z.string()),
  previewUrl: z.string().regex(/^\/api\/admin\/faces\/identities\/[0-9a-f-]+\/references\/[0-9a-f-]+\/image$/).nullable(),
  uploadedBy: z.string(),
  reviewedBy: NullableString,
  reviewNote: NullableString,
});
const IdentitySchema = z.object({
  id: z.string().uuid(),
  canonicalKey: z.string().regex(/^(member|crew):[a-z0-9][a-z0-9-]{0,79}$/),
  displayName: z.string(),
  templateCount: z.number().int().nonnegative(),
  enrollmentStatus: z.enum(["not_enrolled", "pending", "ready", "suspended", "revoked"]),
  consent: ConsentSchema,
  references: z.array(ReferenceSchema),
  updatedAt: z.string(),
});
const SourceSchema = z.object({
  id: z.string().uuid(), contentId: z.string().min(1).max(300), name: z.string(),
  kind: z.enum(["live", "archive"]), provider: z.string(),
  status: z.enum(["idle", "connecting", "running", "stopped", "error"]),
  mode: z.enum(["manual_only", "review_only", "automatic"]),
  recognitionEnabled: z.boolean(), allVisiblePeopleConsented: z.boolean(),
  killSwitchActive: z.boolean(), allowedIdentityIds: z.array(z.string().uuid()),
  activeSessionId: NullableString, lastFrameAt: NullableString, errorMessage: NullableString,
});
const JobSchema = z.object({
  id: z.string().uuid(), sourceId: z.string().uuid(), sourceName: z.string(),
  kind: z.enum(["live_session", "archive_scan", "reference_processing"]),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  progressPercent: z.number().nullable(), startedAt: NullableString,
  updatedAt: z.string(), errorMessage: NullableString,
});
const ReviewHref = z.string().url().refine((value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "www.youtube.com" || host === "www.twitch.tv" || host === "clips.twitch.tv";
  } catch {
    return false;
  }
}).nullable();
const ReviewSchema = z.object({
  id: z.string().uuid(), sourceId: z.string().uuid(), sourceName: z.string(), sourceKind: z.enum(["live", "archive"]),
  occurredAt: z.string(), thumbnailUrl: z.null(),
  candidates: z.array(z.object({ identityId: z.string().uuid(), displayName: z.string(), score: z.number() })),
  assignedIdentityId: z.string().uuid().nullable(),
  status: z.enum(["pending", "assigned", "unknown", "approved", "rejected", "published"]),
  publishedPresenceId: z.string().uuid().nullable(), reviewerNote: NullableString,
  matchMethod: z.enum(["manual", "automatic"]),
  contentId: z.string().min(1).max(300), startMs: z.number().nonnegative(), endMs: z.number().nonnegative().nullable(),
  bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
  reviewHref: ReviewHref,
});
const PublishedSchema = z.object({
  id: z.string().uuid(), identityId: z.string().uuid(), displayName: z.string(),
  canonicalKey: z.string(), sourceName: z.string(), startedAt: z.string(), endedAt: NullableString,
  public: z.boolean(), profileHref: z.string().regex(/^\/(m|crew)\/[a-z0-9-]+$/),
  socialLinks: z.array(SocialLinkSchema),
});
const AuditSchema = z.object({
  id: z.string(), action: z.string(), actorName: z.string(), targetLabel: z.string(),
  reason: NullableString, createdAt: z.string(),
});
const FaceAdminOverviewSchema = z.object({
  apiVersion: z.string(),
  service: z.object({
    status: z.enum(["ready", "degraded", "offline"]), message: NullableString,
    analyzerVersion: NullableString, lastHeartbeatAt: NullableString,
  }),
  counts: z.object({
    consentedAdults: z.number().nonnegative(), enrolled: z.number().nonnegative(),
    pendingReview: z.number().nonnegative(), activeSources: z.number().nonnegative(),
    published: z.number().nonnegative(),
  }),
  identities: z.array(IdentitySchema), sources: z.array(SourceSchema), jobs: z.array(JobSchema),
  reviews: z.array(ReviewSchema), published: z.array(PublishedSchema), audit: z.array(AuditSchema),
});

/**
 * The control room deliberately treats malformed or partial responses as empty.
 * It never fabricates enrollment state from local portraits or environment keys.
 */
export function normalizeFaceOverview(value: unknown): FaceAdminOverview {
  return parseFaceOverview(value).overview;
}

export function parseFaceOverview(value: unknown): { ok: true; overview: FaceAdminOverview } | { ok: false; overview: FaceAdminOverview } {
  const envelope = isRecord(value) && isRecord(value.overview) ? value.overview : value;
  const parsed = FaceAdminOverviewSchema.safeParse(envelope);
  return parsed.success
    ? { ok: true, overview: parsed.data }
    : { ok: false, overview: EMPTY_FACE_OVERVIEW };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { z } from "zod";
import {
  faceConsentPermissionsAreCoherent,
  faceSourceConfigurationIsSafe,
} from "./face-recognition-policy";

const Uuid = z.string().uuid();
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateTime = z.string().datetime({ offset: true });
const ShortReason = z.string().trim().min(3).max(500);
export const FaceSafeIngestLocatorRefSchema = z.string().trim().max(500)
  .regex(/^(env|secret|mediamtx|file-ref):[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(
    (value) => !/(^|[:/])\.{1,2}(\/|$)/.test(value),
    "Locator references cannot contain dot or parent-directory path segments.",
  );
export const FaceWatchContentIdSchema = z.string().trim().min(1).max(300).refine(
  (value) => value !== "*" && !value.includes("://") && !/[\u0000-\u0020\u007f]/.test(value),
  "Use an exact canonical Watch content ID, not a URL, wildcard, or free-form label.",
);
const ApprovedContentIds = z.array(
  FaceWatchContentIdSchema,
).max(100).transform((values) => [...new Set(values)]);
const FaceArchiveConsentScopeSchema = z.object({
  contentId: FaceWatchContentIdSchema,
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
}).strict().refine((scope) => scope.endMs > scope.startMs, "Archive scope endMs must follow startMs.");

export const FaceConsentPermissionsSchema = z.object({
  allowTemplateCreation: z.boolean(),
  allowLiveMatching: z.boolean(),
  allowArchiveMatching: z.boolean(),
  allowPublicTag: z.boolean(),
  allowProfileLinks: z.boolean(),
}).strict().refine(faceConsentPermissionsAreCoherent, "Consent permissions are inconsistent.");

export const FaceConsentGrantSchema = z.object({
  consentVersion: z.string().trim().min(1).max(80),
  captureMethod: z.enum([
    "signed_release",
    "subject_portal",
  ]),
  evidenceRef: z.string().trim().min(3).max(500),
  consentTextSha256: Sha256,
  subjectConfirmedAdult: z.literal(true),
  adultVerifiedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  permissions: FaceConsentPermissionsSchema,
  approvedContentIds: ApprovedContentIds,
  approvedArchiveScopes: z.array(FaceArchiveConsentScopeSchema).max(100),
}).strict().superRefine((input, context) => {
  if (input.permissions.allowLiveMatching) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permissions", "allowLiveMatching"],
      message: "Live matching is outside the archive-only v1 launch scope.",
    });
  }
  if (
    (input.permissions.allowArchiveMatching
      || input.permissions.allowPublicTag)
    && input.approvedArchiveScopes.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approvedContentIds"],
      message: "Archive matching and public tags require at least one bounded Watch interval.",
    });
  }
  const scopedIds = [...new Set(input.approvedArchiveScopes.map((scope) => scope.contentId))].sort();
  const approvedIds = [...input.approvedContentIds].sort();
  if (JSON.stringify(scopedIds) !== JSON.stringify(approvedIds)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approvedContentIds"],
      message: "Approved content IDs must exactly match the bounded archive scopes.",
    });
  }
});

export const FaceIdentityCreateSchema = z.object({
  canonicalKind: z.enum(["member", "crew"]),
  canonicalSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  consent: FaceConsentGrantSchema,
}).strict();

export const FaceIdentityActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant_consent"), consent: FaceConsentGrantSchema }).strict(),
  z.object({ action: z.literal("revoke_consent"), reason: ShortReason }).strict(),
  z.object({ action: z.literal("archive_identity"), reason: ShortReason }).strict(),
  z.object({ action: z.literal("revoke_identity"), reason: ShortReason }).strict(),
]);

export const FaceReferenceCreateSchema = z.object({
  identityId: Uuid,
  sourceKind: z.enum(["subject_provided", "creator_session", "licensed_archive"]),
  subjectApproved: z.literal(true),
  capturedAt: IsoDateTime.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict();

export const FaceReferenceActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({ action: z.literal("reject"), reason: ShortReason }).strict(),
]);

export const FaceSourceCreateSchema = z.object({
  contentId: FaceWatchContentIdSchema,
  displayName: z.string().trim().min(1).max(160),
  provider: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  sourceKind: z.enum(["live", "archive"]),
  ingestLocatorRef: FaceSafeIngestLocatorRefSchema.nullable().optional(),
  state: z.enum(["disabled", "active"]).default("disabled"),
  allVisiblePeopleConsented: z.boolean().default(false),
  automaticMatchingEnabled: z.boolean().default(false),
  allowedIdentityIds: z.array(Uuid).max(100).default([]),
}).strict().refine(
  (input) => faceSourceConfigurationIsSafe({
    automaticMatchingEnabled: input.automaticMatchingEnabled,
    allVisiblePeopleConsented: input.allVisiblePeopleConsented,
    allowedIdentityCount: new Set(input.allowedIdentityIds).size,
  }),
  "Automatic matching requires an explicitly consented, non-empty allowlist.",
).refine(
  (input) => input.sourceKind !== "live" || !input.automaticMatchingEnabled,
  "Live matching is disabled for the archive-only v1 launch.",
);

export const FaceSourceActionSchema = z.union([
  z.object({
    action: z.literal("configure"),
    state: z.enum(["disabled", "active"]),
    allVisiblePeopleConsented: z.boolean(),
    automaticMatchingEnabled: z.boolean(),
    allowedIdentityIds: z.array(Uuid).max(100),
  }).strict().refine(
    (input) => faceSourceConfigurationIsSafe({
      automaticMatchingEnabled: input.automaticMatchingEnabled,
      allVisiblePeopleConsented: input.allVisiblePeopleConsented,
      allowedIdentityCount: new Set(input.allowedIdentityIds).size,
    }),
    "Automatic matching requires an explicitly consented, non-empty allowlist.",
  ),
  z.object({ action: z.literal("start_live") }).strict(),
  z.object({ action: z.literal("end_live") }).strict(),
  z.object({ action: z.literal("disable") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
]);

export const FaceJobCreateSchema = z.object({
  sourceId: Uuid,
  kind: z.enum(["live_scan", "archive_scan", "manual_review"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  configuration: z.object({
    samplingFps: z.number().positive().max(5).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().positive().optional(),
  }).strict().default({}),
}).strict().refine(
  (input) => input.configuration.endMs == null
    || input.configuration.startMs == null
    || input.configuration.endMs > input.configuration.startMs,
  "Job endMs must be after startMs.",
).refine(
  (input) => input.kind !== "live_scan",
  "Live scan jobs are disabled for the archive-only v1 launch.",
).refine(
  (input) => input.configuration.startMs != null && input.configuration.endMs != null,
  "Every v1 job requires a bounded startMs and endMs.",
);

export const FaceJobActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: ShortReason }).strict(),
  z.object({ action: z.literal("retry") }).strict(),
]);

const FaceBoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).strict().refine(
  (box) => box.x + box.width <= 1.0001 && box.y + box.height <= 1.0001,
  "Bounding box must fit inside the normalized frame.",
);

export const FaceTrackCreateSchema = z.object({
  sourceId: Uuid,
  jobId: Uuid.nullable().optional(),
  identityId: Uuid.nullable().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive().nullable().optional(),
  bbox: FaceBoundingBoxSchema.nullable().optional(),
}).strict().refine(
  (input) => input.endMs == null || input.endMs > input.startMs,
  "Track endMs must be after startMs.",
);

export const FaceTrackActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    identityId: Uuid,
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal("unknown"),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal("approve"),
    identityId: Uuid.optional(),
    sourceMomentVerified: z.literal(true),
    confidenceBand: z.enum(["reviewed", "high"]).default("reviewed"),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({ action: z.literal("reject"), reason: ShortReason }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("withdraw"), reason: ShortReason }).strict(),
]);

export const FaceUuidParamSchema = z.object({ id: Uuid }).strict();

export type FaceConsentGrantInput = z.infer<typeof FaceConsentGrantSchema>;
export type FaceIdentityCreateInput = z.infer<typeof FaceIdentityCreateSchema>;
export type FaceIdentityActionInput = z.infer<typeof FaceIdentityActionSchema>;
export type FaceReferenceCreateInput = z.infer<typeof FaceReferenceCreateSchema>;
export type FaceReferenceActionInput = z.infer<typeof FaceReferenceActionSchema>;
export type FaceSourceCreateInput = z.infer<typeof FaceSourceCreateSchema>;
export type FaceSourceActionInput = z.infer<typeof FaceSourceActionSchema>;
export type FaceJobCreateInput = z.infer<typeof FaceJobCreateSchema>;
export type FaceJobActionInput = z.infer<typeof FaceJobActionSchema>;
export type FaceTrackCreateInput = z.infer<typeof FaceTrackCreateSchema>;
export type FaceTrackActionInput = z.infer<typeof FaceTrackActionSchema>;

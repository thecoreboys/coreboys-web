import "server-only";

import type { PoolClient } from "pg";
import { CREW, MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { faceGuestPerson, FaceGuestProfileSchema, FaceProfileResearchSchema, type FaceCanonicalKind, type FaceCanonicalPerson, type FaceGuestProfile, type FaceGuestRecord, type FaceProfileReviewInput } from "@/lib/face-people";
import type { z } from "zod";
import { FacePhotoCandidateSchema } from "@/lib/face-photo-candidates";
import { contentFingerprint } from "@/lib/media-intelligence/fingerprint";
import { FACE_DEFAULT_SAMPLING_FPS, FACE_PROCESSING_VERSION, FACE_ENROLLMENT_MODEL_VERSION } from "@/lib/face-processing-costs";
import { faceWorkerWakeConfigured } from "@/lib/face-worker-wake";
import type { BrowserVideoReviewInput } from "@/lib/browser-video-review";
import assetManifest from "@/lib/asset-manifest.json";
import { query, withTransaction } from "@/lib/db";
import type { StaffIdentity } from "@/lib/staff-policy";
import type {
  FaceConsentGrantInput,
  FaceIdentityActionInput,
  FaceIdentityCreateInput,
  FaceJobActionInput,
  FaceJobCreateInput,
  FaceReferenceActionInput,
  FaceReferenceCreateInput,
  FaceSourceActionInput,
  FaceSourceCreateInput,
  FaceTrackActionInput,
  FaceTrackCreateInput,
} from "@/lib/face-recognition-contracts";
import {
  FACE_LIVE_FRESHNESS_SECONDS,
  FACE_REFERENCE_APPROVED_RETENTION_MS,
  FACE_REFERENCE_PENDING_REVIEW_MS,
  faceAutomaticMatchingIsEnabled,
  faceConsentTermIsSafe,
  facePresencePublicIsEnabled,
  faceSourceConfigurationIsSafe,
} from "@/lib/face-recognition-policy";
import type {
  PublicFacePresenceResponse,
  PublicFacePresenceTag,
  PublicFaceSocialLink,
} from "@/lib/face-presence-public";

export type FaceMutationContext = {
  actor: Pick<StaffIdentity, "id" | "email"> | { id: string; email: string | null };
  actorType?: "staff" | "system";
  requestId: string;
};

export type FaceStoreErrorCode =
  | "conflict"
  | "consent_required"
  | "invalid_state"
  | "not_found";

export class FaceStoreError extends Error {
  constructor(
    public readonly code: FaceStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FaceStoreError";
  }
}

type Db = Pick<PoolClient, "query">;

type ConsentRow = {
  id: string;
  identity_id: string;
  expires_at: string;
  revoked_at: string | null;
  allow_template_creation: boolean;
  allow_live_matching: boolean;
  allow_archive_matching: boolean;
  allow_public_tag: boolean;
  allow_profile_links: boolean;
  approved_content_ids: string[];
  granted_by: string;
};

type IdentityDbRow = {
  id: string;
  canonical_kind: FaceCanonicalKind;
  canonical_slug: string;
  display_name: string;
  state: "draft" | "active" | "archived" | "revoked";
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  consent_id: string | null;
  consent_version: string | null;
  capture_method: string | null;
  evidence_ref: string | null;
  subject_confirmed_adult: boolean | null;
  adult_verified_at: string | null;
  granted_at: string | null;
  expires_at: string | null;
  consent_revoked_at: string | null;
  allow_template_creation: boolean | null;
  allow_live_matching: boolean | null;
  allow_archive_matching: boolean | null;
  allow_public_tag: boolean | null;
  allow_profile_links: boolean | null;
  approved_content_ids: string[] | null;
  approved_archive_scopes: Array<{ contentId: string; startMs: number; endMs: number }> | null;
  reference_count: number;
  template_set_count: number;
  source_count: number;
};

function publicConsentSummary(row: ConsentRow | null) {
  return row
    ? {
        id: row.id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        permissions: {
          allowTemplateCreation: row.allow_template_creation,
          allowLiveMatching: row.allow_live_matching,
          allowArchiveMatching: row.allow_archive_matching,
          allowPublicTag: row.allow_public_tag,
          allowProfileLinks: row.allow_profile_links,
        },
        approvedContentIds: row.approved_content_ids,
      }
    : null;
}

function identityResponse(row: IdentityDbRow) {
  return {
    id: row.id,
    canonicalKind: row.canonical_kind,
    canonicalSlug: row.canonical_slug,
    displayName: row.display_name,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    currentConsent: row.consent_id
      ? {
          id: row.consent_id,
          consentVersion: row.consent_version,
          captureMethod: row.capture_method,
          evidenceReference: row.evidence_ref,
          subjectConfirmedAdult: Boolean(row.subject_confirmed_adult),
          adultVerifiedAt: row.adult_verified_at,
          grantedAt: row.granted_at,
          expiresAt: row.expires_at,
          revokedAt: row.consent_revoked_at,
          approvedContentIds: row.approved_content_ids ?? [],
          approvedArchiveScopes: row.approved_archive_scopes ?? [],
          permissions: {
            allowTemplateCreation: Boolean(row.allow_template_creation),
            allowLiveMatching: Boolean(row.allow_live_matching),
            allowArchiveMatching: Boolean(row.allow_archive_matching),
            allowPublicTag: Boolean(row.allow_public_tag),
            allowProfileLinks: Boolean(row.allow_profile_links),
          },
        }
      : null,
    counts: {
      references: Number(row.reference_count),
      templates: Number(row.template_set_count),
      sources: Number(row.source_count),
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

async function audit(
  db: Db,
  context: FaceMutationContext,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    identityId?: string | null;
    sourceId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO face_audit_log
       (actor_type, actor_id, actor_email, action, target_type, target_id,
        identity_id, source_id, before_state, after_state, request_id)
     VALUES ($11,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,
    [
      context.actor.id,
      context.actor.email,
      input.action,
      input.targetType,
      input.targetId,
      input.identityId ?? null,
      input.sourceId ?? null,
      input.before == null ? null : JSON.stringify(input.before),
      input.after == null ? null : JSON.stringify(input.after),
      context.requestId,
      context.actorType ?? "staff",
    ],
  );
}

function canonicalProfile(kind: FaceCanonicalKind, slug: string, guests: FaceGuestRecord[] = []) {
  if (kind === "guest") {
    const guest = guests.find((person) => person.slug === slug);
    if (!guest || guest.review && guest.review.status !== "approved") return null;
    const person = faceGuestPerson(guest);
    return {
      displayName: person.displayName,
      profileHref: person.profileHref,
      avatarUrl: person.portraitUrl ?? undefined,
      socialLinks: person.socials,
    };
  }
  if (kind === "member") {
    const member = MEMBERS_BY_SLUG[slug];
    if (!member) return null;
    return {
      displayName: member.stageName,
      profileHref: `/m/${member.slug}`,
      avatarUrl: member.portrait,
      socialLinks: member.socials,
    };
  }
  const crew = CREW.find((person) => person.slug === slug);
  if (!crew) return null;
  const crewManifest = (assetManifest as { crew?: Record<string, string[]> }).crew;
  return {
    displayName: crew.name,
    profileHref: `/crew/${crew.slug}`,
    avatarUrl: crewManifest?.[crew.slug]?.[0],
    socialLinks: crew.socials,
  };
}

type GuestProfileRow = {
  slug: string; display_name: string; twitch_login: string | null; youtube_url: string | null;
  social_links: FaceGuestProfile["socialLinks"]; avatar_url: string | null; avatar_source_profile: string | null;
  avatar_checked_at: string | null; research: unknown; review_status: "pending" | "approved" | "needs_changes";
  reviewed_at: string | null; review_note: string | null; updated_at: string;
};
const guestProfileColumns = `slug, display_name, twitch_login, youtube_url, social_links, avatar_url, avatar_source_profile,
  avatar_checked_at::text, research, review_status, reviewed_at::text, review_note, updated_at::text`;
function guestProfileRecord(row: GuestProfileRow): FaceGuestRecord {
  return {
    ...FaceGuestProfileSchema.parse({ slug: row.slug, displayName: row.display_name, twitchLogin: row.twitch_login,
      youtubeUrl: row.youtube_url, socialLinks: row.social_links, avatarUrl: row.avatar_url ?? undefined,
      avatarSourceProfile: row.avatar_source_profile ?? undefined,
      avatarCheckedAt: row.avatar_checked_at ? new Date(row.avatar_checked_at).toISOString() : undefined }),
    review: { status: row.review_status, version: row.updated_at, reviewedAt: row.reviewed_at,
      note: row.review_note, research: row.research ? FaceProfileResearchSchema.parse(row.research) : null },
  };
}
export async function listFaceGuestProfiles(): Promise<FaceGuestRecord[]> {
  const result = await query<GuestProfileRow>(`SELECT ${guestProfileColumns} FROM face_guest_profiles ORDER BY display_name, slug`);
  return result.rows.map(guestProfileRecord);
}

function facePeople(guests: FaceGuestRecord[]): FaceCanonicalPerson[] {
  return [
    ...MEMBERS.map((member) => ({
      key: `member:${member.slug}`, kind: "member" as const, slug: member.slug,
      displayName: member.stageName, secondaryLabel: member.comm.name,
      portraitUrl: member.portrait, profileHref: `/m/${member.slug}`, socials: member.socials,
    })),
    ...CREW.map((crew) => ({
      key: `crew:${crew.slug}`, kind: "crew" as const, slug: crew.slug,
      displayName: crew.name, secondaryLabel: crew.roleLabel ?? crew.role,
      portraitUrl: canonicalProfile("crew", crew.slug)?.avatarUrl ?? null,
      profileHref: `/crew/${crew.slug}`, socials: crew.socials,
    })),
    ...guests.map(faceGuestPerson),
  ];
}

export async function saveFaceGuestProfile(input: FaceGuestProfile, mode: "create" | "update", context: FaceMutationContext) {
  if (input.twitchLogin && MEMBERS.some((member) => member.twitchLogin.toLowerCase() === input.twitchLogin)) {
    throw new FaceStoreError("conflict", "That Twitch account already belongs to a CORE member. Use their existing profile.");
  }
  try {
    return await withTransaction(async (db) => {
      // Match the identity -> profile lock order used by consent and enrollment.
      await db.query(`SELECT id FROM face_identities WHERE canonical_kind='guest' AND canonical_slug=$1 FOR UPDATE`, [input.slug]);
      const existing = await db.query(`SELECT slug, display_name, twitch_login, youtube_url FROM face_guest_profiles WHERE slug=$1 FOR UPDATE`, [input.slug]);
      if (mode === "update" && !existing.rows[0]) throw new FaceStoreError("not_found", "Guest profile was not found.");
      if (mode === "create" && existing.rows[0]) throw new FaceStoreError("conflict", "That profile ID is already used. Edit the existing profile or choose another ID.");
      const values = [input.slug, input.displayName, input.twitchLogin, input.youtubeUrl, context.actor.id, JSON.stringify(input.socialLinks),
        input.avatarUrl ?? null, input.avatarSourceProfile ?? null, input.avatarCheckedAt ?? null];
      if (mode === "create") {
        await db.query(`INSERT INTO face_guest_profiles (slug, display_name, twitch_login, youtube_url, created_by, updated_by, social_links,
          avatar_url, avatar_source_profile, avatar_checked_at) VALUES ($1,$2,$3,$4,$5,$5,$6::jsonb,$7,$8,$9)`, values);
      } else {
        await db.query(`UPDATE face_guest_profiles SET display_name=$2, twitch_login=$3, youtube_url=$4, updated_by=$5, social_links=$6::jsonb,
          avatar_url=$7, avatar_source_profile=$8, avatar_checked_at=$9,
          review_status=CASE WHEN research IS NOT NULL THEN 'pending' ELSE review_status END,
          reviewed_by=CASE WHEN research IS NOT NULL THEN NULL ELSE reviewed_by END,
          reviewed_at=CASE WHEN research IS NOT NULL THEN NULL ELSE reviewed_at END,
          review_note=CASE WHEN research IS NOT NULL THEN NULL ELSE review_note END,
          updated_at=clock_timestamp() WHERE slug=$1`, values);
        await db.query(`UPDATE face_identities SET display_name=$2, updated_at=now() WHERE canonical_kind='guest' AND canonical_slug=$1`, [input.slug, input.displayName]);
      }
      await audit(db, context, {
        action: `guest_profile.${mode === "create" ? "created" : "updated"}`,
        targetType: "face_guest_profile", targetId: input.slug,
        before: existing.rows[0] ?? null, after: input,
      });
      const saved = await db.query<GuestProfileRow>(`SELECT ${guestProfileColumns} FROM face_guest_profiles WHERE slug=$1`, [input.slug]);
      return faceGuestPerson(guestProfileRecord(saved.rows[0]!));
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new FaceStoreError("conflict", "That profile ID or Twitch account already belongs to a saved guest.");
    }
    throw error;
  }
}

export async function reviewFaceGuestProfile(slug: string, input: z.infer<typeof FaceProfileReviewInput>, context: FaceMutationContext) {
  return withTransaction(async (db) => {
    const result = await db.query<GuestProfileRow>(`SELECT ${guestProfileColumns} FROM face_guest_profiles WHERE slug=$1 FOR UPDATE`, [slug]);
    const row = result.rows[0];
    if (!row) throw new FaceStoreError("not_found", "Guest profile was not found.");
    if (row.updated_at !== input.version) throw new FaceStoreError("conflict", "This profile changed. Reload and review its latest details.");
    const record = guestProfileRecord(row);
    if (input.decision === "approved" && !faceGuestPerson(record).socials.length) {
      throw new FaceStoreError("conflict", "Add at least one confirmed social profile before approval.");
    }
    await db.query(`UPDATE face_guest_profiles SET review_status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4,
      updated_by=$3, updated_at=clock_timestamp() WHERE slug=$1`, [slug, input.decision, context.actor.id, input.note]);
    await audit(db, context, { action: `guest_profile.${input.decision}`, targetType: "face_guest_profile", targetId: slug,
      before: { status: row.review_status }, after: { status: input.decision, reason: input.note } });
    return { status: input.decision };
  });
}

async function assertGuestProfileReviewed(db: Db, kind: FaceCanonicalKind, slug: string) {
  if (kind !== "guest") return;
  const result = await db.query(`SELECT review_status FROM face_guest_profiles WHERE slug=$1 FOR SHARE`, [slug]);
  if (!result.rows[0]) throw new FaceStoreError("not_found", "Save this person's profile first.");
  if (result.rows[0].review_status !== "approved") throw new FaceStoreError("consent_required", "An admin must approve this person's profile research before enrollment.");
}

export async function getPublicFaceGuestProfile(slug: string): Promise<FaceCanonicalPerson | null> {
  if (!facePresencePublicIsEnabled()) return null;
  const result = await query<GuestProfileRow>(
    `SELECT ${guestProfileColumns}
       FROM face_guest_profiles guests
      WHERE guests.slug=$1 AND guests.review_status='approved' AND EXISTS (
        SELECT 1 FROM face_identities identities
        JOIN face_consents consents ON consents.identity_id=identities.id
        WHERE identities.canonical_kind='guest' AND identities.canonical_slug=guests.slug
          AND identities.state='active' AND consents.revoked_at IS NULL
          AND consents.expires_at > now() AND consents.subject_confirmed_adult
          AND consents.allow_public_tag AND consents.allow_profile_links
      )`, [slug],
  );
  const row = result.rows[0];
  if (!row) return null;
  const { review: _privateReview, ...profile } = guestProfileRecord(row);
  return faceGuestPerson(profile);
}

function safeSocialLinks(
  links: ReadonlyArray<{ platform: string; url: string; handle?: string; label?: string }>,
): PublicFaceSocialLink[] {
  return links.flatMap((link) => {
    try {
      const url = new URL(link.url);
      if (url.protocol !== "https:") return [];
      const label = link.label?.trim() || (link.handle ? `@${link.handle.replace(/^@/, "")}` : link.platform);
      return [{ platform: link.platform, label, url: url.toString() }];
    } catch {
      return [];
    }
  }).slice(0, 8);
}

function assertConsentDates(input: FaceConsentGrantInput): void {
  if (!faceConsentTermIsSafe(input.adultVerifiedAt, input.expiresAt)) {
    throw new FaceStoreError(
      "consent_required",
      "Consent must verify an adult, be current, and expire within 366 days.",
    );
  }
}

async function currentConsent(
  db: Db,
  identityId: string,
  options: { forUpdate?: boolean } = {},
): Promise<ConsentRow | null> {
  const result = await db.query<ConsentRow>(
    `SELECT id::text, identity_id::text, expires_at::text, revoked_at::text,
            allow_template_creation, allow_live_matching, allow_archive_matching,
            allow_public_tag, allow_profile_links, approved_content_ids,
            granted_by::text
       FROM face_consents
      WHERE identity_id=$1 AND revoked_at IS NULL
      LIMIT 1${options.forUpdate ? " FOR UPDATE" : ""}`,
    [identityId],
  );
  return result.rows[0] ?? null;
}

async function insertConsent(
  db: Db,
  identityId: string,
  input: FaceConsentGrantInput,
  context: FaceMutationContext,
): Promise<ConsentRow> {
  assertConsentDates(input);
  if(input.captureMethod==="owner_attested_email"){
    const allowed=await db.query<{allowed:boolean}>("SELECT face_owner_photo_review_is_allowed($1) AS allowed",[context.actor.id]);
    if(!allowed.rows[0]?.allowed)throw new FaceStoreError("conflict","Owner email confirmation is not enabled for this account.");
  }
  const identity = await db.query(`SELECT canonical_kind, canonical_slug FROM face_identities WHERE id=$1`, [identityId]);
  if (identity.rows[0]) await assertGuestProfileReviewed(db, identity.rows[0].canonical_kind, identity.rows[0].canonical_slug);
  const result = await db.query<ConsentRow>(
    `INSERT INTO face_consents
       (identity_id, consent_version, capture_method, evidence_ref,
        consent_text_sha256, subject_confirmed_adult, adult_verified_at,
        allow_template_creation, allow_live_matching, allow_archive_matching,
        allow_public_tag, allow_profile_links, approved_content_ids,
        expires_at, granted_by)
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id::text, identity_id::text, expires_at::text, revoked_at::text,
               allow_template_creation, allow_live_matching, allow_archive_matching,
               allow_public_tag, allow_profile_links, approved_content_ids,
               granted_by::text`,
    [
      identityId,
      input.consentVersion,
      input.captureMethod,
      input.evidenceRef,
      input.consentTextSha256,
      input.adultVerifiedAt,
      input.permissions.allowTemplateCreation,
      input.permissions.allowLiveMatching,
      input.permissions.allowArchiveMatching,
      input.permissions.allowPublicTag,
      input.permissions.allowProfileLinks,
      input.approvedContentIds,
      input.expiresAt,
      context.actor.id,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new FaceStoreError("conflict", "Consent could not be created.");
  for (const scope of input.approvedArchiveScopes) {
    await db.query(
      `INSERT INTO face_consent_archive_scopes
         (consent_id, identity_id, content_id, start_ms, end_ms)
       VALUES ($1,$2,$3,$4,$5)`,
      [row.id, identityId, scope.contentId, scope.startMs, scope.endMs],
    );
  }
  await audit(db, context, {
    action: "consent.granted",
    targetType: "face_consent",
    targetId: row.id,
    identityId,
    after: {
      ...publicConsentSummary(row),
      approvedArchiveScopes: input.approvedArchiveScopes,
    },
  });
  return row;
}

async function revokeConsentRow(
  db: Db,
  consent: ConsentRow,
  reason: string,
  context: FaceMutationContext,
): Promise<void> {
  await db.query(
    `UPDATE face_consents
        SET revoked_at=now(), revoked_by=$2, revocation_reason=$3
      WHERE id=$1 AND revoked_at IS NULL`,
    [consent.id, context.actor.id, reason],
  );
  await audit(db, context, {
    action: "consent.revoked",
    targetType: "face_consent",
    targetId: consent.id,
    identityId: consent.identity_id,
    before: publicConsentSummary(consent),
    after: { revoked: true, reason },
  });
}

const IDENTITY_SELECT = `
  SELECT identities.id::text, identities.canonical_kind, identities.canonical_slug,
         identities.display_name, identities.state, identities.created_at::text,
         identities.updated_at::text, identities.revoked_at::text,
         consents.id::text AS consent_id, consents.consent_version,
         consents.capture_method, consents.evidence_ref,
         consents.subject_confirmed_adult, consents.adult_verified_at::text,
         consents.granted_at::text, consents.expires_at::text,
         consents.revoked_at::text AS consent_revoked_at,
         consents.allow_template_creation, consents.allow_live_matching,
         consents.allow_archive_matching, consents.allow_public_tag,
         consents.allow_profile_links, consents.approved_content_ids,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'contentId', scopes.content_id,
             'startMs', scopes.start_ms,
             'endMs', scopes.end_ms
           ) ORDER BY scopes.content_id, scopes.start_ms, scopes.end_ms)
             FROM face_consent_archive_scopes scopes
            WHERE scopes.consent_id=consents.id
         ), '[]'::jsonb) AS approved_archive_scopes,
         (SELECT count(*)::int FROM face_reference_assets refs
           WHERE refs.identity_id=identities.id
             AND refs.state IN ('pending_review','approved')) AS reference_count,
         (SELECT COALESCE(sum(templates.template_count),0)::int
            FROM face_template_sets templates
           WHERE templates.identity_id=identities.id
             AND templates.consent_id=consents.id
             AND templates.state='active'
             AND templates.expires_at > now()
             AND consents.revoked_at IS NULL
             AND consents.expires_at > now()) AS template_set_count,
         (SELECT count(*)::int FROM face_source_identities allowed
           WHERE allowed.identity_id=identities.id) AS source_count
    FROM face_identities identities
    LEFT JOIN LATERAL (
      SELECT latest.* FROM face_consents latest
       WHERE latest.identity_id=identities.id
       ORDER BY latest.granted_at DESC, latest.id DESC
       LIMIT 1
    ) consents ON true`;

export async function listFaceIdentities(identityId?: string) {
  const result = await query<IdentityDbRow>(
    `${IDENTITY_SELECT}
      ${identityId ? "WHERE identities.id=$1" : ""}
      ORDER BY identities.display_name, identities.id`,
    identityId ? [identityId] : [],
  );
  return result.rows.map(identityResponse);
}

export async function findFaceIdentityByCanonical(
  canonicalKind: FaceCanonicalKind,
  canonicalSlug: string,
) {
  const result = await query<IdentityDbRow>(
    `${IDENTITY_SELECT}
      WHERE identities.canonical_kind=$1 AND identities.canonical_slug=$2
      ORDER BY identities.id LIMIT 1`,
    [canonicalKind, canonicalSlug],
  );
  return result.rows[0] ? identityResponse(result.rows[0]) : null;
}

export async function createFaceIdentity(
  input: FaceIdentityCreateInput,
  context: FaceMutationContext,
) {
  const guests = input.canonicalKind === "guest" ? await listFaceGuestProfiles() : [];
  if (guests.some((guest) => guest.slug === input.canonicalSlug && guest.review?.status !== "approved")) {
    throw new FaceStoreError("consent_required", "An admin must approve this person's profile research before enrollment.");
  }
  const profile = canonicalProfile(input.canonicalKind, input.canonicalSlug, guests);
  if (!profile) {
    throw new FaceStoreError("not_found", "That person was not found. Save their profile before recording consent.");
  }
  try {
    return await withTransaction(async (db) => {
      await assertGuestProfileReviewed(db, input.canonicalKind, input.canonicalSlug);
      const created = await db.query<{ id: string }>(
        `INSERT INTO face_identities
           (canonical_kind, canonical_slug, display_name, state, created_by)
         VALUES ($1,$2,$3,'draft',$4)
         RETURNING id::text`,
        [input.canonicalKind, input.canonicalSlug, profile.displayName, context.actor.id],
      );
      const identityId = created.rows[0]?.id;
      if (!identityId) throw new FaceStoreError("conflict", "Identity could not be created.");
      const consent = await insertConsent(db, identityId, input.consent, context);
      await db.query(
        `UPDATE face_identities SET state='active', updated_at=now() WHERE id=$1`,
        [identityId],
      );
      await audit(db, context, {
        action: "identity.created",
        targetType: "face_identity",
        targetId: identityId,
        identityId,
        after: {
          canonicalKind: input.canonicalKind,
          canonicalSlug: input.canonicalSlug,
          consent: publicConsentSummary(consent),
        },
      });
      return { id: identityId, consentId: consent.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new FaceStoreError("conflict", "That canonical profile already has a face identity.");
    }
    throw error;
  }
}

export async function updateFaceIdentity(
  identityId: string,
  input: FaceIdentityActionInput,
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const identityResult = await db.query<{
      id: string;
      state: "draft" | "active" | "archived" | "revoked";
    }>(
      `SELECT id::text, state FROM face_identities WHERE id=$1 FOR UPDATE`,
      [identityId],
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new FaceStoreError("not_found", "Face identity was not found.");
    if (identity.state === "revoked") {
      throw new FaceStoreError("invalid_state", "A revoked identity cannot be changed.");
    }
    const consent = await currentConsent(db, identityId, { forUpdate: true });

    if (input.action === "grant_consent") {
      if (consent && Date.parse(consent.expires_at) > Date.now()) {
        throw new FaceStoreError("conflict", "This identity already has current consent.");
      }
      if (consent) {
        await revokeConsentRow(db, consent, "Expired consent superseded by a new grant.", context);
      }
      const next = await insertConsent(db, identityId, input.consent, context);
      await db.query(
        `UPDATE face_identities SET state='active', updated_at=now() WHERE id=$1`,
        [identityId],
      );
      return { id: identityId, consentId: next.id, state: "active" as const };
    }

    if (input.action === "revoke_consent") {
      if (!consent) throw new FaceStoreError("invalid_state", "There is no current consent to revoke.");
      await revokeConsentRow(db, consent, input.reason, context);
      return { id: identityId, state: "draft" as const };
    }

    if (input.action === "archive_identity") {
      await db.query(
        `UPDATE face_identities SET state='archived', updated_at=now() WHERE id=$1`,
        [identityId],
      );
      await db.query(
        `UPDATE face_tracks
            SET state='withdrawn', withdrawn_by=$2, withdrawn_at=now(), updated_at=now()
          WHERE identity_id=$1 AND state IN ('proposed','approved','published')`,
        [identityId, context.actor.id],
      );
      await audit(db, context, {
        action: "identity.archived",
        targetType: "face_identity",
        targetId: identityId,
        identityId,
        before: { state: identity.state },
        after: { state: "archived", reason: input.reason },
      });
      return { id: identityId, state: "archived" as const };
    }

    if (consent) await revokeConsentRow(db, consent, input.reason, context);
    await db.query(
      `UPDATE face_identities
          SET state='revoked', revoked_at=now(), revoked_by=$2,
              revocation_reason=$3, updated_at=now()
        WHERE id=$1`,
      [identityId, context.actor.id, input.reason],
    );
    await audit(db, context, {
      action: "identity.revoked",
      targetType: "face_identity",
      targetId: identityId,
      identityId,
      before: { state: identity.state },
      after: { state: "revoked", reason: input.reason },
    });
    return { id: identityId, state: "revoked" as const };
  });
}

export async function replaceFaceIdentityConsent(
  identityId: string,
  input: FaceConsentGrantInput,
  replaceActiveConsent: boolean,
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const identityResult = await db.query<{ id: string; state: string }>(
      `SELECT id::text, state FROM face_identities WHERE id=$1 FOR UPDATE`,
      [identityId],
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new FaceStoreError("not_found", "Face identity was not found.");
    if (identity.state === "revoked") {
      throw new FaceStoreError("invalid_state", "A permanently revoked identity cannot be re-enrolled.");
    }
    const previous = await currentConsent(db, identityId, { forUpdate: true });
    if (
      previous
      && Date.parse(previous.expires_at) > Date.now()
      && !replaceActiveConsent
    ) {
      throw new FaceStoreError(
        "conflict",
        "An active consent grant can be replaced only after explicit destructive confirmation.",
      );
    }
    if (previous) {
      await revokeConsentRow(
        db,
        previous,
        "Superseded by a new subject-confirmed consent grant.",
        context,
      );
    }
    const consent = await insertConsent(db, identityId, input, context);
    await db.query(
      `UPDATE face_identities SET state='active', updated_at=now() WHERE id=$1`,
      [identityId],
    );
    return { id: identityId, consentId: consent.id };
  });
}

export type FaceReferenceUploadRecord = FaceReferenceCreateInput & {
  storageKey: string;
  fileName: string;
  contentSha256: string;
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
};

type ReferenceRow = {
  id: string;
  identity_id: string;
  consent_id: string;
  storage_key: string | null;
  content_sha256: string;
  file_name: string;
  source_kind: "subject_provided" | "creator_session" | "licensed_archive";
  subject_approved: boolean;
  captured_at: string | null;
  state: "pending_review" | "approved" | "rejected" | "deletion_pending" | "deleted";
  quality_issues: string[];
  retention_expires_at: string;
  created_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  review_mode: "independent" | "owner";
  created_at: string;
  updated_at: string;
};

function referenceResponse(row: ReferenceRow) {
  const qualityIssues = row.state === "deletion_pending"
    ? [...(row.quality_issues ?? []), "physical deletion pending"]
    : row.quality_issues ?? [];
  return {
    id: row.id,
    identityId: row.identity_id,
    fileName: row.file_name,
    sourceKind: row.source_kind,
    subjectApproved: row.subject_approved,
    capturedAt: row.captured_at,
    status: row.state === "approved"
      ? "accepted"
      : row.state === "deleted"
        ? "deleted"
        : row.state,
    qualityIssues,
    previewUrl: row.storage_key && row.state !== "deleted"
      ? `/api/admin/faces/identities/${encodeURIComponent(row.identity_id)}/references/${encodeURIComponent(row.id)}/image`
      : null,
    uploadedBy: row.created_by,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    reviewMode: row.review_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFaceReferences(identityId?: string) {
  const result = await query<ReferenceRow>(
    `SELECT id::text, identity_id::text, consent_id::text, storage_key, content_sha256,
            file_name, source_kind, subject_approved, captured_at::text,
            state, quality_issues, retention_expires_at::text,
            created_by::text, reviewed_by::text, review_note, review_mode,
            created_at::text, updated_at::text
       FROM face_reference_assets
      ${identityId ? "WHERE identity_id=$1" : ""}
      ORDER BY created_at DESC
      LIMIT 500`,
    identityId ? [identityId] : [],
  );
  return result.rows.map(referenceResponse);
}

export async function getFaceReferenceForDeletion(
  identityId: string,
  referenceId: string,
): Promise<(ReferenceRow & { storageKey: string | null }) | null> {
  const result = await query<ReferenceRow>(
    `SELECT id::text, identity_id::text, consent_id::text, storage_key, content_sha256,
            file_name, source_kind, subject_approved, captured_at::text,
            state, quality_issues, retention_expires_at::text,
            created_by::text, reviewed_by::text, review_note,
            created_at::text, updated_at::text
       FROM face_reference_assets
      WHERE id=$1 AND identity_id=$2`,
    [referenceId, identityId],
  );
  const row = result.rows[0];
  return row ? { ...row, storageKey: row.storage_key } : null;
}

export async function listFaceReferenceStorageKeys(identityId: string) {
  const result = await query<{
    id: string;
    storage_key: string | null;
    file_name: string;
    state: ReferenceRow["state"];
  }>(
    `SELECT id::text, storage_key, file_name, state
       FROM face_reference_assets
      WHERE identity_id=$1 AND state <> 'deleted'`,
    [identityId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    storageKey: row.storage_key,
    fileName: row.file_name,
    state: row.state,
  }));
}

export async function faceIdentityHasPendingLocalTemplatePurge(identityId: string): Promise<boolean> {
  const result = await query<{ pending: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM face_template_sets
        WHERE identity_id=$1 AND state <> 'purged'
     ) AS pending`,
    [identityId],
  );
  return Boolean(result.rows[0]?.pending);
}

export async function registerFaceReference(
  input: FaceReferenceUploadRecord,
  context: FaceMutationContext,
  candidateId?: string,
) {
  try {
    return await withTransaction(async (db) => {
    const consent = await currentConsent(db, input.identityId, { forUpdate: true });
    if (
      !consent
      || Date.parse(consent.expires_at) <= Date.now()
      || !consent.allow_template_creation
    ) {
      throw new FaceStoreError(
        "consent_required",
        "Current adult template-creation consent is required for this exact reference.",
      );
    }
    if (candidateId) {
      const identity = await db.query<{ canonical_kind: FaceCanonicalKind; canonical_slug: string }>(
        "SELECT canonical_kind,canonical_slug FROM face_identities WHERE id=$1", [input.identityId],
      );
      const person = identity.rows[0];
      if (!person) throw new FaceStoreError("not_found", "Identity was not found.");
      await assertGuestProfileReviewed(db, person.canonical_kind, person.canonical_slug);
      const candidate = await db.query<{ canonical_kind: string; canonical_slug: string; state: string; content_sha256: string }>(
        "SELECT canonical_kind,canonical_slug,state,content_sha256 FROM face_photo_candidates WHERE id=$1 FOR UPDATE", [candidateId],
      );
      const row = candidate.rows[0];
      if (!row || row.canonical_kind !== person.canonical_kind || row.canonical_slug !== person.canonical_slug) {
        throw new FaceStoreError("conflict", "This photo belongs to a different profile.");
      }
      if (row.state !== "pending" || row.content_sha256 !== input.contentSha256) {
        throw new FaceStoreError("conflict", "This photo was already reviewed or its contents changed. Refresh before continuing.");
      }
    }
    const retentionExpiresAt = new Date(
      Math.min(Date.now() + FACE_REFERENCE_PENDING_REVIEW_MS, Date.parse(consent.expires_at)),
    ).toISOString();
    const result = await db.query<{ id: string }>(
      `INSERT INTO face_reference_assets
         (identity_id, consent_id, storage_key, content_sha256, content_type,
          file_name, source_kind, subject_approved, notes, byte_size, width,
          height, captured_at, retention_expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id::text`,
      [
        input.identityId,
        consent.id,
        input.storageKey,
        input.contentSha256,
        input.contentType,
        input.fileName,
        input.sourceKind,
        input.notes ?? null,
        input.byteSize,
        input.width,
        input.height,
        input.capturedAt ?? null,
        retentionExpiresAt,
        context.actor.id,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new FaceStoreError("conflict", "Reference could not be registered.");
    if (candidateId) {
      await db.query(`UPDATE face_photo_candidates SET state='submitted',reference_id=$2,reviewed_by=$3,
        reviewed_at=now(),review_note=$4 WHERE id=$1`, [candidateId,id,context.actor.id,input.notes ?? null]);
      await audit(db,context,{action:"photo_candidate.submitted",targetType:"face_photo_candidate",targetId:candidateId,
        identityId:input.identityId,after:{referenceId:id,subjectApproved:true,rightsConfirmed:true}});
    }
    await audit(db, context, {
      action: "reference.created",
      targetType: "face_reference",
      targetId: id,
      identityId: input.identityId,
      after: {
        sourceKind: input.sourceKind,
        subjectApproved: true,
        contentSha256: input.contentSha256,
        retentionExpiresAt,
      },
    });
    return { id, retentionExpiresAt, status: "pending_review" as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new FaceStoreError("conflict", "That exact reference image is already registered for this identity.");
    }
    throw error;
  }
}

type PhotoCandidateRow = {
  id: string; canonical_kind: string; canonical_slug: string; source_url: string; source_label: string;
  research_note: string; checked_at: string; storage_key: string; content_sha256: string;
  byte_size: number; width: number; height: number; state: string; reference_id: string | null;
};
const PHOTO_CANDIDATE_COLUMNS = `id::text,canonical_kind,canonical_slug,source_url,source_label,research_note,
  checked_at::text,storage_key,content_sha256,byte_size,width,height,state,reference_id::text`;

export async function listFacePhotoCandidates() {
  const result = await query<PhotoCandidateRow>(`SELECT ${PHOTO_CANDIDATE_COLUMNS} FROM face_photo_candidates ORDER BY created_at,id LIMIT 2000`);
  return result.rows.map((row) => FacePhotoCandidateSchema.parse({
    id:row.id,canonicalKey:`${row.canonical_kind}:${row.canonical_slug}`,sourceUrl:row.source_url,sourceLabel:row.source_label,
    researchNote:row.research_note,checkedAt:row.checked_at,width:row.width,height:row.height,status:row.state,
    previewUrl:`/api/admin/faces/photo-candidates/${encodeURIComponent(row.id)}/image`,referenceId:row.reference_id,
  }));
}

export async function getFacePhotoCandidate(id: string) {
  const result = await query<PhotoCandidateRow>(`SELECT ${PHOTO_CANDIDATE_COLUMNS} FROM face_photo_candidates WHERE id=$1`,[id]);
  return result.rows[0] ?? null;
}

export async function dismissFacePhotoCandidate(id: string, reason: string, context: FaceMutationContext) {
  return withTransaction(async (db) => {
    const result = await db.query<{state:string}>("SELECT state FROM face_photo_candidates WHERE id=$1 FOR UPDATE",[id]);
    if (!result.rows[0]) throw new FaceStoreError("not_found", "Photo candidate was not found.");
    if (result.rows[0].state !== "pending") throw new FaceStoreError("conflict", "This photo was already reviewed.");
    await db.query("UPDATE face_photo_candidates SET state='dismissed',reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$1",[id,context.actor.id,reason]);
    await audit(db,context,{action:"photo_candidate.dismissed",targetType:"face_photo_candidate",targetId:id,after:{reason}});
    return {ok:true};
  });
}

export async function listReviewedFacePhotoCandidateFiles() {
  const result=await query<{id:string;storage_key:string}>("SELECT id::text,storage_key FROM face_photo_candidates WHERE state<>'pending' AND storage_deleted_at IS NULL LIMIT 250");
  return result.rows;
}

export async function markFacePhotoCandidateFileDeleted(id: string) {
  await query("UPDATE face_photo_candidates SET storage_deleted_at=now() WHERE id=$1 AND state<>'pending' AND storage_deleted_at IS NULL",[id]);
}

export async function reviewFaceReference(
  referenceId: string,
  input: FaceReferenceActionInput | {
    action: "request_delete";
    reason: string;
  } | {
    action: "confirm_deleted";
    storageDeleted: true;
  },
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const result = await db.query<ReferenceRow>(
      `SELECT id::text, identity_id::text, consent_id::text, storage_key, content_sha256,
              file_name, source_kind, subject_approved, captured_at::text,
              state, quality_issues, retention_expires_at::text,
              created_by::text, reviewed_by::text, review_note, review_mode,
              created_at::text, updated_at::text
         FROM face_reference_assets WHERE id=$1 FOR UPDATE`,
      [referenceId],
    );
    const row = result.rows[0];
    if (!row) throw new FaceStoreError("not_found", "Reference was not found.");
    const approving=input.action === "approve" || input.action === "approve_owner";
    if (approving) {
      if (row.state !== "pending_review") {
        throw new FaceStoreError("invalid_state", "Only pending references can be approved.");
      }
      const consent = await currentConsent(db, row.identity_id, { forUpdate: true });
      if (
        !consent
        || consent.id !== row.consent_id
        || !consent.allow_template_creation
        || Date.parse(consent.expires_at) <= Date.now()
        || Date.parse(row.retention_expires_at) <= Date.now()
      ) {
        throw new FaceStoreError(
          "consent_required",
          "Reference approval requires current template consent and unexpired private storage.",
        );
      }
      if (input.action === "approve_owner") {
        if(input.ownerConfirmed!==true)throw new FaceStoreError("invalid_state","Explicit owner confirmation is required.");
        const allowed=await db.query<{allowed:boolean}>("SELECT face_owner_photo_review_is_allowed($1) AS allowed",[context.actor.id]);
        if(!allowed.rows[0]?.allowed)throw new FaceStoreError("conflict","Owner photo review is not enabled for this account.");
      } else if (context.actor.id === row.created_by || context.actor.id === consent.granted_by) {
        throw new FaceStoreError(
          "conflict",
          "A different staff member must review enrollment from the uploader and consent recorder.",
        );
      }
      await db.query(
        `UPDATE face_reference_assets
            SET state='approved', reviewed_by=$2, reviewed_at=now(),
                review_note=$3, review_mode=$6,
                retention_expires_at=LEAST($4::timestamptz, $5::timestamptz),
                updated_at=now()
          WHERE id=$1`,
        [
          referenceId,
          context.actor.id,
          input.note ?? null,
          new Date(Date.now() + FACE_REFERENCE_APPROVED_RETENTION_MS).toISOString(),
          consent.expires_at,
          input.action === "approve_owner" ? "owner" : "independent",
        ],
      );
    } else if (input.action === "confirm_deleted") {
      if (row.state !== "deletion_pending" && row.state !== "rejected") {
        throw new FaceStoreError("invalid_state", "Reference is not awaiting physical deletion.");
      }
      await db.query(
        `UPDATE face_reference_assets
            SET state='deleted', storage_key=NULL, deleted_at=now(), updated_at=now()
          WHERE id=$1`,
        [referenceId],
      );
    } else {
      const reason = input.reason;
      await db.query(
        `UPDATE face_template_sets
            SET state=CASE WHEN state='purged' THEN state ELSE 'purge_pending' END,
                error_message=CASE WHEN state='purged' THEN error_message ELSE 'Source reference explicitly rejected or deleted.' END,
                updated_at=now()
          WHERE identity_id=$1 AND $2 = ANY(reference_hashes)`,
        [row.identity_id, row.content_sha256],
      );
      await db.query(
        `UPDATE face_reference_assets
            SET state='deletion_pending', revoked_at=COALESCE(revoked_at,now()),
                deletion_requested_at=COALESCE(deletion_requested_at,now()),
                reviewed_by=$2, reviewed_at=now(), review_note=$3, updated_at=now()
          WHERE id=$1 AND state <> 'deleted'`,
        [referenceId, context.actor.id, reason],
      );
    }
    await audit(db, context, {
      action: `reference.${input.action}`,
      targetType: "face_reference",
      targetId: referenceId,
      identityId: row.identity_id,
      before: { state: row.state },
      after: input.action === "confirm_deleted"
        ? { state: "deleted", storageDeleted: true }
        : { state: approving ? "approved" : "deletion_pending",...(approving?{reviewMode:input.action==="approve_owner"?"owner":"independent"}:{}) },
    });
    return { id: referenceId, ok: true };
  });
}

export async function prepareExpiredFaceDataPurge(context: FaceMutationContext) {
  return withTransaction(async (db) => {
    const evidenceRedacted = await db.query(
      `UPDATE face_tracks
          SET evidence_key=NULL, updated_at=now()
        WHERE evidence_key IS NOT NULL
          AND created_at <= now() - interval '7 days'`,
    );
    const diagnosticsRedacted = await db.query(
      `UPDATE face_tracks
          SET similarity_score=NULL, similarity_margin=NULL, updated_at=now()
        WHERE (similarity_score IS NOT NULL OR similarity_margin IS NOT NULL)
          AND created_at <= now() - interval '30 days'`,
    );
    const privateTracksPurged = await db.query(
      `DELETE FROM face_tracks
        WHERE state IN ('proposed','unknown','rejected')
          AND created_at <= now() - interval '30 days'`,
    );
    const allowlists = await db.query(
      `DELETE FROM face_source_identities allowed
        USING face_consents consents
        WHERE allowed.consent_id=consents.id
          AND (consents.expires_at <= now() OR consents.revoked_at IS NOT NULL)`,
    );
    const tracks = await db.query(
      `UPDATE face_tracks tracks
          SET state='withdrawn', withdrawn_by=$1, withdrawn_at=now(), updated_at=now()
         FROM face_consents consents
        WHERE tracks.consent_id=consents.id
          AND tracks.state <> 'withdrawn'
          AND (consents.expires_at <= now() OR consents.revoked_at IS NOT NULL)`,
      [context.actorType === "system" ? null : context.actor.id],
    );
    const templateSets = await db.query(
      `UPDATE face_template_sets templates
          SET state='purge_pending',
              error_message='Consent expired or was revoked; local purge required.',
              updated_at=now()
         FROM face_consents consents
        WHERE templates.consent_id=consents.id
          AND templates.state IN ('active','failed')
          AND (templates.expires_at <= now()
               OR consents.expires_at <= now()
               OR consents.revoked_at IS NOT NULL)`,
    );
    const references = await db.query<{
      id: string;
      identity_id: string;
      storage_key: string | null;
    }>(
      `UPDATE face_reference_assets refs
          SET state='deletion_pending',
              revoked_at=COALESCE(refs.revoked_at,now()),
              deletion_requested_at=COALESCE(refs.deletion_requested_at,now()),
              updated_at=now()
         FROM face_consents consents
        WHERE refs.consent_id=consents.id
          AND refs.state NOT IN ('deletion_pending','deleted')
          AND (refs.retention_expires_at <= now()
               OR consents.expires_at <= now()
               OR consents.revoked_at IS NOT NULL)
      RETURNING refs.id::text, refs.identity_id::text, refs.storage_key`,
    );
    const pending = await db.query<{
      id: string;
      identity_id: string;
      storage_key: string | null;
    }>(
      `SELECT id::text, identity_id::text, storage_key
         FROM face_reference_assets
        WHERE state='deletion_pending'
        ORDER BY deletion_requested_at
        LIMIT 500`,
    );
    await audit(db, context, {
      action: "maintenance.expired_data_prepared",
      targetType: "face_maintenance",
      targetId: context.requestId,
      after: {
        evidenceKeysRedacted: evidenceRedacted.rowCount ?? 0,
        diagnosticsRedacted: diagnosticsRedacted.rowCount ?? 0,
        privateTracksPurged: privateTracksPurged.rowCount ?? 0,
        referencesQueued: references.rowCount ?? 0,
      },
    });
    return {
      pending: pending.rows.map((row) => ({
        id: row.id,
        identityId: row.identity_id,
        storageKey: row.storage_key,
      })),
      counts: {
        evidenceKeysRedacted: evidenceRedacted.rowCount ?? 0,
        diagnosticsRedacted: diagnosticsRedacted.rowCount ?? 0,
        privateTracksPurged: privateTracksPurged.rowCount ?? 0,
        allowlistsRemoved: allowlists.rowCount ?? 0,
        tracksWithdrawn: tracks.rowCount ?? 0,
        templateSetsQueued: templateSets.rowCount ?? 0,
        referencesQueued: references.rowCount ?? 0,
      },
    };
  });
}

export async function purgeExpiredFaceAudit(): Promise<number> {
  const result = await query<{ purged: number }>(
    `SELECT purge_face_audit_retention()::int AS purged`,
  );
  return Number(result.rows[0]?.purged ?? 0);
}

type SourceRow = {
  id: string;
  content_id: string;
  display_name: string;
  provider: string;
  source_kind: "live" | "archive";
  state: "disabled" | "active" | "archived";
  operation_mode: "manual_only" | "review_only" | "automatic";
  recognition_enabled: boolean;
  automatic_matching_enabled: boolean;
  automatic_publish_enabled: boolean;
  all_visible_people_consented: boolean;
  kill_switch_active: boolean;
  active_session_id: string | null;
  live_active: boolean;
  live_started_at: string | null;
  live_ended_at: string | null;
  last_frame_at: string | null;
  error_message: string | null;
  updated_at: string;
  allowed_identity_ids: string[];
};

function sourceStatus(row: SourceRow): "idle" | "connecting" | "running" | "stopped" | "error" {
  if (row.error_message) return "error";
  if (row.kill_switch_active || row.state !== "active") return "stopped";
  const lastFrameAt = row.last_frame_at ? Date.parse(row.last_frame_at) : Number.NaN;
  if (Number.isFinite(lastFrameAt) && lastFrameAt >= Date.now() - 90_000) return "running";
  if (row.live_active || row.recognition_enabled) return "connecting";
  return "idle";
}

function sourceResponse(row: SourceRow) {
  return {
    id: row.id,
    contentId: row.content_id,
    name: row.display_name,
    kind: row.source_kind,
    provider: row.provider,
    status: sourceStatus(row),
    mode: row.operation_mode,
    recognitionEnabled: row.recognition_enabled,
    automaticMatchingEnabled: row.automatic_matching_enabled,
    automaticPublishEnabled: false,
    allVisiblePeopleConsented: row.all_visible_people_consented,
    killSwitchActive: row.kill_switch_active,
    allowedIdentityIds: row.allowed_identity_ids ?? [],
    activeSessionId: row.active_session_id,
    liveStartedAt: row.live_started_at,
    liveEndedAt: row.live_ended_at,
    lastFrameAt: row.last_frame_at,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

const SOURCE_SELECT = `
  SELECT sources.id::text, sources.content_id, sources.display_name, sources.provider,
         sources.source_kind, sources.state, sources.operation_mode,
         sources.recognition_enabled, sources.automatic_matching_enabled,
         sources.automatic_publish_enabled, sources.all_visible_people_consented,
         sources.kill_switch_active, sources.active_session_id, sources.live_active,
         sources.live_started_at::text, sources.live_ended_at::text,
         sources.last_frame_at::text, sources.error_message, sources.updated_at::text,
         COALESCE(array_agg(allowed.identity_id::text ORDER BY allowed.identity_id)
           FILTER (WHERE allowed.identity_id IS NOT NULL), '{}'::text[]) AS allowed_identity_ids
    FROM face_sources sources
    LEFT JOIN face_source_identities allowed ON allowed.source_id=sources.id`;

export async function listFaceSources(sourceId?: string) {
  const result = await query<SourceRow>(
    `${SOURCE_SELECT}
      ${sourceId ? "WHERE sources.id=$1" : ""}
      GROUP BY sources.id
      ORDER BY sources.display_name`,
    sourceId ? [sourceId] : [],
  );
  return result.rows.map(sourceResponse);
}

async function replaceSourceAllowlist(
  db: Db,
  sourceId: string,
  sourceKind: "live" | "archive",
  sourceContentId: string,
  identityIds: string[],
  context: FaceMutationContext,
): Promise<string[]> {
  const uniqueIds = [...new Set(identityIds)];
  const consentRows: Array<{ identityId: string; consentId: string }> = [];
  for (const identityId of uniqueIds) {
    const consent = await currentConsent(db, identityId, { forUpdate: true });
    const permitted = consent
      && Date.parse(consent.expires_at) > Date.now()
      && consent.approved_content_ids.includes(sourceContentId)
      && (sourceKind === "live" ? consent.allow_live_matching : consent.allow_archive_matching);
    if (!permitted || !consent) {
      throw new FaceStoreError(
        "consent_required",
        `Identity ${identityId} lacks current ${sourceKind} matching consent.`,
      );
    }
    consentRows.push({ identityId, consentId: consent.id });
  }
  await db.query(`DELETE FROM face_source_identities WHERE source_id=$1`, [sourceId]);
  for (const row of consentRows) {
    await db.query(
      `INSERT INTO face_source_identities
         (source_id, identity_id, consent_id, added_by)
       VALUES ($1,$2,$3,$4)`,
      [sourceId, row.identityId, row.consentId, context.actor.id],
    );
  }
  return uniqueIds;
}

function assertAutomaticMatchingLaunchGate(enabled: boolean): void {
  if (enabled && !faceAutomaticMatchingIsEnabled()) {
    throw new FaceStoreError(
      "invalid_state",
      "Automatic matching is deployment-gated until the review-only evaluation is signed off.",
    );
  }
}

export async function createFaceSource(
  input: FaceSourceCreateInput,
  context: FaceMutationContext,
) {
  assertAutomaticMatchingLaunchGate(input.automaticMatchingEnabled);
  try {
    return await withTransaction(async (db) => {
      const created = await db.query<{ id: string }>(
        `INSERT INTO face_sources
           (content_id, display_name, provider, source_kind, ingest_locator_ref,
            state, operation_mode, all_visible_people_consented,
            recognition_enabled, automatic_matching_enabled, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)
         RETURNING id::text`,
        [
          input.contentId,
          input.displayName,
          input.provider,
          input.sourceKind,
          input.ingestLocatorRef ?? null,
          input.state,
          input.automaticMatchingEnabled ? "review_only" : "manual_only",
          input.allVisiblePeopleConsented,
          input.automaticMatchingEnabled,
          context.actor.id,
        ],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new FaceStoreError("conflict", "Source could not be created.");
      const allowlist = await replaceSourceAllowlist(
        db,
        id,
        input.sourceKind,
        input.contentId,
        input.allowedIdentityIds,
        context,
      );
      await audit(db, context, {
        action: "source.created",
        targetType: "face_source",
        targetId: id,
        sourceId: id,
        after: {
          contentId: input.contentId,
          sourceKind: input.sourceKind,
          automaticMatchingEnabled: input.automaticMatchingEnabled,
          automaticPublishEnabled: false,
          allowedIdentityIds: allowlist,
        },
      });
      return { id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new FaceStoreError("conflict", "That content ID already has a face source.");
    }
    throw error;
  }
}

export async function configureFaceSource(
  sourceId: string,
  input: {
    mode: "manual_only" | "review_only" | "automatic";
    recognitionEnabled: boolean;
    allowedIdentityIds: string[];
    state?: "disabled" | "active";
    allVisiblePeopleConsented?: boolean;
  },
  context: FaceMutationContext,
) {
  const automaticMatchingEnabled = input.recognitionEnabled && input.mode !== "manual_only";
  assertAutomaticMatchingLaunchGate(automaticMatchingEnabled);
  return withTransaction(async (db) => {
    const sourceResult = await db.query<{
      id: string;
      source_kind: "live" | "archive";
      content_id: string;
      state: "disabled" | "active" | "archived";
      all_visible_people_consented: boolean;
      kill_switch_active: boolean;
    }>(
      `SELECT id::text, source_kind, content_id, state, all_visible_people_consented,
              kill_switch_active
         FROM face_sources WHERE id=$1 FOR UPDATE`,
      [sourceId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new FaceStoreError("not_found", "Face source was not found.");
    if (source.state === "archived") {
      throw new FaceStoreError("invalid_state", "Archived sources cannot be reconfigured.");
    }
    if (automaticMatchingEnabled && source.source_kind === "live") {
      throw new FaceStoreError(
        "invalid_state",
        "Live recognition is disabled for the archive/VOD-only v1 launch.",
      );
    }
    const nextState = input.state ?? source.state;
    const allVisible = automaticMatchingEnabled
      ? input.allVisiblePeopleConsented === true
      : false;
    const uniqueAllowlist = [...new Set(input.allowedIdentityIds)];
    if (!faceSourceConfigurationIsSafe({
      automaticMatchingEnabled,
      allVisiblePeopleConsented: allVisible,
      allowedIdentityCount: uniqueAllowlist.length,
    })) {
      throw new FaceStoreError(
        "consent_required",
        "Recognition requires an explicit all-visible consent assertion and a non-empty allowlist.",
      );
    }
    if (input.recognitionEnabled && (nextState !== "active" || source.kill_switch_active)) {
      throw new FaceStoreError("invalid_state", "Enable and clear the source kill switch first.");
    }
    const allowlist = await replaceSourceAllowlist(
      db,
      sourceId,
      source.source_kind,
      source.content_id,
      uniqueAllowlist,
      context,
    );
    await db.query(
      `UPDATE face_sources
          SET state=$2, operation_mode=$3, recognition_enabled=$4,
              automatic_matching_enabled=$5, all_visible_people_consented=$6,
              updated_at=now()
        WHERE id=$1`,
      [sourceId, nextState, input.mode, input.recognitionEnabled, automaticMatchingEnabled, allVisible],
    );
    await audit(db, context, {
      action: "source.configured",
      targetType: "face_source",
      targetId: sourceId,
      sourceId,
      after: {
        mode: input.mode,
        recognitionEnabled: input.recognitionEnabled,
        automaticMatchingEnabled,
        automaticPublishEnabled: false,
        allVisiblePeopleConsented: allVisible,
        allowedIdentityIds: allowlist,
      },
    });
    return { id: sourceId };
  });
}

export async function updateFaceSource(
  sourceId: string,
  input: FaceSourceActionInput,
  context: FaceMutationContext,
) {
  if (input.action === "configure") {
    return configureFaceSource(sourceId, {
      mode: input.automaticMatchingEnabled ? "review_only" : "manual_only",
      recognitionEnabled: input.automaticMatchingEnabled,
      allowedIdentityIds: input.allowedIdentityIds,
      state: input.state,
      allVisiblePeopleConsented: input.allVisiblePeopleConsented,
    }, context);
  }
  return withTransaction(async (db) => {
    const result = await db.query<{
      id: string;
      source_kind: "live" | "archive";
      state: "disabled" | "active" | "archived";
    }>(`SELECT id::text, source_kind, state FROM face_sources WHERE id=$1 FOR UPDATE`, [sourceId]);
    const source = result.rows[0];
    if (!source) throw new FaceStoreError("not_found", "Face source was not found.");
    if (input.action === "start_live") {
      if (source.source_kind !== "live" || source.state !== "active") {
        throw new FaceStoreError("invalid_state", "Only an active live source can start a session.");
      }
      await db.query(
        `UPDATE face_sources
            SET live_active=true, live_started_at=now(), live_ended_at=NULL,
                active_session_id=gen_random_uuid()::text, updated_at=now()
          WHERE id=$1 AND kill_switch_active=false`,
        [sourceId],
      );
    } else if (input.action === "end_live") {
      await db.query(
        `UPDATE face_sources
            SET live_active=false, live_ended_at=now(), active_session_id=NULL,
                recognition_enabled=false, automatic_matching_enabled=false,
                all_visible_people_consented=false,
                updated_at=now()
          WHERE id=$1`,
        [sourceId],
      );
    } else {
      await db.query(
        `UPDATE face_sources
            SET state=$2, live_active=false, live_ended_at=CASE WHEN live_started_at IS NULL THEN live_ended_at ELSE now() END,
                active_session_id=NULL, recognition_enabled=false,
                automatic_matching_enabled=false,
                all_visible_people_consented=false, updated_at=now()
          WHERE id=$1`,
        [sourceId, input.action === "archive" ? "archived" : "disabled"],
      );
    }
    await audit(db, context, {
      action: `source.${input.action}`,
      targetType: "face_source",
      targetId: sourceId,
      sourceId,
      before: { state: source.state },
      after: { action: input.action },
    });
    return { id: sourceId };
  });
}

export async function setFaceSourceKillSwitch(
  sourceId: string,
  input: {
    active: boolean;
    sessionId?: string | null;
    reason: string;
    allVisiblePeopleConsented?: boolean;
  },
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const result = await db.query<{
      id: string;
      state: "disabled" | "active" | "archived";
      source_kind: "live" | "archive";
      operation_mode: "manual_only" | "review_only" | "automatic";
      active_session_id: string | null;
      all_visible_people_consented: boolean;
      kill_switch_active: boolean;
      allowed_count: number;
    }>(
      `SELECT sources.id::text, sources.state, sources.source_kind,
              sources.operation_mode, sources.active_session_id,
              sources.all_visible_people_consented, sources.kill_switch_active,
              (SELECT count(*)::int FROM face_source_identities allowed
                WHERE allowed.source_id=sources.id) AS allowed_count
         FROM face_sources sources WHERE sources.id=$1 FOR UPDATE`,
      [sourceId],
    );
    const source = result.rows[0];
    if (!source) throw new FaceStoreError("not_found", "Face source was not found.");
    if (input.sessionId && input.sessionId !== source.active_session_id) {
      throw new FaceStoreError("conflict", "The active source session changed; refresh before using the kill switch.");
    }
    if (!input.active) {
      const willRecognize = source.operation_mode !== "manual_only";
      assertAutomaticMatchingLaunchGate(willRecognize);
      if (
        source.state !== "active"
        || (willRecognize && (input.allVisiblePeopleConsented !== true || Number(source.allowed_count) === 0))
      ) {
        throw new FaceStoreError(
          "consent_required",
          "Resume requires an active source, current all-visible consent, and a non-empty allowlist.",
        );
      }
      await db.query(
        `UPDATE face_sources
            SET kill_switch_active=false, kill_switch_reason=$2,
                recognition_enabled=$3, automatic_matching_enabled=$3,
                all_visible_people_consented=$4,
                updated_at=now()
          WHERE id=$1`,
        [sourceId, input.reason, willRecognize, willRecognize],
      );
    } else {
      await db.query(
        `UPDATE face_sources
            SET kill_switch_active=true, kill_switch_reason=$2,
                recognition_enabled=false, automatic_matching_enabled=false,
                live_active=false,
                live_ended_at=CASE WHEN live_started_at IS NULL THEN live_ended_at ELSE now() END,
                active_session_id=NULL,
                all_visible_people_consented=false,
                updated_at=now()
          WHERE id=$1`,
        [sourceId, input.reason],
      );
      await db.query(
        `UPDATE face_jobs
            SET status='cancelled', finished_at=now(), last_error=$2, updated_at=now()
          WHERE source_id=$1 AND status IN ('queued','leased','running')`,
        [sourceId, `Source kill switch: ${input.reason}`],
      );
    }
    await audit(db, context, {
      action: input.active ? "source.kill_switch_activated" : "source.kill_switch_cleared",
      targetType: "face_source",
      targetId: sourceId,
      sourceId,
      before: { active: source.kill_switch_active },
      after: { active: input.active, reason: input.reason },
    });
    return { id: sourceId, killSwitchActive: input.active };
  });
}

type JobRow = {
  id: string;
  source_id: string;
  source_name: string;
  kind: "live_scan" | "archive_scan" | "manual_review";
  status: "queued" | "leased" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  last_error: string | null;
  started_at: string | null;
  updated_at: string;
};

function jobResponse(row: JobRow) {
  const kind = row.kind === "live_scan"
    ? "live_session"
    : row.kind === "manual_review"
      ? "reference_processing"
      : "archive_scan";
  const status = row.status === "succeeded"
    ? "completed"
    : row.status === "leased"
      ? "queued"
      : row.status;
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    kind,
    status,
    progressPercent: row.status === "succeeded" ? 100 : null,
    attempts: Number(row.attempts),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    errorMessage: row.last_error,
  };
}

export async function listFaceJobs(sourceId?: string) {
  const result = await query<JobRow>(
    `SELECT jobs.id::text, jobs.source_id::text, sources.display_name AS source_name,
            jobs.kind, jobs.status, jobs.attempts, jobs.last_error,
            jobs.started_at::text, jobs.updated_at::text
       FROM face_jobs jobs
       JOIN face_sources sources ON sources.id=jobs.source_id
      ${sourceId ? "WHERE jobs.source_id=$1" : ""}
      ORDER BY jobs.created_at DESC
      LIMIT 250`,
    sourceId ? [sourceId] : [],
  );
  return result.rows.map(jobResponse);
}

export async function createFaceJob(
  input: FaceJobCreateInput,
  context: FaceMutationContext,
) {
  try {
    return await withTransaction(async (db) => {
      const sourceResult = await db.query<{
        id: string;
        source_kind: "live" | "archive";
        content_id: string;
        ingest_locator_ref: string | null;
        state: "disabled" | "active" | "archived";
        recognition_enabled: boolean;
        automatic_matching_enabled: boolean;
        all_visible_people_consented: boolean;
        kill_switch_active: boolean;
        live_active: boolean;
        active_session_id: string | null;
        allowed_count: number;
        ready_count: number;
      }>(
        `SELECT sources.id::text, sources.source_kind, sources.content_id, sources.ingest_locator_ref, sources.state,
                sources.recognition_enabled, sources.automatic_matching_enabled,
                sources.all_visible_people_consented, sources.kill_switch_active,
                sources.live_active, sources.active_session_id,
                (SELECT count(*)::int FROM face_source_identities allowed
                  WHERE allowed.source_id=sources.id) AS allowed_count,
                (SELECT count(*)::int FROM face_source_identities allowed
                  WHERE allowed.source_id=sources.id
                    AND EXISTS (
                      SELECT 1 FROM face_template_sets templates
                       WHERE templates.identity_id=allowed.identity_id
                         AND templates.consent_id=allowed.consent_id
                         AND templates.state='active'
                         AND templates.expires_at > now()
                    )) AS ready_count
           FROM face_sources sources WHERE sources.id=$1 FOR UPDATE`,
        [input.sourceId],
      );
      const source = sourceResult.rows[0];
      if (!source) throw new FaceStoreError("not_found", "Face source was not found.");
      if (input.kind === "live_scan") {
        throw new FaceStoreError("invalid_state", "Live scan jobs are disabled for the archive/VOD-only v1 launch.");
      }
      if (source.state !== "active" || source.kill_switch_active) {
        throw new FaceStoreError("invalid_state", "Jobs require an active source with its kill switch clear.");
      }
      if (source.source_kind !== "archive") {
        throw new FaceStoreError("invalid_state", "Every v1 job requires an archive/VOD source.");
      }
      const startMs = input.configuration.startMs;
      const endMs = input.configuration.endMs;
      if (startMs == null || endMs == null) {
        throw new FaceStoreError("invalid_state", "Every v1 job requires a bounded startMs and endMs.");
      }
      if (input.kind !== "manual_review") {
        assertAutomaticMatchingLaunchGate(true);
        if (
          !source.recognition_enabled
          || !source.automatic_matching_enabled
          || !source.all_visible_people_consented
          || Number(source.allowed_count) === 0
          || Number(source.ready_count) !== Number(source.allowed_count)
        ) {
          throw new FaceStoreError(
            "consent_required",
            "Scan jobs require recognition, all-visible consent, and worker-verified templates for every allowlisted identity.",
          );
        }
        const scopeCheck = await db.query<{ all_scoped: boolean }>(
          `SELECT NOT EXISTS (
             SELECT 1 FROM face_source_identities allowed
              WHERE allowed.source_id=$1
                AND NOT EXISTS (
                  SELECT 1 FROM face_consent_archive_scopes scopes
                   WHERE scopes.consent_id=allowed.consent_id
                     AND scopes.content_id=$2
                     AND scopes.start_ms <= $3
                     AND scopes.end_ms >= $4
                )
           ) AS all_scoped`,
          [input.sourceId, source.content_id, startMs, endMs],
        );
        if (!scopeCheck.rows[0]?.all_scoped) {
          throw new FaceStoreError(
            "consent_required",
            "The complete scan interval must fit every allowlisted subject's immutable archive scope.",
          );
        }
      }
      let videoFingerprint: string | null=null;
      if(input.browserReviewId){
        const prepared=await db.query<{video_fingerprint:string;duration_ms:number}>("SELECT video_fingerprint,duration_ms FROM face_browser_reviews WHERE id=$1 AND source_id=$2",[input.browserReviewId,input.sourceId]);
        if(!prepared.rows[0]||endMs>prepared.rows[0].duration_ms)throw new FaceStoreError("conflict","Choose the matching prepared video and a valid interval.");
        videoFingerprint=prepared.rows[0].video_fingerprint;
      }
      const templates=input.kind==="archive_scan" ? (await db.query(`SELECT allowed.identity_id::text,allowed.consent_id::text,templates.template_fingerprint,templates.model_version
        FROM face_source_identities allowed JOIN face_template_sets templates ON templates.identity_id=allowed.identity_id AND templates.consent_id=allowed.consent_id
        WHERE allowed.source_id=$1 AND templates.state='active' AND templates.expires_at>now()
        ORDER BY allowed.identity_id,allowed.consent_id,templates.template_fingerprint,templates.model_version`,[input.sourceId])).rows : [];
      const configuration={startMs,endMs,samplingFps:input.configuration.samplingFps??FACE_DEFAULT_SAMPLING_FPS};
      const processingKey=contentFingerprint({version:FACE_PROCESSING_VERSION,sourceId:input.sourceId,contentId:source.content_id,
        locator:source.ingest_locator_ref,videoFingerprint,kind:input.kind,configuration,templates});
      const existing=await db.query<{id:string;status:JobRow["status"]}>("SELECT id::text,status FROM face_jobs WHERE source_id=$1 AND idempotency_key=$2",[input.sourceId,processingKey]);
      if(existing.rows[0])return{...existing.rows[0],reused:true};
      const created = await db.query<{ id: string }>(
        `INSERT INTO face_jobs
           (source_id, kind, idempotency_key, configuration, requested_by)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         RETURNING id::text`,
        [
          input.sourceId,
          input.kind,
          processingKey,
          JSON.stringify(configuration),
          context.actor.id,
        ],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new FaceStoreError("conflict", "Job could not be queued.");
      await audit(db, context, {
        action: "job.queued",
        targetType: "face_job",
        targetId: id,
        sourceId: input.sourceId,
        after: { kind: input.kind },
      });
      return { id, status: "queued" as const, reused:false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new FaceStoreError("conflict", "That work was already queued. Refresh to reuse its saved result.");
    }
    throw error;
  }
}

export async function updateFaceJob(
  jobId: string,
  input: FaceJobActionInput,
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const result = await db.query<{
      id: string;
      source_id: string;
      status: JobRow["status"];
      attempts: number;
      kind: FaceJobCreateInput["kind"];
    }>(
      `SELECT id::text, source_id::text, status, attempts, kind
         FROM face_jobs WHERE id=$1 FOR UPDATE`,
      [jobId],
    );
    const job = result.rows[0];
    if (!job) throw new FaceStoreError("not_found", "Face job was not found.");
    if (input.action === "cancel") {
      if (!["queued", "leased", "running"].includes(job.status)) {
        throw new FaceStoreError("invalid_state", "Only active jobs can be cancelled.");
      }
      await db.query(
        `UPDATE face_jobs
            SET status='cancelled', finished_at=now(), last_error=$2,
                lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
          WHERE id=$1`,
        [jobId, input.reason],
      );
    } else {
      if (!["failed", "cancelled"].includes(job.status) || Number(job.attempts) >= 20) {
        throw new FaceStoreError("invalid_state", "This job cannot be retried.");
      }
      if(job.kind!=="manual_review")assertAutomaticMatchingLaunchGate(true);
      const permission=await db.query<{authorized:boolean}>("SELECT face_worker_job_is_authorized($1) AS authorized",[jobId]);
      if(!permission.rows[0]?.authorized)throw new FaceStoreError("consent_required","Restore the source and current recording permissions before retrying this job.");
      await db.query(
        `UPDATE face_jobs
            SET status='queued', finished_at=NULL, started_at=NULL, last_error=NULL,
                lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
          WHERE id=$1`,
        [jobId],
      );
    }
    await audit(db, context, {
      action: `job.${input.action}`,
      targetType: "face_job",
      targetId: jobId,
      sourceId: job.source_id,
      before: { status: job.status },
      after: { status: input.action === "cancel" ? "cancelled" : "queued" },
    });
    return { id: jobId };
  });
}

type TrackRow = {
  id: string;
  source_id: string;
  source_name: string;
  content_id: string;
  source_kind: "live" | "archive";
  job_id: string | null;
  identity_id: string | null;
  canonical_kind: FaceCanonicalKind | null;
  canonical_slug: string | null;
  match_method: "manual" | "automatic";
  state: "proposed" | "unknown" | "approved" | "rejected" | "published" | "withdrawn";
  start_ms: string;
  end_ms: string | null;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  similarity_score: number | null;
  similarity_margin: number | null;
  public_confidence_band: "reviewed" | "high" | null;
  first_seen_at: string;
  last_seen_at: string;
  review_note: string | null;
  published_at: string | null;
};

const TRACK_SELECT = `
  SELECT tracks.id::text, tracks.source_id::text,
         sources.display_name AS source_name, sources.content_id, sources.source_kind,
         tracks.job_id::text, tracks.identity_id::text,
         identities.canonical_kind, identities.canonical_slug,
         tracks.match_method, tracks.state, tracks.start_ms::text,
         tracks.end_ms::text, tracks.bbox_x, tracks.bbox_y,
         tracks.bbox_width, tracks.bbox_height, tracks.similarity_score,
         tracks.similarity_margin, tracks.public_confidence_band,
         tracks.first_seen_at::text, tracks.last_seen_at::text,
         tracks.review_note, tracks.published_at::text
    FROM face_tracks tracks
    JOIN face_sources sources ON sources.id=tracks.source_id
    LEFT JOIN face_identities identities ON identities.id=tracks.identity_id`;

function trackAdminResponse(row: TrackRow, guests: FaceGuestProfile[] = []) {
  const profile = row.canonical_kind && row.canonical_slug
    ? canonicalProfile(row.canonical_kind, row.canonical_slug, guests)
    : null;
  const status = row.state === "proposed"
    ? row.identity_id ? "assigned" : "pending"
    : row.state === "withdrawn" ? "rejected" : row.state;
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceKind: row.source_kind,
    contentId: row.content_id,
    occurredAt: row.first_seen_at,
    thumbnailUrl: null,
    candidates: row.identity_id && row.similarity_score != null
      ? [{
          identityId: row.identity_id,
          displayName: profile?.displayName ?? "Consented identity",
          score: Number(row.similarity_score),
        }]
      : [],
    assignedIdentityId: row.identity_id,
    status,
    publishedPresenceId: row.state === "published" ? row.id : null,
    reviewerNote: row.review_note,
    matchMethod: row.match_method,
    startMs: Number(row.start_ms),
    endMs: row.end_ms == null ? null : Number(row.end_ms),
    bbox: row.bbox_x != null && row.bbox_y != null && row.bbox_width != null && row.bbox_height != null
      ? {
          x: Number(row.bbox_x),
          y: Number(row.bbox_y),
          width: Number(row.bbox_width),
          height: Number(row.bbox_height),
        }
      : null,
    reviewHref: reviewHref(row.content_id, Number(row.start_ms)),
    confidenceBand: row.public_confidence_band,
  };
}

function reviewHref(contentId: string, startMs: number): string | null {
  const seconds = Math.max(0, Math.floor(startMs / 1000));
  const youtube = /^yt-([A-Za-z0-9_-]{6,32})$/.exec(contentId);
  if (youtube?.[1]) return `https://www.youtube.com/watch?v=${encodeURIComponent(youtube[1])}&t=${seconds}s`;
  const twitchVod = /^vod-([0-9]{1,30})$/.exec(contentId);
  if (twitchVod) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    return `https://www.twitch.tv/videos/${twitchVod[1]}?t=${hours}h${minutes}m${remaining}s`;
  }
  const twitchClip = /^clip-twitch-([A-Za-z0-9_-]{3,120})$/.exec(contentId);
  if (twitchClip?.[1]) return `https://clips.twitch.tv/${encodeURIComponent(twitchClip[1])}`;
  return null;
}

export async function listFaceTracks(filters: { sourceId?: string; state?: string } = {}) {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (filters.sourceId) {
    params.push(filters.sourceId);
    clauses.push(`tracks.source_id=$${params.length}`);
  }
  if (filters.state) {
    params.push(filters.state);
    clauses.push(`tracks.state=$${params.length}`);
  }
  const result = await query<TrackRow>(
    `${TRACK_SELECT}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY tracks.created_at DESC
      LIMIT 500`,
    params,
  );
  const guests = result.rows.some((row) => row.canonical_kind === "guest") ? await listFaceGuestProfiles() : [];
  return result.rows.map((row) => trackAdminResponse(row, guests));
}

async function consentForTrackIdentity(
  db: Db,
  identityId: string,
  sourceId: string,
  matchMethod: "manual" | "automatic",
  startMs: number,
  endMs: number | null,
): Promise<ConsentRow> {
  const consent = await currentConsent(db, identityId, { forUpdate: true });
  if (!consent || Date.parse(consent.expires_at) <= Date.now()) {
    throw new FaceStoreError("consent_required", "Current adult consent is required for this identity.");
  }
  const source = await db.query<{ content_id: string; source_kind: "live" | "archive" }>(
    `SELECT content_id, source_kind FROM face_sources WHERE id=$1`,
    [sourceId],
  );
  const contentId = source.rows[0]?.content_id;
  if (source.rows[0]?.source_kind !== "archive" || endMs == null) {
    throw new FaceStoreError(
      "invalid_state",
      "Identity matching and tagging are archive/VOD-only in v1 and require a finite interval.",
    );
  }
  if (!contentId || !consent.approved_content_ids.includes(contentId)) {
    throw new FaceStoreError(
      "consent_required",
      "This source content ID is outside the subject's immutable consent scope.",
    );
  }
  const scoped = await db.query<{ permitted: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM face_consent_archive_scopes scopes
        WHERE scopes.consent_id=$1
          AND scopes.content_id=$2
          AND scopes.start_ms <= $3
          AND scopes.end_ms >= $4
     ) AS permitted`,
    [consent.id, contentId, startMs, endMs],
  );
  if (!scoped.rows[0]?.permitted) {
    throw new FaceStoreError(
      "consent_required",
      "The complete track interval is outside the subject's immutable archive scope.",
    );
  }
  if (matchMethod === "automatic") {
    const allow = await db.query<{ allowed: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM face_source_identities
          WHERE source_id=$1 AND identity_id=$2 AND consent_id=$3
       ) AS allowed`,
      [sourceId, identityId, consent.id],
    );
    if (!allow.rows[0]?.allowed) {
      throw new FaceStoreError("consent_required", "Automatic candidates must be in the source allowlist.");
    }
  }
  return consent;
}

export async function createManualFaceTrack(
  input: FaceTrackCreateInput,
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const source = await db.query<{
      id: string;
      state: string;
      source_kind: "live" | "archive";
    }>(
      `SELECT id::text, state, source_kind FROM face_sources WHERE id=$1 FOR UPDATE`,
      [input.sourceId],
    );
    if (!source.rows[0]) throw new FaceStoreError("not_found", "Face source was not found.");
    if (source.rows[0].state === "archived") {
      throw new FaceStoreError("invalid_state", "Archived sources cannot receive tracks.");
    }
    if (source.rows[0].source_kind === "archive" && input.endMs == null) {
      throw new FaceStoreError("invalid_state", "Archive tracks require a finite endMs.");
    }
    const consent = input.identityId
      ? await consentForTrackIdentity(db, input.identityId, input.sourceId, "manual", input.startMs, input.endMs ?? null)
      : null;
    const box = input.bbox ?? null;
    let markerKey: string | null=null;
    if(input.browserReviewId){
      const project=await db.query<{duration_ms:number}>("SELECT duration_ms FROM face_browser_reviews WHERE id=$1 AND source_id=$2 FOR SHARE",[input.browserReviewId,input.sourceId]);
      if(!project.rows[0]||input.endMs==null||input.endMs>project.rows[0].duration_ms||input.jobId)throw new FaceStoreError("conflict","This mark must belong to the prepared source video and its duration.");
      markerKey=contentFingerprint({identity:input.identityId??null,consent:consent?.id??null,start:input.startMs,end:input.endMs,box});
      const saved=await db.query<{id:string;state:string}>(`SELECT tracks.id::text,tracks.state FROM face_browser_marks marks JOIN face_tracks tracks ON tracks.id=marks.track_id
        WHERE marks.review_id=$1 AND marks.marker_key=$2`,[input.browserReviewId,markerKey]);
      if(saved.rows[0])return{...saved.rows[0],reused:true};
    }
    const created = await db.query<{ id: string }>(
      `INSERT INTO face_tracks
         (source_id, job_id, identity_id, consent_id, match_method,
          start_ms, end_ms, bbox_x, bbox_y, bbox_width, bbox_height)
       VALUES ($1,$2,$3,$4,'manual',$5,$6,$7,$8,$9,$10)
       RETURNING id::text`,
      [
        input.sourceId,
        input.jobId ?? null,
        input.identityId ?? null,
        consent?.id ?? null,
        input.startMs,
        input.endMs ?? null,
        box?.x ?? null,
        box?.y ?? null,
        box?.width ?? null,
        box?.height ?? null,
      ],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new FaceStoreError("conflict", "Track could not be created.");
    if(input.browserReviewId&&markerKey)await db.query("INSERT INTO face_browser_marks(review_id,marker_key,track_id) VALUES ($1,$2,$3)",[input.browserReviewId,markerKey,id]);
    await audit(db, context, {
      action: "track.proposed_manual",
      targetType: "face_track",
      targetId: id,
      identityId: input.identityId ?? null,
      sourceId: input.sourceId,
      after: { startMs: input.startMs, endMs: input.endMs ?? null },
    });
    return { id, state: "proposed" as const };
  });
}

export async function prepareBrowserVideoReview(input:z.infer<typeof BrowserVideoReviewInput>,context:FaceMutationContext){
  return withTransaction(async(db)=>{
    const source=await db.query<{state:string;source_kind:string}>("SELECT state,source_kind FROM face_sources WHERE id=$1 FOR UPDATE",[input.sourceId]);
    if(!source.rows[0]||source.rows[0].source_kind!=="archive"||source.rows[0].state==="archived")throw new FaceStoreError("invalid_state","Choose an available archive source for this video.");
    const inserted=await db.query<{id:string}>(`INSERT INTO face_browser_reviews(source_id,video_fingerprint,fingerprint_algorithm,byte_size,duration_ms,file_name,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_id,video_fingerprint,fingerprint_algorithm) DO NOTHING RETURNING id::text`,
      [input.sourceId,input.fingerprint,input.algorithm,input.byteSize,input.durationMs,input.fileName,context.actor.id]);
    const project=(await db.query<{id:string;video_fingerprint:string;byte_size:string;duration_ms:number}>("SELECT id::text,video_fingerprint,byte_size::text,duration_ms FROM face_browser_reviews WHERE source_id=$1 AND video_fingerprint=$2 AND fingerprint_algorithm=$3",[input.sourceId,input.fingerprint,input.algorithm])).rows[0]!;
    if(Number(project.byte_size)!==input.byteSize||Math.abs(project.duration_ms-input.durationMs)>1000)throw new FaceStoreError("conflict","The saved video fingerprint has different file metadata. Prepare the correct file again.");
    const markers=(await db.query<{id:string;identityId:string|null;startMs:number;endMs:number;status:string}>(`SELECT tracks.id::text,tracks.identity_id::text AS "identityId",tracks.start_ms::float8 AS "startMs",tracks.end_ms::float8 AS "endMs",tracks.state AS status
      FROM face_browser_marks marks JOIN face_tracks tracks ON tracks.id=marks.track_id WHERE marks.review_id=$1 ORDER BY tracks.start_ms,tracks.id`,[project.id])).rows;
    if(inserted.rowCount)await audit(db,context,{action:"browser_review.prepared",targetType:"face_browser_review",targetId:project.id,sourceId:input.sourceId,after:{videoFingerprint:input.fingerprint,videoUploaded:false,workerStarted:false}});
    return{id:project.id,sourceId:input.sourceId,fingerprint:project.video_fingerprint,durationMs:project.duration_ms,reused:!inserted.rowCount,markers};
  });
}

export async function reviewFaceTrack(
  trackId: string,
  input: FaceTrackActionInput,
  context: FaceMutationContext,
) {
  return withTransaction(async (db) => {
    const result = await db.query<TrackRow>(
      `${TRACK_SELECT} WHERE tracks.id=$1 FOR UPDATE OF tracks`,
      [trackId],
    );
    const track = result.rows[0];
    if (!track) throw new FaceStoreError("not_found", "Face track was not found.");
    if (input.action === "assign") {
      if (!["proposed", "unknown"].includes(track.state)) {
        throw new FaceStoreError("invalid_state", "Only a private proposed track can be assigned.");
      }
      const consent = await consentForTrackIdentity(
        db,
        input.identityId,
        track.source_id,
        track.match_method,
        Number(track.start_ms),
        track.end_ms == null ? null : Number(track.end_ms),
      );
      await db.query(
        `UPDATE face_tracks
            SET state='proposed', identity_id=$2, consent_id=$3,
                reviewed_by=$4, reviewed_at=now(), review_note=$5,
                source_moment_verified=false, public_confidence_band=NULL, updated_at=now()
          WHERE id=$1`,
        [trackId, input.identityId, consent.id, context.actor.id, input.note ?? null],
      );
    } else if (input.action === "unknown") {
      if (track.state === "published") {
        throw new FaceStoreError("invalid_state", "Unpublish the track before marking it unknown.");
      }
      await db.query(
        `UPDATE face_tracks
            SET state='unknown', identity_id=NULL, consent_id=NULL,
                reviewed_by=$2, reviewed_at=now(), review_note=$3,
                source_moment_verified=false, public_confidence_band=NULL, updated_at=now()
          WHERE id=$1`,
        [trackId, context.actor.id, input.note ?? null],
      );
    } else if (input.action === "approve") {
      if (track.state !== "proposed") {
        throw new FaceStoreError("invalid_state", "Only a proposed assignment can be approved.");
      }
      const identityId = input.identityId ?? track.identity_id;
      if (!identityId) throw new FaceStoreError("invalid_state", "Assign a consented identity first.");
      if (!reviewHref(track.content_id, Number(track.start_ms))) {
        throw new FaceStoreError(
          "invalid_state",
          "Approval is disabled until the exact source moment has an inspectable protected or canonical review link.",
        );
      }
      const consent = await consentForTrackIdentity(
        db,
        identityId,
        track.source_id,
        track.match_method,
        Number(track.start_ms),
        track.end_ms == null ? null : Number(track.end_ms),
      );
      if (
        input.confidenceBand === "high"
        && (
          track.match_method !== "automatic"
          || Number(track.similarity_score ?? 0) < 0.85
          || Number(track.similarity_margin ?? 0) < 0.08
        )
      ) {
        throw new FaceStoreError("invalid_state", "The private high-confidence gates were not met.");
      }
      await db.query(
        `UPDATE face_tracks
            SET state='approved', identity_id=$2, consent_id=$3,
                reviewed_by=$4, reviewed_at=now(), review_note=$5,
                source_moment_verified=true, public_confidence_band=$6, updated_at=now()
          WHERE id=$1`,
        [trackId, identityId, consent.id, context.actor.id, input.note ?? null, input.confidenceBand],
      );
    } else if (input.action === "reject") {
      if (track.state === "published") {
        throw new FaceStoreError("invalid_state", "Unpublish the track before rejecting it.");
      }
      await db.query(
        `UPDATE face_tracks
            SET state='rejected', reviewed_by=$2, reviewed_at=now(),
                review_note=$3, source_moment_verified=false,
                public_confidence_band=NULL, updated_at=now()
          WHERE id=$1`,
        [trackId, context.actor.id, input.reason],
      );
    } else if (input.action === "publish") {
      if (track.state !== "approved" || !track.identity_id) {
        throw new FaceStoreError("invalid_state", "A separate human approval is required before publishing.");
      }
      if (!reviewHref(track.content_id, Number(track.start_ms))) {
        throw new FaceStoreError(
          "invalid_state",
          "Publishing is disabled until the exact source moment has an inspectable protected or canonical review link.",
        );
      }
      const consent = await consentForTrackIdentity(
        db,
        track.identity_id,
        track.source_id,
        track.match_method,
        Number(track.start_ms),
        track.end_ms == null ? null : Number(track.end_ms),
      );
      if (!consent.allow_public_tag || !consent.allow_profile_links) {
        throw new FaceStoreError("consent_required", "Public tag and profile-link consent are required.");
      }
      if (!facePresencePublicIsEnabled()) {
        throw new FaceStoreError(
          "invalid_state",
          "Public face presence is deployment-gated; approval remains private.",
        );
      }
      if (track.source_kind === "archive" && track.end_ms == null) {
        throw new FaceStoreError("invalid_state", "Archive presence requires a finite reviewed interval.");
      }
      await db.query(
        `UPDATE face_tracks
            SET state='published', published_by=$2, published_at=now(), updated_at=now()
          WHERE id=$1`,
        [trackId, context.actor.id],
      );
    } else {
      await db.query(
        `UPDATE face_tracks
            SET state='withdrawn', withdrawn_by=$2, withdrawn_at=now(),
                review_note=COALESCE($3,review_note), updated_at=now()
          WHERE id=$1`,
        [trackId, context.actor.id, input.reason],
      );
    }
    const nextState = input.action === "assign"
      ? "proposed"
      : input.action === "unknown"
        ? "unknown"
        : input.action === "withdraw"
          ? "withdrawn"
          : input.action === "publish"
            ? "published"
            : input.action === "approve"
              ? "approved"
              : "rejected";
    await audit(db, context, {
      action: `track.${input.action}`,
      targetType: "face_track",
      targetId: trackId,
      identityId: input.action === "assign" ? input.identityId : track.identity_id,
      sourceId: track.source_id,
      before: { state: track.state },
      after: { state: nextState },
    });
    return { id: trackId, state: nextState };
  });
}

type PublicPresenceRow = {
  track_id: string;
  identity_id: string;
  canonical_kind: FaceCanonicalKind;
  canonical_slug: string;
  start_ms: string;
  end_ms: string | null;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  confidence_band: "reviewed" | "high";
};

export async function getPublicFacePresence(
  contentId: string,
  atMs: number | null,
): Promise<PublicFacePresenceResponse> {
  const params: unknown[] = [contentId];
  let scope: string;
  if (atMs == null) {
    scope = `source_kind='live' AND live_active AND end_ms IS NULL
      AND last_seen_at >= now() - interval '${FACE_LIVE_FRESHNESS_SECONDS} seconds'`;
  } else {
    params.push(atMs);
    scope = `source_kind='archive' AND start_ms <= $2 AND end_ms > $2`;
  }
  const result = await query<PublicPresenceRow>(
    `SELECT DISTINCT ON (identity_id) track_id::text, identity_id::text, canonical_kind, canonical_slug,
            start_ms::text, end_ms::text, bbox_x, bbox_y, bbox_width, bbox_height,
            confidence_band
       FROM face_presence_public_safe
      WHERE content_id=$1 AND ${scope}
      ORDER BY identity_id, start_ms DESC, track_id
      LIMIT 12`,
    params,
  );
  const guests = result.rows.some((row) => row.canonical_kind === "guest") ? await listFaceGuestProfiles() : [];
  const tags: PublicFacePresenceTag[] = result.rows.flatMap((row) => {
    const profile = canonicalProfile(row.canonical_kind, row.canonical_slug, guests);
    if (!profile) return [];
    const startMs = Number(row.start_ms);
    const endMs = row.end_ms == null ? null : Number(row.end_ms);
    const hasBox = row.bbox_x != null
      && row.bbox_y != null
      && row.bbox_width != null
      && row.bbox_height != null;
    return [{
      trackId: row.track_id,
      identityId: row.identity_id,
      displayName: profile.displayName,
      profileHref: profile.profileHref,
      avatarUrl: profile.avatarUrl,
      socialLinks: safeSocialLinks(profile.socialLinks),
      bbox: hasBox
        ? {
            x: Number(row.bbox_x),
            y: Number(row.bbox_y),
            width: Number(row.bbox_width),
            height: Number(row.bbox_height),
          }
        : null,
      startMs,
      endMs,
      confidenceBand: row.confidence_band,
    } satisfies PublicFacePresenceTag];
  });
  return { contentId, atMs, tags };
}

type AuditRow = {
  id: string;
  actor_email: string | null;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  after_state: Record<string, unknown> | null;
  created_at: string;
};

type WorkerHeartbeatRow = {
  worker_id: string;
  analyzer_version: string;
  automatic_capable: boolean;
  enrollment_capable: boolean;
  model_version: string | null;
  status: "healthy" | "stopping" | "error";
  error_message: string | null;
  last_heartbeat_at: string;
  ready_template_count: number;
};

function faceConsentUi(consent: ReturnType<typeof identityResponse>["currentConsent"]) {
  if (!consent) {
    return {
      status: "missing" as const,
      adultConfirmed: false,
      subjectConfirmedAt: null,
      confirmationMethod: null,
      evidenceReference: null,
      expiresAt: null,
      revokedAt: null,
      templateCreation: false,
      liveMatching: false,
      archiveMatching: false,
      publicTagging: false,
      socialLinking: false,
      approvedContentIds: [] as string[],
      approvedArchiveScopes: [] as Array<{ contentId: string; startMs: number; endMs: number }>,
    };
  }
  const status = consent.revokedAt
    ? "revoked"
    : consent.expiresAt && Date.parse(consent.expiresAt) <= Date.now()
      ? "expired"
      : "active";
  return {
    status,
    adultConfirmed: consent.subjectConfirmedAdult,
    subjectConfirmedAt: consent.adultVerifiedAt,
    confirmationMethod: consent.captureMethod,
    evidenceReference: consent.evidenceReference,
    expiresAt: consent.expiresAt,
    revokedAt: consent.revokedAt,
    templateCreation: consent.permissions.allowTemplateCreation,
    liveMatching: consent.permissions.allowLiveMatching,
    archiveMatching: consent.permissions.allowArchiveMatching,
    publicTagging: consent.permissions.allowPublicTag,
    socialLinking: consent.permissions.allowProfileLinks,
    approvedContentIds: consent.approvedContentIds,
    approvedArchiveScopes: consent.approvedArchiveScopes,
  };
}

export async function queueFaceEnrollment(identityId: string, context: FaceMutationContext) {
  if (process.env.FACE_ANALYZER_ENABLED !== "true") throw new FaceStoreError("conflict", "Enrollment is not enabled yet.");
  return withTransaction(async (db) => {
    const identity = await db.query(`SELECT id, canonical_kind, canonical_slug FROM face_identities WHERE id=$1 AND state='active' FOR UPDATE`, [identityId]);
    if (!identity.rows[0]) throw new FaceStoreError("not_found", "Save active permission for this person first.");
    await assertGuestProfileReviewed(db, identity.rows[0].canonical_kind, identity.rows[0].canonical_slug);
    const existing = await db.query(`SELECT id FROM face_enrollment_jobs WHERE identity_id=$1 AND state IN ('queued','running')`, [identityId]);
    if (existing.rows[0]) return { id: existing.rows[0].id,status:"queued" as const,reused:true };
    const consent = await db.query(`SELECT id FROM face_consents WHERE identity_id=$1 AND revoked_at IS NULL AND expires_at>now()
      AND subject_confirmed_adult AND allow_template_creation`, [identityId]);
    if (!consent.rows[0]) throw new FaceStoreError("consent_required", "Current permission to create face templates is required.");
    const references = await db.query<{id:string;content_sha256:string}>(`SELECT DISTINCT ON (content_sha256) id,content_sha256 FROM face_reference_assets
      WHERE identity_id=$1 AND consent_id=$2 AND state='approved' AND subject_approved AND revoked_at IS NULL
        AND face_reference_review_is_valid(id) AND retention_expires_at>now()
        AND storage_key ~ '^[0-9a-f-]{36}\\.webp$' ORDER BY content_sha256,created_at DESC LIMIT 20`, [identityId,consent.rows[0].id]);
    if (references.rows.length<3) throw new FaceStoreError("consent_required", "Upload at least 3 different photos and record independent or authorized owner approval before enrollment.");
    const ready=await db.query<{id:string}>(`SELECT id::text FROM face_template_sets WHERE identity_id=$1 AND consent_id=$2 AND state='active' AND expires_at>now()
      AND model_name='opencv_sface' AND model_version=$3 AND reference_hashes @> $4::text[] AND reference_hashes <@ $4::text[] LIMIT 1`,
      [identityId,consent.rows[0].id,FACE_ENROLLMENT_MODEL_VERSION,references.rows.map(r=>r.content_sha256)]);
    if(ready.rows[0])return{status:"ready" as const,reused:true,templateSetId:ready.rows[0].id};
    if(!faceWorkerWakeConfigured()){
      const worker = await db.query(`SELECT 1 FROM face_worker_heartbeats WHERE status='healthy' AND enrollment_capable AND last_heartbeat_at>now()-interval '90 seconds' LIMIT 1`);
      if (!worker.rows[0]) throw new FaceStoreError("conflict", "The enrollment service is temporarily unavailable. Try again shortly.");
    }
    const result = await db.query<{id:string}>(`INSERT INTO face_enrollment_jobs(identity_id,consent_id,reference_ids,requested_by)
      VALUES ($1,$2,$3::uuid[],$4) RETURNING id`, [identityId,consent.rows[0].id,references.rows.map(r=>r.id),context.actor.id]);
    const id = result.rows[0]!.id;
    await audit(db,context,{action:"face.enrollment.queued",targetType:"face_enrollment_job",targetId:id,identityId,after:{referenceCount:references.rows.length}});
    return {id,status:"queued" as const,reused:false};
  });
}

export async function faceWorkerHasPendingWork(){
  // The web probe must also see authorized jobs while the worker heartbeat is
  // asleep. The restricted worker probe separately checks its live capabilities.
  const result=await query<{pending:boolean}>(`SELECT
    EXISTS(SELECT 1 FROM face_enrollment_jobs WHERE state IN ('queued','running'))
    OR EXISTS(SELECT 1 FROM face_jobs WHERE status IN ('queued','leased','running') AND attempts<20 AND face_worker_job_is_authorized(id))
    OR EXISTS(SELECT 1 FROM face_template_sets WHERE worker_id=$1 AND state<>'purged' AND (state<>'active' OR expires_at<=now())) AS pending`,[process.env.FACE_WORK_QUEUE_WORKER_ID??"azure-enrollment-01"]);
  return result.rows[0]?.pending===true;
}

export async function getFaceOwnerPhotoReviewAllowed(actorId:string){
  const result=await query<{allowed:boolean}>("SELECT face_owner_photo_review_is_allowed($1) AS allowed",[actorId]);
  return result.rows[0]?.allowed===true;
}

export async function getFaceAdminOverview(actorId?:string) {
  const [identities, references, sources, jobs, reviews, publishedRows, auditRows, heartbeatRows, guests, photoCandidates] = await Promise.all([
    listFaceIdentities(),
    listFaceReferences(),
    listFaceSources(),
    listFaceJobs(),
    listFaceTracks(),
    query<TrackRow>(
      `${TRACK_SELECT} WHERE tracks.state='published'
        AND EXISTS (
          SELECT 1 FROM face_presence_public_safe public_rows
           WHERE public_rows.track_id=tracks.id
        )
        ORDER BY tracks.published_at DESC NULLS LAST LIMIT 250`,
    ),
    query<AuditRow>(
      `SELECT id::text, actor_email, actor_id, action, target_type, target_id,
              after_state, created_at::text
         FROM face_audit_log
        ORDER BY created_at DESC, id DESC
        LIMIT 250`,
    ),
    query<WorkerHeartbeatRow>(
      `SELECT heartbeats.worker_id, heartbeats.analyzer_version,
              heartbeats.automatic_capable, heartbeats.enrollment_capable, heartbeats.model_version, heartbeats.status,
              heartbeats.error_message, heartbeats.last_heartbeat_at::text,
              (SELECT COALESCE(sum(templates.template_count),0)::int
                 FROM face_template_sets templates
                 JOIN face_consents consents
                   ON consents.id=templates.consent_id
                  AND consents.identity_id=templates.identity_id
                WHERE templates.worker_id=heartbeats.worker_id
                  AND templates.model_name='opencv_sface'
                  AND templates.model_version=heartbeats.model_version
                  AND templates.state='active'
                  AND templates.expires_at > now()
                  AND consents.revoked_at IS NULL
                  AND consents.expires_at > now()) AS ready_template_count
         FROM face_worker_heartbeats heartbeats
        ORDER BY (
          heartbeats.automatic_capable
          AND heartbeats.status='healthy'
          AND heartbeats.last_heartbeat_at >= now() - interval '90 seconds'
        ) DESC,
        heartbeats.last_heartbeat_at DESC
        LIMIT 1`,
    ),
    listFaceGuestProfiles(),
    listFacePhotoCandidates(),
  ]);

  const referencesByIdentity = new Map<string, typeof references>();
  for (const reference of references) {
    const rows = referencesByIdentity.get(reference.identityId) ?? [];
    rows.push(reference);
    referencesByIdentity.set(reference.identityId, rows);
  }

  const enrollmentJobs = await query<{identity_id:string;id:string;state:string;error_code:string|null;updated_at:string}>(
    `SELECT DISTINCT ON (identity_id) identity_id,id,state,error_code,updated_at::text FROM face_enrollment_jobs ORDER BY identity_id,created_at DESC,id DESC`);
  const enrollmentByIdentity = new Map(enrollmentJobs.rows.map(row=>[row.identity_id,row]));
  const uiIdentities = identities.map((identity) => {
    const enrollmentJob = enrollmentByIdentity.get(identity.id);
    const consent = faceConsentUi(identity.currentConsent);
    const enrollmentStatus = identity.state === "revoked" || consent.status === "revoked"
      ? "revoked"
      : identity.state !== "active" || consent.status !== "active"
        ? "suspended"
        : identity.counts.templates > 0
          ? "ready"
          : identity.counts.references > 0
            ? "pending"
            : "not_enrolled";
    return {
      id: identity.id,
      canonicalKey: `${identity.canonicalKind}:${identity.canonicalSlug}`,
      displayName: identity.displayName,
      templateCount: identity.counts.templates,
      enrollmentStatus,
      consent,
      references: referencesByIdentity.get(identity.id) ?? [],
      enrollmentJob: enrollmentJob ? {id:enrollmentJob.id,status:enrollmentJob.state,errorCode:enrollmentJob.error_code,updatedAt:enrollmentJob.updated_at} : null,
      updatedAt: identity.updatedAt,
    };
  });

  const published = publishedRows.rows.flatMap((row) => {
    if (!row.identity_id || !row.canonical_kind || !row.canonical_slug) return [];
    const profile = canonicalProfile(row.canonical_kind, row.canonical_slug, guests);
    if (!profile) return [];
    return [{
      id: row.id,
      identityId: row.identity_id,
      displayName: profile.displayName,
      canonicalKey: `${row.canonical_kind}:${row.canonical_slug}`,
      sourceName: row.source_name,
      startedAt: row.first_seen_at,
      endedAt: row.end_ms == null ? null : row.last_seen_at,
      public: true,
      profileHref: profile.profileHref,
      socialLinks: profile.socialLinks,
    }];
  });

  const audit = auditRows.rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor_email ?? row.actor_id,
    targetLabel: `${row.target_type}:${row.target_id}`,
    reason: typeof row.after_state?.reason === "string" ? row.after_state.reason : null,
    createdAt: row.created_at,
  }));

  const analyzerEnabled = process.env.FACE_ANALYZER_ENABLED === "true";
  const automaticEnabled = faceAutomaticMatchingIsEnabled();
  const heartbeat = heartbeatRows.rows[0] ?? null;
  const activeTemplateCount = Number(heartbeat?.ready_template_count ?? 0);
  const heartbeatAt = heartbeat ? Date.parse(heartbeat.last_heartbeat_at) : Number.NaN;
  const heartbeatFresh = heartbeat?.status === "healthy"
    && Number.isFinite(heartbeatAt)
    && heartbeatAt >= Date.now() - 90_000;
  const readinessReasons: string[] = [];
  if (!analyzerEnabled) {
    readinessReasons.push("The local analyzer is disabled; consent, references, manual review, and source controls remain available.");
  }
  if (activeTemplateCount === 0) {
    readinessReasons.push("No worker-verified local template set is active.");
  }
  if (!automaticEnabled) {
    readinessReasons.push("Automatic archive matching remains deployment-gated.");
  }
  if (!heartbeat) {
    readinessReasons.push("No worker heartbeat has been registered.");
  } else if (!heartbeatFresh) {
    readinessReasons.push(`The latest worker heartbeat is stale or ${heartbeat.status}.`);
  } else if (!heartbeat.automatic_capable) {
    readinessReasons.push("The live worker is manual/purge-only and has not attested a verified biometric model.");
  }
  const serviceReady = analyzerEnabled
    && automaticEnabled
    && activeTemplateCount > 0
    && heartbeatFresh
    && heartbeat?.automatic_capable === true;
  return {
    apiVersion: "2026-08-21",
    ownerPhotoReviewAllowed:actorId?await getFaceOwnerPhotoReviewAllowed(actorId):false,
    service: {
      status: serviceReady ? "ready" as const : analyzerEnabled ? "degraded" as const : "offline" as const,
      message: serviceReady ? null : faceWorkerWakeConfigured()&&!heartbeatFresh
        ? "Processing sleeps when idle to save cost. An approved queued request starts the worker; cold starts may take a minute. Video matching stays off until its checks are complete."
        : analyzerEnabled && heartbeatFresh && heartbeat?.enrollment_capable
        ? "Enrollment service is online. Add a person, record permission, and have a second admin approve their photos. Video matching remains off until footage testing is complete."
        : readinessReasons.join(" "),
      analyzerVersion: heartbeat?.analyzer_version ?? process.env.FACE_ANALYZER_VERSION ?? null,
      lastHeartbeatAt: heartbeat?.last_heartbeat_at ?? null,
    },
    counts: {
      consentedAdults: uiIdentities.filter((identity) => identity.consent.status === "active" && identity.consent.adultConfirmed).length,
      enrolled: uiIdentities.filter((identity) => identity.enrollmentStatus === "ready").length,
      pendingReview: reviews.filter((review) => review.status === "pending" || review.status === "assigned").length,
      activeSources: sources.filter((source) => source.status === "running").length,
      published: published.length,
    },
    identities: uiIdentities,
    people: facePeople(guests),
    photoCandidates,
    sources,
    jobs,
    reviews,
    published,
    audit,
  };
}

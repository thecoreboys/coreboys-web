export const FACE_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;
export const FACE_REFERENCE_PENDING_REVIEW_MS = 7 * 24 * 60 * 60 * 1000;
export const FACE_REFERENCE_APPROVED_RETENTION_MS = 24 * 60 * 60 * 1000;
export const FACE_CONSENT_MAX_TERM_MS = 366 * 24 * 60 * 60 * 1000;
export const FACE_CONSENT_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const FACE_LIVE_FRESHNESS_SECONDS = 30;

export type FaceConsentPermissions = {
  allowTemplateCreation: boolean;
  allowLiveMatching: boolean;
  allowArchiveMatching: boolean;
  allowPublicTag: boolean;
  allowProfileLinks: boolean;
};

export function faceConsentPermissionsAreCoherent(
  permissions: FaceConsentPermissions,
): boolean {
  const anyPermission = Object.values(permissions).some(Boolean);
  if (!anyPermission) return false;
  if (permissions.allowLiveMatching) return false;
  if (
    (permissions.allowLiveMatching || permissions.allowArchiveMatching)
    && !permissions.allowTemplateCreation
  ) {
    return false;
  }
  if (permissions.allowPublicTag && !permissions.allowProfileLinks) return false;
  return true;
}

export function faceConsentTermIsSafe(
  adultVerifiedAt: string,
  expiresAt: string,
  nowMs = Date.now(),
): boolean {
  const verifiedMs = Date.parse(adultVerifiedAt);
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(verifiedMs) || !Number.isFinite(expiryMs)) return false;
  if (verifiedMs > nowMs + 5 * 60 * 1000) return false;
  if (verifiedMs < nowMs - FACE_CONSENT_EVIDENCE_MAX_AGE_MS) return false;
  if (expiryMs <= verifiedMs) return false;
  return expiryMs > nowMs && expiryMs <= nowMs + FACE_CONSENT_MAX_TERM_MS;
}

export function faceSourceConfigurationIsSafe(input: {
  automaticMatchingEnabled: boolean;
  allVisiblePeopleConsented: boolean;
  allowedIdentityCount: number;
}): boolean {
  if (!input.automaticMatchingEnabled) return true;
  return input.allVisiblePeopleConsented && input.allowedIdentityCount > 0;
}

export function facePresencePublicIsEnabled(
  value = process.env.FACE_PRESENCE_PUBLIC_ENABLED,
): boolean {
  return value === "true";
}

export function faceAutomaticMatchingIsEnabled(
  value = process.env.FACE_AUTOMATIC_MATCHING_ENABLED,
): boolean {
  return value === "true";
}

export function faceReferenceUploadsAreEnabled(
  value = process.env.FACE_REFERENCE_UPLOADS_ENABLED,
): boolean {
  return value === "true";
}

export function parseFacePresenceAtMs(value: string | null): number | null | undefined {
  if (value == null || value === "") return null;
  if (!/^\d{1,15}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

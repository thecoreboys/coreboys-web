import assert from "node:assert/strict";
import test from "node:test";
import {
  FaceConsentGrantSchema,
  FaceJobCreateSchema,
  FaceSafeIngestLocatorRefSchema,
  FaceSourceCreateSchema,
  FaceTrackActionSchema,
  FaceWatchContentIdSchema,
} from "../lib/face-recognition-contracts";
import {
  faceAutomaticMatchingIsEnabled,
  faceConsentPermissionsAreCoherent,
  faceConsentTermIsSafe,
  facePresencePublicIsEnabled,
  faceReferenceUploadsAreEnabled,
  faceSourceConfigurationIsSafe,
  parseFacePresenceAtMs,
} from "../lib/face-recognition-policy";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const baseConsent = {
  consentVersion: "face-consent-v1",
  captureMethod: "subject_portal" as const,
  evidenceRef: "release-42",
  consentTextSha256: "a".repeat(64),
  subjectConfirmedAdult: true as const,
  adultVerifiedAt: "2026-08-21T11:55:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  permissions: {
    allowTemplateCreation: true,
    allowLiveMatching: false,
    allowArchiveMatching: true,
    allowPublicTag: false,
    allowProfileLinks: false,
  },
  approvedContentIds: ["vod-123"],
  approvedArchiveScopes: [{ contentId: "vod-123", startMs: 0, endMs: 60_000 }],
};

test("face feature gates fail closed unless the value is exactly true", () => {
  for (const gate of [facePresencePublicIsEnabled, faceAutomaticMatchingIsEnabled, faceReferenceUploadsAreEnabled]) {
    assert.equal(gate(undefined), false);
    assert.equal(gate("TRUE"), false);
    assert.equal(gate("1"), false);
    assert.equal(gate("true"), true);
  }
});

test("consent purposes, evidence timing, expiry, and exact source scope are coherent", () => {
  assert.equal(faceConsentPermissionsAreCoherent(baseConsent.permissions), true);
  assert.equal(faceConsentTermIsSafe(baseConsent.adultVerifiedAt, baseConsent.expiresAt, NOW), true);
  assert.equal(faceConsentTermIsSafe("2025-01-01T00:00:00Z", baseConsent.expiresAt, NOW), false);
  assert.equal(FaceConsentGrantSchema.safeParse(baseConsent).success, true);
  assert.equal(FaceConsentGrantSchema.safeParse({ ...baseConsent, approvedContentIds: [] }).success, false);
  assert.equal(FaceConsentGrantSchema.safeParse({ ...baseConsent, approvedArchiveScopes: [] }).success, false);
  assert.equal(FaceConsentGrantSchema.safeParse({
    ...baseConsent,
    permissions: { ...baseConsent.permissions, allowLiveMatching: true },
  }).success, false);
  assert.equal(FaceConsentGrantSchema.safeParse({ ...baseConsent, captureMethod: "recorded_verbal" }).success, false);
  assert.equal(FaceConsentGrantSchema.safeParse({
    ...baseConsent,
    permissions: { ...baseConsent.permissions, allowPublicTag: true, allowProfileLinks: false },
  }).success, false);
});

test("Watch IDs and protected locator references reject URLs, controls, wildcards, and traversal", () => {
  assert.equal(FaceWatchContentIdSchema.safeParse("yt-demo_123").success, true);
  for (const value of ["*", "https://youtube.com/watch", "two words", "bad\nkey"]) {
    assert.equal(FaceWatchContentIdSchema.safeParse(value).success, false);
  }
  assert.equal(FaceSafeIngestLocatorRefSchema.safeParse("secret:faces/ron-live").success, true);
  assert.equal(FaceSafeIngestLocatorRefSchema.safeParse(`file-ref:${"a".repeat(491)}`).success, true);
  assert.equal(FaceSafeIngestLocatorRefSchema.safeParse(`file-ref:${"a".repeat(492)}`).success, false);
  for (const value of ["rtmp://host/key", "secret:faces/../admin", "file-ref:../secret", "env:KEY?token=x"]) {
    assert.equal(FaceSafeIngestLocatorRefSchema.safeParse(value).success, false);
  }
});

test("automatic source matching requires a fresh all-visible assertion and nonempty allowlist", () => {
  assert.equal(faceSourceConfigurationIsSafe({ automaticMatchingEnabled: false, allVisiblePeopleConsented: false, allowedIdentityCount: 0 }), true);
  assert.equal(faceSourceConfigurationIsSafe({ automaticMatchingEnabled: true, allVisiblePeopleConsented: false, allowedIdentityCount: 1 }), false);
  assert.equal(FaceSourceCreateSchema.safeParse({
    contentId: "live-ron", displayName: "Controlled Ron feed", provider: "mediamtx",
    sourceKind: "live", ingestLocatorRef: "mediamtx:faces/ron", state: "active",
    allVisiblePeopleConsented: false, automaticMatchingEnabled: true,
    allowedIdentityIds: ["11111111-1111-4111-8111-111111111111"],
  }).success, false);
});

test("track approval records explicit source-moment verification", () => {
  assert.equal(FaceTrackActionSchema.safeParse({ action: "approve", confidenceBand: "reviewed" }).success, false);
  assert.equal(FaceTrackActionSchema.safeParse({ action: "approve", sourceMomentVerified: true, confidenceBand: "reviewed" }).success, true);
  assert.equal(parseFacePresenceAtMs(null), null);
  assert.equal(parseFacePresenceAtMs("1200"), 1200);
  assert.equal(parseFacePresenceAtMs("-1"), undefined);
});

test("every archive-only v1 worker job is explicitly time-bounded", () => {
  const baseJob = {
    sourceId: "11111111-1111-4111-8111-111111111111",
    kind: "manual_review" as const,
    idempotencyKey: "manual-job-123",
    configuration: { startMs: 0, endMs: 60_000 },
  };
  assert.equal(FaceJobCreateSchema.safeParse(baseJob).success, true);
  assert.equal(FaceJobCreateSchema.safeParse({
    ...baseJob,
    configuration: { startMs: 0 },
  }).success, false);
  assert.equal(FaceJobCreateSchema.safeParse({
    ...baseJob,
    kind: "live_scan",
  }).success, false);
});

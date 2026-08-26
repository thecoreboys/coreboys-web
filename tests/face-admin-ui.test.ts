import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import { EMPTY_FACE_OVERVIEW, normalizeFaceOverview } from "../components/admin/faces/types.ts";

test("face admin overview uses reported service state and counts", () => {
  const normalized = normalizeFaceOverview({
    overview: {
      apiVersion: "v1",
      service: {
        status: "ready",
        message: null,
        analyzerVersion: "opencv-local-1",
        lastHeartbeatAt: "2026-08-21T12:00:00.000Z",
      },
      counts: {
        consentedAdults: 3,
        enrolled: 2,
        pendingReview: 7,
        activeSources: 1,
        published: 0,
      },
      identities: [],
      sources: [],
      jobs: [],
      reviews: [],
      published: [],
      audit: [],
    },
  });

  assert.equal(normalized.service.status, "ready");
  assert.equal(normalized.counts.pendingReview, 7);
  assert.equal(normalized.identities.length, 0);
  assert.equal(normalized.sources.length, 0);
});

test("face admin overview fails closed for absent or invalid data", () => {
  assert.deepEqual(normalizeFaceOverview(null), EMPTY_FACE_OVERVIEW);
  const malformed = normalizeFaceOverview({
    service: { status: "pretend-ready" },
    counts: { enrolled: -5, pendingReview: "8" },
    identities: "all canonical portraits",
  });
  assert.equal(malformed.service.status, "offline");
  assert.equal(malformed.counts.enrolled, 0);
  assert.equal(malformed.counts.pendingReview, 0);
  assert.deepEqual(malformed.identities, []);
});

test("face admin page is consent-first and contains no legacy AWS enrollment path", () => {
  const page = readFileSync(join(process.cwd(), "app/admin/faces/page.tsx"), "utf8");
  const controlRoom = readFileSync(
    join(process.cwd(), "components/admin/faces/FaceRecognitionControlRoom.tsx"),
    "utf8",
  );

  assert.doesNotMatch(page, /AWS_|Rekognition|IndexFaces|SearchFacesByImage/);
  assert.match(page, /Canonical profile photos[\s\S]*never training data/);
  assert.match(controlRoom, /The subject confirmed they are 18 or older/);
  assert.match(controlRoom, /recording the subject's own, specific choice/);
  assert.match(controlRoom, /profile photos shown here are not enrollment assets/);
  assert.match(controlRoom, /There is no bulk approve or auto-publish control/);
});

test("face admin provides separate safety, review, publish, revocation, and deletion actions", () => {
  const controlRoom = readFileSync(
    join(process.cwd(), "components/admin/faces/FaceRecognitionControlRoom.tsx"),
    "utf8",
  );

  assert.match(controlRoom, /\/kill-switch/);
  assert.match(controlRoom, /allowedIdentityIds/);
  assert.match(controlRoom, /"assign" \| "unknown" \| "approve" \| "reject" \| "publish" \| "unpublish"/);
  assert.match(controlRoom, /\/consent\/revoke/);
  assert.match(controlRoom, /Delete templates and references/);
  assert.match(controlRoom, /approval never publishes a tag automatically/i);
});

test("face source creation is admin-usable but always starts safely disabled", () => {
  const controlRoom = readFileSync(
    join(process.cwd(), "components/admin/faces/FaceRecognitionControlRoom.tsx"),
    "utf8",
  );

  assert.match(controlRoom, /title="Create a safe source"/);
  assert.match(controlRoom, /"\/sources",\s*"POST"/);
  assert.match(controlRoom, /contentId: normalizedContentId/);
  assert.match(controlRoom, /state: "disabled"/);
  assert.match(controlRoom, /allVisiblePeopleConsented: false/);
  assert.match(controlRoom, /automaticMatchingEnabled: false/);
  assert.match(controlRoom, /allowedIdentityIds: \[\]/);
  assert.match(controlRoom, /\^\(env\|secret\|mediamtx\|file-ref\)/);
  assert.match(controlRoom, /never paste a stream URL, key, or secret/);
  assert.match(controlRoom, /\(\^\|\[:\/\]\)\\\.\{1,2\}/);
});

test("face admin deep-normalizes nested data and rejects unsafe preview URLs", () => {
  const malformed = normalizeFaceOverview({
    overview: {
      apiVersion: "v1",
      service: { status: "ready", message: null, analyzerVersion: null, lastHeartbeatAt: null },
      counts: { consentedAdults: 1, enrolled: 1, pendingReview: 0, activeSources: 0, published: 0 },
      identities: [{
        id: "11111111-1111-4111-8111-111111111111",
        canonicalKey: "member:ron",
        displayName: "Ron",
        templateCount: 1,
        enrollmentStatus: "ready",
        consent: {
          status: "active", adultConfirmed: true, subjectConfirmedAt: "2026-08-21T12:00:00Z",
          confirmationMethod: "subject_portal", evidenceReference: "release-1",
          expiresAt: "2027-01-01T00:00:00Z", revokedAt: null,
          templateCreation: true, liveMatching: true, archiveMatching: false,
          publicTagging: false, socialLinking: false, approvedContentIds: ["live-ron"],
          approvedArchiveScopes: [{ contentId: "live-ron", startMs: 0, endMs: 1000 }],
        },
        references: [{
          id: "22222222-2222-4222-8222-222222222222", fileName: "safe.webp",
          sourceKind: "subject_provided", capturedAt: null, createdAt: "2026-08-21T12:00:00Z",
          status: "pending_review", subjectApproved: true, qualityIssues: [],
          previewUrl: "https://evil.invalid/private.webp", uploadedBy: "admin-1",
          reviewedBy: null, reviewNote: null,
        }],
        updatedAt: "2026-08-21T12:00:00Z",
      }],
      sources: [], jobs: [], reviews: [], published: [], audit: [],
    },
  });
  assert.deepEqual(malformed, EMPTY_FACE_OVERVIEW);
});

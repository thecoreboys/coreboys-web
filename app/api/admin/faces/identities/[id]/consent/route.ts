import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { FaceConsentGrantSchema, FaceWatchContentIdSchema } from "@/lib/face-recognition-contracts";
import {
  facePrivateJson,
  facePrivateResponse,
  faceRequestId,
  faceStoreErrorResponse,
} from "@/lib/face-recognition-http";
import {
  createFaceIdentity,
  findFaceIdentityByCanonical,
  listFaceIdentities,
  replaceFaceIdentityConsent,
} from "@/lib/face-recognition-store";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const UiConsent = z.object({
  canonicalKey: z.string().regex(/^(member|crew):[a-z0-9][a-z0-9-]{0,79}$/),
  adultConfirmed: z.literal(true),
  subjectConfirmed: z.literal(true),
  confirmationMethod: z.enum(["signed_release", "subject_portal"]),
  subjectConfirmedAt: z.string().datetime({ offset: true }),
  evidenceReference: z.string().trim().min(3).max(500).refine((value) => !value.includes("://")),
  expiresAt: z.string().datetime({ offset: true }),
  approvedContentIds: z.array(FaceWatchContentIdSchema).max(100),
  approvedArchiveScopes: z.array(z.object({
    contentId: FaceWatchContentIdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  }).strict().refine((scope) => scope.endMs > scope.startMs)).max(100),
  purposes: z.object({
    templateCreation: z.boolean(),
    liveMatching: z.boolean(),
    archiveMatching: z.boolean(),
    publicTagging: z.boolean(),
    socialLinking: z.boolean(),
  }).strict(),
  replaceActiveConsent: z.boolean().default(false),
}).strict();

const CONSENT_TEXT = "CORE closed-set face presence v1: adult subject authorizes only the individually selected template-creation, bounded archive/VOD matching, public-tag, and canonical profile-link purposes for the exact content IDs and time intervals recorded with this grant; live matching is not authorized in v1, and consent is revocable at any time.";
const CONSENT_TEXT_SHA256 = createHash("sha256").update(CONSENT_TEXT).digest("hex");

function canonicalKey(value: string) {
  const [kind, slug] = value.split(":") as ["member" | "crew", string];
  return { kind, slug };
}

export async function PUT(request: Request, { params }: Context) {
  if (!requestHasSameOrigin(request)) return facePrivateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return facePrivateResponse(auth.response);
  const target = decodeURIComponent((await params).id);
  const parsed = UiConsent.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return facePrivateJson({ error: "invalid direct-consent record", detail: parsed.error.flatten() }, 400);
  const canonical = canonicalKey(parsed.data.canonicalKey);
  const consent = FaceConsentGrantSchema.safeParse({
    consentVersion: "face-consent-v1",
    captureMethod: parsed.data.confirmationMethod,
    evidenceRef: parsed.data.evidenceReference,
    consentTextSha256: CONSENT_TEXT_SHA256,
    subjectConfirmedAdult: true,
    adultVerifiedAt: parsed.data.subjectConfirmedAt,
    expiresAt: parsed.data.expiresAt,
    permissions: {
      allowTemplateCreation: parsed.data.purposes.templateCreation,
      allowLiveMatching: parsed.data.purposes.liveMatching,
      allowArchiveMatching: parsed.data.purposes.archiveMatching,
      allowPublicTag: parsed.data.purposes.publicTagging,
      allowProfileLinks: parsed.data.purposes.socialLinking,
    },
    approvedContentIds: parsed.data.approvedContentIds,
    approvedArchiveScopes: parsed.data.approvedArchiveScopes,
  });
  if (!consent.success) return facePrivateJson({ error: "inconsistent consent purposes", detail: consent.error.flatten() }, 422);
  const mutation = { actor: auth, requestId: faceRequestId(request) };
  try {
    let identity = await findFaceIdentityByCanonical(canonical.kind, canonical.slug);
    if (/^[0-9a-f-]{36}$/i.test(target)) {
      const targetIdentity = (await listFaceIdentities(target))[0];
      if (!targetIdentity || targetIdentity.id !== identity?.id) {
        return facePrivateJson({ error: "identity does not match canonical profile" }, 409);
      }
      identity = targetIdentity;
    } else if (target !== parsed.data.canonicalKey) {
      return facePrivateJson({ error: "canonical target mismatch" }, 409);
    }
    const hasActiveConsent = Boolean(
      identity?.currentConsent
      && !identity.currentConsent.revokedAt
      && identity.currentConsent.expiresAt
      && Date.parse(identity.currentConsent.expiresAt) > Date.now(),
    );
    if (hasActiveConsent && !parsed.data.replaceActiveConsent) {
      return facePrivateJson({
        error: "active consent replacement requires explicit confirmation",
        code: "replacement_confirmation_required",
      }, 409);
    }
    const result = identity
      ? await replaceFaceIdentityConsent(
          identity.id,
          consent.data,
          parsed.data.replaceActiveConsent,
          mutation,
        )
      : await createFaceIdentity({
          canonicalKind: canonical.kind,
          canonicalSlug: canonical.slug,
          consent: consent.data,
        }, mutation);
    return facePrivateJson({ ok: true, ...result }, identity ? 200 : 201);
  } catch (error) {
    return faceStoreErrorResponse(error);
  }
}

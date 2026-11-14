/** Object-level evidence only: omission from a profile/page is never a deletion. */
export type VerifiableProvider = "instagram" | "tiktok";
export type ContentVerificationCandidate = {
  canonicalId: string;
  provider: VerifiableProvider;
  sourceUrl: string;
};
export type ContentVerificationTarget = ContentVerificationCandidate & {
  providerId: string;
  endpoint: string;
  apiVersion: "v1" | "v2";
};
export type ContentVerificationOutcome = "found" | "not_found" | "unknown" | "invalid";
export type ContentVerificationResponse = {
  status: string;
  body: unknown;
  budgetDenied?: boolean;
  providerRequestMade: boolean;
  committedCredits: number;
};

const MAX_OBJECT_CHECKS = 2;

export function contentVerificationTarget(candidate: ContentVerificationCandidate): ContentVerificationTarget | null {
  try {
    const url = new URL(candidate.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
    if (candidate.provider === "instagram" && host === "instagram.com") {
      const id = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(url.pathname)?.[1];
      if (!id) return null;
      return { ...candidate, providerId: id, sourceUrl: `https://www.instagram.com/p/${id}/`,
        endpoint: `/instagram/media/${encodeURIComponent(id)}`, apiVersion: "v2" };
    }
    if (candidate.provider === "tiktok" && host === "tiktok.com") {
      const match = /^\/@([A-Za-z0-9._]{1,64})\/(video|photo)\/(\d{8,30})\/?$/.exec(url.pathname);
      if (!match) return null;
      const sourceUrl = `https://www.tiktok.com/@${match[1]!.toLowerCase()}/${match[2]}/${match[3]}`;
      return { ...candidate, providerId: match[3]!, sourceUrl,
        endpoint: `/tiktok/videos?url=${encodeURIComponent(sourceUrl)}`, apiVersion: "v1" };
    }
  } catch { /* Invalid persisted links must never become provider requests. */ }
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Both documented object endpoints distinguish found/not_found in a successful envelope. */
export function contentVerificationOutcome(response: ContentVerificationResponse): ContentVerificationOutcome {
  if (response.status !== "ok" || response.budgetDenied) return "unknown";
  const body = record(response.body);
  const data = record(body?.data);
  if (!body || !data || body.success === false || data.success === false
    || body.error || body.errors || body.dataError || data.error || data.errors || data.dataError) return "unknown";
  return data.lookupStatus === "found" ? "found" : data.lookupStatus === "not_found" ? "not_found" : "unknown";
}

export type ContentVerificationResult = {
  status: "disabled" | "not_due" | "completed" | "failed";
  checked: number;
  removed: number;
  unknown: number;
  providerRequests: number;
  committedCredits: number;
};
export type ContentVerificationDependencies = {
  configured: () => boolean;
  claim: () => Promise<string | null>;
  seed: () => Promise<void>;
  due: (limit: number) => Promise<ContentVerificationCandidate[]>;
  lookup: (target: ContentVerificationTarget) => Promise<ContentVerificationResponse>;
  remove: (target: ContentVerificationTarget) => Promise<unknown>;
  checked: (candidate: ContentVerificationCandidate, outcome: ContentVerificationOutcome) => Promise<void>;
  release: (token: string) => Promise<void>;
};

/** Small fixed service-wide batch; viewer/subscriber counts cannot increase provider work. */
export function createContentAvailabilityReconciler(dependencies: ContentVerificationDependencies) {
  return async (): Promise<ContentVerificationResult> => {
    const result: ContentVerificationResult = { status: "disabled", checked: 0, removed: 0, unknown: 0, providerRequests: 0, committedCredits: 0 };
    if (!dependencies.configured()) return result;
    let token: string | null = null;
    try {
      token = await dependencies.claim();
      if (!token) return { ...result, status: "not_due" };
      await dependencies.seed();
      const candidates = await dependencies.due(MAX_OBJECT_CHECKS);
      for (const candidate of candidates.slice(0, MAX_OBJECT_CHECKS)) {
        const target = contentVerificationTarget(candidate);
        let outcome: ContentVerificationOutcome = "invalid";
        if (target) {
          try {
            const response = await dependencies.lookup(target);
            result.providerRequests += response.providerRequestMade ? 1 : 0;
            result.committedCredits += Number.isFinite(response.committedCredits) ? Math.max(0, response.committedCredits) : 0;
            outcome = contentVerificationOutcome(response);
            if (outcome === "not_found") {
              await dependencies.remove(target);
              result.removed++;
            }
          } catch { outcome = "unknown"; }
        }
        await dependencies.checked(candidate, outcome);
        result.checked++;
        if (outcome === "unknown" || outcome === "invalid") result.unknown++;
      }
      return { ...result, status: "completed" };
    } catch {
      return { ...result, status: "failed" };
    } finally {
      if (token) await dependencies.release(token).catch(() => undefined);
    }
  };
}

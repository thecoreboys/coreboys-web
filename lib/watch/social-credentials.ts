import "server-only";

import { normalizeCreatorSocialHandle } from "@/lib/watch/social-account-ref";
import {
  creatorHandleForMappedProviderUserId,
  normalizeCreatorProviderUserId,
  parseCreatorTokenMap,
} from "@/lib/watch/social-credential-map";

export type IngestProvider = "tiktok" | "instagram";

export type SocialCredential = {
  accessToken: string;
  username: string;
  providerUserId?: string;
  /** Creator credentials live only in server-side deployment configuration. */
  source: "env";
  /** Instagram Login uses graph.instagram.com; Facebook Login uses graph.facebook.com. */
  instagramApi?: "instagram" | "facebook";
};

export type SocialCredentialState =
  | "ready"
  | "invalid_account_ref"
  | "not_configured";

export type SocialCredentialResolution = {
  provider: IngestProvider;
  /** Normalized public handle only. Never contains a token or provider id. */
  handle: string;
  state: SocialCredentialState;
  credential: SocialCredential | null;
};

export type SocialCredentialDiagnostic = Omit<SocialCredentialResolution, "credential"> & {
  source: SocialCredential["source"] | null;
};

function parsedEnvMap(provider: IngestProvider) {
  const raw = process.env[
    provider === "tiktok" ? "TIKTOK_ACCOUNT_TOKENS_JSON" : "INSTAGRAM_ACCOUNT_TOKENS_JSON"
  ];
  return parseCreatorTokenMap(provider, raw).entries;
}

function fromEnvMap(provider: IngestProvider, handle: string): SocialCredential | null {
  const map = parsedEnvMap(provider);
  const entry = map.get(handle);
  if (!entry) return null;
  return {
    accessToken: entry.accessToken,
    username: handle,
    providerUserId: entry.providerUserId,
    source: "env",
    instagramApi: provider === "instagram" ? entry.instagramApi : undefined,
  };
}

/** Backwards-compatible single-account variables, gated by an exact handle. */
function fromLegacyEnv(provider: IngestProvider, handle: string): SocialCredential | null {
  const configuredHandle = normalizeCreatorSocialHandle(
    provider,
    process.env[provider === "tiktok" ? "TIKTOK_ACCOUNT_HANDLE" : "INSTAGRAM_ACCOUNT_HANDLE"] ?? "",
  );
  if (!configuredHandle || configuredHandle !== handle) return null;
  const accessToken = process.env[
    provider === "tiktok" ? "TIKTOK_ACCESS_TOKEN" : "INSTAGRAM_TOKEN"
  ]?.trim();
  if (!accessToken) return null;
  const instagramApi = process.env.INSTAGRAM_API_MODE?.trim().toLowerCase() === "facebook"
    ? "facebook"
    : "instagram";
  const providerUserId = provider === "instagram"
    ? normalizeCreatorProviderUserId(process.env.INSTAGRAM_USER_ID)
    : null;
  if (provider === "instagram" && instagramApi === "facebook" && !providerUserId) return null;
  return {
    accessToken,
    username: handle,
    providerUserId: providerUserId ?? undefined,
    source: "env",
    instagramApi: provider === "instagram" ? instagramApi : undefined,
  };
}

/**
 * Match a signed provider webhook to an explicitly configured creator source.
 * Viewer connections are never consulted here; only a server-side account map
 * can authorize a public-feed update.
 */
export function creatorHandleForProviderUserId(
  provider: IngestProvider,
  rawProviderUserId: unknown,
): string | null {
  const providerUserId = normalizeCreatorProviderUserId(rawProviderUserId);
  if (!providerUserId) return null;

  const mapped = creatorHandleForMappedProviderUserId(parsedEnvMap(provider), providerUserId);
  if (mapped) return mapped;

  if (
    provider === "instagram"
    && normalizeCreatorProviderUserId(process.env.INSTAGRAM_USER_ID) === providerUserId
  ) {
    const handle = normalizeCreatorSocialHandle(
      provider,
      process.env.INSTAGRAM_ACCOUNT_HANDLE ?? "",
    );
    return handle || null;
  }
  return null;
}

/**
 * Resolve a creator account token without ever exposing it to client code.
 * Viewer OAuth is intentionally excluded: a viewer connecting a personal
 * account must never make that account a public CORE content source.
 */
export async function socialCredentialFor(
  provider: IngestProvider,
  rawHandle: string,
): Promise<SocialCredential | null> {
  return (await resolveSocialCredential(provider, rawHandle)).credential;
}

/**
 * Resolve a creator grant and retain a safe reason when it cannot be used.
 * The source is deliberately limited to the server-side token maps declared
 * by the operator for the fixed CORE roster.
 */
export async function resolveSocialCredential(
  provider: IngestProvider,
  rawHandle: string,
): Promise<SocialCredentialResolution> {
  const handle = normalizeCreatorSocialHandle(provider, rawHandle);
  if (!handle) {
    return { provider, handle: "", state: "invalid_account_ref", credential: null };
  }

  const environment = fromEnvMap(provider, handle) ?? fromLegacyEnv(provider, handle);
  if (environment) {
    return { provider, handle, state: "ready", credential: environment };
  }

  return { provider, handle, state: "not_configured", credential: null };
}

/** A token-free diagnostic safe for admin/operator status responses. */
export async function socialCredentialDiagnosticFor(
  provider: IngestProvider,
  rawHandle: string,
): Promise<SocialCredentialDiagnostic> {
  const result = await resolveSocialCredential(provider, rawHandle);
  return {
    provider: result.provider,
    handle: result.handle,
    state: result.state,
    source: result.credential?.source ?? null,
  };
}

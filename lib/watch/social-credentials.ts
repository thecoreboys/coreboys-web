import "server-only";

import { normalizeCreatorSocialHandle } from "@/lib/watch/social-account-ref";

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

type EnvEntry =
  | string
  | {
      accessToken?: string;
      token?: string;
      /** TikTok open_id or Instagram professional-account id for webhooks. */
      userId?: string;
      openId?: string;
      api?: "instagram" | "facebook";
    };

function parsedEnvMap(provider: IngestProvider): Record<string, EnvEntry> {
  const raw = process.env[
    provider === "tiktok" ? "TIKTOK_ACCOUNT_TOKENS_JSON" : "INSTAGRAM_ACCOUNT_TOKENS_JSON"
  ];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, EnvEntry>;
  } catch {
    return {};
  }
}

function fromEnvMap(provider: IngestProvider, handle: string): SocialCredential | null {
  const map = parsedEnvMap(provider);
  const pair = Object.entries(map).find(
    ([key]) => normalizeCreatorSocialHandle(provider, key) === handle,
  );
  if (!pair) return null;
  const entry = pair[1];
  const token = typeof entry === "string" ? entry : entry.accessToken ?? entry.token;
  if (!token?.trim()) return null;
  return {
    accessToken: token.trim(),
    username: handle,
    providerUserId: typeof entry === "string" ? undefined : entry.userId,
    source: "env",
    instagramApi: provider === "instagram" && typeof entry !== "string"
      ? entry.api ?? "instagram"
      : provider === "instagram"
        ? "instagram"
        : undefined,
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
  const instagramApi = process.env.INSTAGRAM_API_MODE === "facebook" ? "facebook" : "instagram";
  return {
    accessToken,
    username: handle,
    providerUserId: provider === "instagram" ? process.env.INSTAGRAM_USER_ID : undefined,
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
  rawProviderUserId: string | null | undefined,
): string | null {
  const providerUserId = rawProviderUserId?.trim();
  if (!providerUserId) return null;

  for (const [rawHandle, entry] of Object.entries(parsedEnvMap(provider))) {
    if (typeof entry === "string") continue;
    const configuredId = provider === "tiktok"
      ? entry.openId ?? entry.userId
      : entry.userId;
    const handle = normalizeCreatorSocialHandle(provider, rawHandle);
    if (configuredId?.trim() === providerUserId && handle) return handle;
  }

  if (
    provider === "instagram"
    && process.env.INSTAGRAM_USER_ID?.trim() === providerUserId
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

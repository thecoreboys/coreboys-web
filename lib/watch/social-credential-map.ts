import {
  normalizeCreatorSocialHandle,
  type CreatorSocialProvider,
} from "@/lib/watch/social-account-ref";

export type CreatorTokenMapEntry = {
  accessToken: string;
  providerUserId?: string;
  instagramApi?: "instagram" | "facebook";
};

export type ParsedCreatorTokenMap = {
  entries: ReadonlyMap<string, CreatorTokenMapEntry>;
  /** False when any row was malformed or two raw keys resolved to one handle. */
  valid: boolean;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/** Provider ids are opaque, but never accept lossy numbers or control data. */
export function normalizeCreatorProviderUserId(value: unknown): string | null {
  const id = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : "";
  return id && id.length <= 300 && !/[\s\u0000-\u001f\u007f]/.test(id) ? id : null;
}

function aliasedString(
  row: JsonRecord,
  keys: readonly string[],
  normalize: (value: unknown) => string | null,
): { valid: boolean; value?: string } {
  const values = new Set<string>();
  for (const key of keys) {
    if (!(key in row)) continue;
    const raw = row[key];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) continue;
    const value = normalize(raw);
    if (!value) return { valid: false };
    values.add(value);
  }
  if (values.size > 1) return { valid: false };
  return { valid: true, value: values.values().next().value };
}

function accessToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseEntry(
  provider: CreatorSocialProvider,
  value: unknown,
): CreatorTokenMapEntry | null {
  if (typeof value === "string") {
    const token = accessToken(value);
    return token
      ? {
          accessToken: token,
          instagramApi: provider === "instagram" ? "instagram" : undefined,
        }
      : null;
  }

  const row = record(value);
  if (!row) return null;
  const token = aliasedString(row, ["accessToken", "access_token", "token"], accessToken);
  if (!token.valid || !token.value) return null;

  const idKeys = provider === "tiktok"
    ? ["openId", "open_id", "providerUserId", "userId", "user_id"] as const
    : ["providerUserId", "userId", "user_id"] as const;
  const providerId = aliasedString(row, idKeys, normalizeCreatorProviderUserId);
  if (!providerId.valid) return null;

  if (provider === "tiktok") {
    return {
      accessToken: token.value,
      providerUserId: providerId.value,
    };
  }

  const rawApi = row.api;
  const instagramApi = rawApi === undefined || rawApi === null || rawApi === ""
    ? "instagram"
    : typeof rawApi === "string" && /^(instagram|facebook)$/i.test(rawApi.trim())
      ? rawApi.trim().toLowerCase() as "instagram" | "facebook"
      : null;
  // Facebook Graph media reads require the professional Instagram account id.
  if (!instagramApi || (instagramApi === "facebook" && !providerId.value)) return null;
  return {
    accessToken: token.value,
    providerUserId: providerId.value,
    instagramApi,
  };
}

/**
 * Parse an operator-owned creator map without ever returning partial or
 * ambiguous rows. Provider response aliases are accepted so a token response
 * can be copied into the map without renaming secret-bearing fields.
 */
export function parseCreatorTokenMap(
  provider: CreatorSocialProvider,
  raw: string | null | undefined,
): ParsedCreatorTokenMap {
  if (!raw?.trim()) return { entries: new Map(), valid: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: new Map(), valid: false };
  }
  const source = record(parsed);
  if (!source) return { entries: new Map(), valid: false };

  const entries = new Map<string, CreatorTokenMapEntry>();
  const ambiguousHandles = new Set<string>();
  let valid = true;
  for (const [rawHandle, rawEntry] of Object.entries(source)) {
    const handle = normalizeCreatorSocialHandle(provider, rawHandle);
    const entry = parseEntry(provider, rawEntry);
    if (!handle || !entry || ambiguousHandles.has(handle)) {
      valid = false;
      continue;
    }
    if (entries.has(handle)) {
      // `@name` and a profile URL can normalize to the same account. Refuse
      // both instead of depending on JSON property order to choose a token.
      entries.delete(handle);
      ambiguousHandles.add(handle);
      valid = false;
      continue;
    }
    entries.set(handle, entry);
  }
  return { entries, valid };
}

/** Resolve a signed webhook id only when it identifies one configured source. */
export function creatorHandleForMappedProviderUserId(
  entries: ReadonlyMap<string, CreatorTokenMapEntry>,
  rawProviderUserId: unknown,
): string | null {
  const providerUserId = normalizeCreatorProviderUserId(rawProviderUserId);
  if (!providerUserId) return null;
  const matches = [...entries.entries()].filter(([, entry]) => entry.providerUserId === providerUserId);
  return matches.length === 1 ? matches[0]![0] : null;
}

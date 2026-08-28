const X_ARCHIVE_CURSOR_MAX_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type XSocialArchiveCursor = {
  publishedAt: string;
  eventId: string;
};

function normalizedCursor(value: unknown): XSocialArchiveCursor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const publishedAt = (value as { publishedAt?: unknown }).publishedAt;
  const eventId = (value as { eventId?: unknown }).eventId;
  if (typeof publishedAt !== "string" || typeof eventId !== "string") return null;
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published) || !UUID_PATTERN.test(eventId)) return null;
  return {
    publishedAt: new Date(published).toISOString(),
    eventId: eventId.toLowerCase(),
  };
}

/** Opaque public cursor for the stable `(published_at,id)` archive order. */
export function encodeXSocialArchiveCursor(cursor: XSocialArchiveCursor): string {
  const normalized = normalizedCursor(cursor);
  if (!normalized) throw new Error("invalid_x_social_archive_cursor");
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

/** Invalid or oversized public cursor input is rejected before it reaches SQL. */
export function decodeXSocialArchiveCursor(value: string | null | undefined): XSocialArchiveCursor | null {
  const encoded = value?.trim() ?? "";
  if (!encoded || encoded.length > X_ARCHIVE_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return null;
  }
  try {
    return normalizedCursor(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

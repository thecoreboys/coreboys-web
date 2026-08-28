export type TikTokCursor = string | number;

export type TikTokCursorPage<T> = {
  items: readonly T[];
  cursor?: TikTokCursor | null;
  hasMore: boolean;
};

export type TikTokCursorCollection<T> = {
  items: T[];
  pages: number;
  /** A later page may fail after usable newer items have already been read. */
  error?: unknown;
};

/**
 * Read TikTok's newest-first cursor pages with a strict request bound.
 * Duplicate rows and repeated cursors are ignored so a malformed upstream
 * response cannot loop forever or crowd newer videos out of the requested
 * window.
 */
export async function collectTikTokCursorPages<T extends { id?: string }>(
  limit: number,
  loadPage: (cursor: TikTokCursor | undefined, pageSize: number) => Promise<TikTokCursorPage<T>>,
  maxPages = 5,
): Promise<TikTokCursorCollection<T>> {
  const target = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const pageLimit = Number.isFinite(maxPages) ? Math.max(0, Math.floor(maxPages)) : 0;
  if (target === 0 || pageLimit === 0) return { items: [], pages: 0 };

  const items: T[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: TikTokCursor | undefined;
  let pages = 0;

  while (items.length < target && pages < pageLimit) {
    let page: TikTokCursorPage<T>;
    try {
      page = await loadPage(cursor, Math.min(20, target - items.length));
    } catch (error) {
      return { items, pages, error };
    }
    pages += 1;

    for (const item of page.items) {
      const id = item.id?.trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      items.push(item);
      if (items.length === target) break;
    }

    if (items.length >= target || !page.hasMore || page.cursor == null) break;
    const cursorKey = String(page.cursor);
    if (seenCursors.has(cursorKey)) break;
    seenCursors.add(cursorKey);
    cursor = page.cursor;
  }

  return { items, pages };
}

/** Only retry Instagram media reads when Graph rejected a field selection. */
export function isInstagramFieldSelectionError(status: number, payload: unknown): boolean {
  if (status !== 400 || !payload || typeof payload !== "object") return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const code = Number((error as { code?: unknown }).code);
  const message = String((error as { message?: unknown }).message ?? "");
  return code === 100 && /(?:field|children).*(?:unknown|unsupported|invalid|does not exist|nonexisting)|(?:unknown|unsupported|invalid|does not exist|nonexisting).*field/i.test(message);
}

/** Page already-ranked results without dropping later archive matches. */
export function paginateWatchSearch<T>(items: readonly T[], offset: number, limit: number): { results: T[]; nextOffset: number | null } {
  const start = Math.max(0, Math.trunc(offset));
  const size = Math.max(1, Math.trunc(limit));
  const results = items.slice(start, start + size);
  return { results, nextOffset: start + results.length < items.length ? start + results.length : null };
}

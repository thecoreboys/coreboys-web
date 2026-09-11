/** Saved IDs and queue entries are exact references, regardless of archive age. */
export function dvrItemReferences(saved: readonly string[], queues: readonly unknown[]): string[] {
  const queueIds = queues.flatMap((queue): unknown[] => {
    if (!queue || typeof queue !== "object" || !Array.isArray((queue as { itemIds?: unknown }).itemIds)) return [];
    return (queue as { itemIds: unknown[] }).itemIds;
  });
  return [...new Set([...saved, ...queueIds].filter((ref): ref is string =>
    typeof ref === "string" && ref.length > 0 && ref.length <= 200))];
}

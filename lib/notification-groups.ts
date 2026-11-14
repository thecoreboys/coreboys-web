import type { InboxNotification } from "./inbox-notification";

export function groupInboxNotifications(items: readonly InboxNotification[]) {
  const groups: Array<{ key: string; items: InboxNotification[] }> = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    // Use explicit author identity or the same destination. Shared fallback
    // avatars and similar titles must not merge unrelated creators.
    const identity = item.xPost?.authorProfileUrl || item.href;
    const key = item.category === "creator"
      ? `${identity}:${item.createdAt.slice(0, 10)}`
      : item.id;
    const existing = byKey.get(key);
    if (existing) existing.items.push(item);
    else {
      const group = { key, items: [item] };
      byKey.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}

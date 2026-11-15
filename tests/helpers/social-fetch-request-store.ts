import type { SocialFetchRequestStore } from "../../lib/social-fetch-request-cache";

/** Shared fake database; multiple independent runners can use the same rows. */
export function createTestSocialFetchRequestStore() {
  let now = 0;
  const rows = new Map<string, { token: string | null; leaseUntil: number; expires: number; value?: unknown }>();
  const store: SocialFetchRequestStore = {
    async read(key) {
      const row = rows.get(key);
      return row && row.expires > now && row.value !== undefined ? { value: structuredClone(row.value) } : null;
    },
    async claim(key, token) {
      const row = rows.get(key);
      if (row && (row.expires > now || row.leaseUntil > now)) return false;
      rows.set(key, { token, leaseUntil: now + 120_000, expires: now });
      return true;
    },
    async complete(key, token, value, ttl) {
      const row = rows.get(key);
      if (row?.token !== token) return;
      rows.set(key, { token: null, leaseUntil: 0, expires: now + ttl * 1_000, value: structuredClone(value) });
    },
  };
  return { store, advance: (milliseconds: number) => { now += milliseconds; } };
}

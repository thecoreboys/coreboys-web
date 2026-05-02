"use client";

import useSWR from "swr";

type Resp = { profiles: Record<string, string>; fetchedAt: string };

const fetcher = (u: string) => fetch(u).then((r) => r.json() as Promise<Resp>);

/**
 * Returns a `{ login → profile_image_url }` map for every member,
 * fetched from `/api/twitch/profiles` (cached 1h on the edge).
 *
 * Components should treat the absence of an entry as "not loaded yet"
 * and fall back to a static portrait until the lookup resolves.
 */
export function useTwitchProfiles() {
  const { data } = useSWR<Resp>("/api/twitch/profiles", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return data?.profiles ?? {};
}

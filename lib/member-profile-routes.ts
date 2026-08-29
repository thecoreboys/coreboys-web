export type RouteSearchParams = Record<string, string | string[] | undefined>;

/** Build a safe legacy-member redirect while retaining bookmarked query state. */
export function legacyMemberRedirectTarget(
  slug: string,
  destination: "profile" | "numbers",
  searchParams: RouteSearchParams = {},
): string {
  // The channel is the canonical member home. Keep the standalone analytics
  // route under its existing profile namespace until it is folded into the
  // channel dashboard.
  const path = destination === "profile"
    ? `/channels/${encodeURIComponent(slug)}`
    : `/about/${encodeURIComponent(slug)}/numbers`;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

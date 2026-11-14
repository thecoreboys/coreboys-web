type TheaterLocation = { pathname: string; search: string };

let cancelledSearch: string | null = null;

function normalizedSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.sort();
  return params.toString();
}

/** Cancel immediately: a route transition can leave the old URL visible until it commits. */
export function cancelTheaterHandoff(location: TheaterLocation): void {
  if (location.pathname.replace(/\/+$/, "") === "/theater") {
    cancelledSearch = normalizedSearch(location.search);
  }
}

/** Once browsing resumes, an explicit visit to the same title may start a fresh handoff. */
export function resetTheaterHandoff(): void {
  cancelledSearch = null;
}

/** A streamed Theater mount must still belong to the viewer's current destination. */
export function isActiveTheaterDestination(
  location: TheaterLocation,
  renderedSearch: string,
): boolean {
  if (location.pathname.replace(/\/+$/, "") !== "/theater") return false;

  const active = normalizedSearch(location.search);
  return active !== cancelledSearch && active === normalizedSearch(renderedSearch);
}

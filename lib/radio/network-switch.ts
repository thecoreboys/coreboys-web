import { isRadioNetworkSlug, type RadioNetworkSlug } from "./public-catalog";

const FALLBACK_ORIGIN = "https://core.local";

/**
 * Resolves only actual network routes. Keeping this independent from the
 * transition component makes the distinction between changing a channel and
 * changing a tab/mode explicit and testable.
 */
export function radioNetworkSlugFromPath(path: string): RadioNetworkSlug | null {
  try {
    const url = new URL(path, FALLBACK_ORIGIN);
    const match = /^\/channels\/([^/]+)\/?$/.exec(url.pathname);
    const slug = match ? decodeURIComponent(match[1] ?? "") : "";
    return isRadioNetworkSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * A station ID belongs to a real network change. Opening another mode on the
 * same channel must not replay DJ Cora, and merely rendering a channel route
 * never calls this function at all.
 */
export function shouldPlayRecordedNetworkTune(currentPath: string, destinationPath: string) {
  const destination = radioNetworkSlugFromPath(destinationPath);
  return destination !== null && destination !== radioNetworkSlugFromPath(currentPath);
}

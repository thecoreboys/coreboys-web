import { isRadioNetworkSlug, type RadioNetworkSlug } from "./public-catalog";

/** Choose just the visible station; utility/account pages need no audio warmup. */
export function radioPreloadNetwork(pathname: string): RadioNetworkSlug | null {
  const match = /^\/(?:channels|watch\/network)\/([^/]+)\/?$/.exec(pathname);
  if (match) return isRadioNetworkSlug(match[1]) ? match[1] : null;
  return pathname === "/" || pathname === "/watch" || pathname === "/guide" ? "core" : null;
}

export function canPreloadRadioAudio(connection?: { saveData?: boolean; effectiveType?: string }): boolean {
  return !connection?.saveData && connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

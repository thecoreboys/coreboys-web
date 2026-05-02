/**
 * Custom Next/Image loader — production-only routing for assets that
 * live in DigitalOcean Spaces. The local `public/{members,crew,group,
 * comms,brand,fonts}/` folders are gitignored (size) so the Docker
 * runtime image doesn't carry them. Without this loader, Next/Image
 * tries to read those paths from /public on the server and returns
 * "received null" because the file isn't there.
 *
 * The loader rewrites known CDN-prefixed paths to their Spaces URL.
 * Anything else (external URLs, /public files that DO exist locally)
 * passes through unchanged so the browser loads from origin.
 *
 * Side-effect: with a custom loader Next no longer transforms images
 * (resize / format swap). For our use case the originals are already
 * web-friendly (JPEG / PNG, sane dimensions) and Spaces' CDN handles
 * caching at the edge, so this is fine.
 */

const CDN = "https://coreboys-media.nyc3.cdn.digitaloceanspaces.com";

const CDN_PREFIXES = [
  "/members/",
  "/crew/",
  "/group/",
  "/comms/",
  "/brand/",
  "/fonts/",
];

type LoaderArgs = { src: string; width?: number; quality?: number };

export default function imageLoader({ src }: LoaderArgs): string {
  if (!src) return src;
  // External URLs pass through (Twitch profile pics, YouTube thumbs).
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  // Spaces-hosted prefixes get rewritten to the CDN.
  if (CDN_PREFIXES.some((p) => src.startsWith(p))) {
    return `${CDN}${src}`;
  }
  // Anything else: serve from origin.
  return src;
}

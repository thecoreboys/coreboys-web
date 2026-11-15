import type { NextConfig } from "next";

const config: NextConfig = {
  // Keep local development isolated when a production build is running in
  // the same workspace (for example: CORE_NEXT_DIST_DIR=.next-dev-3010).
  distDir: process.env.CORE_NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.CORE_NEXT_TSCONFIG || "tsconfig.json" },
  reactStrictMode: true,
  typedRoutes: true,
  // Smaller, self-contained server bundle so the Docker runtime stage
  // doesn't need pnpm or node_modules — just `node server.js`.
  // Windows contributors can set CORE_NEXT_STANDALONE=0 for a full local
  // validation build without requiring Developer Mode symlink privileges.
  output: process.env.CORE_NEXT_STANDALONE === "0" ? undefined : "standalone",
  images: {
    // Artwork now ships in public/ in the production image. Resize it on
    // demand; SiteImage preserves remote provider URLs and signed previews.
    unoptimized: false,
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "image.mux.com" },
      { protocol: "https", hostname: "**.patreonusercontent.com" },
      { protocol: "https", hostname: "media.thecoreboys.com" },
      { protocol: "https", hostname: "coreboys-media.nyc3.cdn.digitaloceanspaces.com" },
      { protocol: "https", hostname: "coreboys-media.nyc3.digitaloceanspaces.com" },
    ],
  },
  transpilePackages: ["@coreboys/shared"],
  async headers() {
    const staticMediaCache = {
      key: "Cache-Control",
      value: "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    };

    return [
      {
        source: "/api/twitch/live",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        // Lightweight static artwork used by the home and network surfaces.
        // Keep it browser/CDN cacheable while allowing planned artwork updates
        // to propagate on a short, predictable schedule.
        source: "/brand/:path*.webp",
        headers: [staticMediaCache],
      },
      {
        source: "/brand/:path*.png",
        headers: [staticMediaCache],
      },
      {
        // Reuse station recordings across channel changes and repeat visits.
        // These filenames are not content-hashed, so keep a bounded lifetime.
        source: "/audio/:path*.mp3",
        headers: [staticMediaCache],
      },
      {
        // These are immutable narrative / product visuals. Next serves files
        // in public/ with max-age=0 by default, which makes every revisit
        // redownload the same posters and film clips.
        source: "/special-message/:path*.webp",
        headers: [staticMediaCache],
      },
      {
        source: "/special-message/:path*.png",
        headers: [staticMediaCache],
      },
      {
        source: "/special-message/:path*.mp4",
        headers: [staticMediaCache],
      },
      {
        // The group still is a site-wide hero fallback, so make repeat visits
        // inexpensive even when image optimization is intentionally bypassed.
        source: "/group/:path*.jpg",
        headers: [staticMediaCache],
      },
      {
        // Creator imagery is served directly from the media origin because
        // Next/Image optimization is intentionally disabled for the CDN.
        // Preserve fast repeat visits without treating uploads as immutable.
        source: "/members/:path*.jpg",
        headers: [staticMediaCache],
      },
      {
        source: "/members/:path*.png",
        headers: [staticMediaCache],
      },
      {
        source: "/members/:path*.webp",
        headers: [staticMediaCache],
      },
      {
        source: "/crew/:path*.jpg",
        headers: [staticMediaCache],
      },
      {
        source: "/crew/:path*.png",
        headers: [staticMediaCache],
      },
      {
        source: "/crew/:path*.webp",
        headers: [staticMediaCache],
      },
      {
        source: "/comms/:path*.png",
        headers: [staticMediaCache],
      },
      {
        source: "/comms/:path*.webp",
        headers: [staticMediaCache],
      },
      {
        source: "/fonts/:path*.ttf",
        headers: [staticMediaCache],
      },
      {
        source: "/embed-preview.png",
        headers: [staticMediaCache],
      },
    ];
  },
  async rewrites() {
    // App Router parameters occupy a whole path segment. Preserve the public
    // sharing URLs while resolving them through the actual dynamic page.
    return [{ source: "/send-to-:slug", destination: "/fan-mail/:slug" }];
  },
  // The oversized house reel stays outside the application image. All
  // artwork used by the product ships from public/ so browse pages remain
  // healthy even if the optional media CDN is unavailable.
  async redirects() {
    if (process.env.NODE_ENV !== "production") return [];
    const cdn = "https://media.thecoreboys.com";
    return [
      { source: "/house-reveal.mp4", destination: `${cdn}/house-reveal.mp4`, permanent: true },
    ];
  },
};

export default config;

import type { NextConfig } from "next";

const config: NextConfig = {
  // Keep local development isolated when a production build is running in
  // the same workspace (for example: CORE_NEXT_DIST_DIR=.next-dev-3010).
  distDir: process.env.CORE_NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  typedRoutes: true,
  // Smaller, self-contained server bundle so the Docker runtime stage
  // doesn't need pnpm or node_modules — just `node server.js`.
  // Windows contributors can set CORE_NEXT_STANDALONE=0 for a full local
  // validation build without requiring Developer Mode symlink privileges.
  output: process.env.CORE_NEXT_STANDALONE === "0" ? undefined : "standalone",
  images: {
    // Skip the Next/Image optimizer entirely. The runtime Docker image
    // doesn't carry the gitignored `public/{members,crew,group,...}/`
    // folders, so the optimizer would 404 reading from disk. With
    // `unoptimized` the browser fetches `src` directly; the redirects
    // below send those paths to the Cloudflare R2 custom domain. Side benefit: avoids
    // the Turbopack-dev regression where `loader: "custom"` +
    // `loaderFile` isn't picked up reliably and every <Image> errors
    // with "missing loader prop".
    unoptimized: true,
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
    ];
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

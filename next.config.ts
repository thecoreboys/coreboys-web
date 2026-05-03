import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Smaller, self-contained server bundle so the Docker runtime stage
  // doesn't need pnpm or node_modules — just `node server.js`.
  output: "standalone",
  images: {
    // Skip the Next/Image optimizer entirely. The runtime Docker image
    // doesn't carry the gitignored `public/{members,crew,group,...}/`
    // folders, so the optimizer would 404 reading from disk. With
    // `unoptimized` the browser fetches `src` directly; the redirects
    // below send those paths to the Spaces CDN. Side benefit: avoids
    // the Turbopack-dev regression where `loader: "custom"` +
    // `loaderFile` isn't picked up reliably and every <Image> errors
    // with "missing loader prop".
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },
      { protocol: "https", hostname: "i.ytimg.com" },
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
  // Image / video / font / brand assets live in DigitalOcean Spaces. The
  // Docker runtime image doesn't carry them (the `public/{members,crew,
  // group,comms,brand,fonts}/` folders + `house-reveal.mp4` are gitignored
  // because of size). Browsers and the Next/Image optimizer follow these
  // redirects to the CDN so URLs in source code stay as `/members/...`,
  // `/crew/...`, etc.
  async redirects() {
    const cdn = "https://coreboys-media.nyc3.cdn.digitaloceanspaces.com";
    return [
      { source: "/members/:path*", destination: `${cdn}/members/:path*`, permanent: true },
      // /crew/:slug is a real page route (app/crew/[slug]/page.tsx). Only
      // redirect when there's an asset segment after the slug, otherwise
      // clicking a crew card sends the user to the CDN instead of the page.
      { source: "/crew/:slug/:asset+", destination: `${cdn}/crew/:slug/:asset+`, permanent: true },
      { source: "/group/:path*", destination: `${cdn}/group/:path*`, permanent: true },
      { source: "/comms/:path*", destination: `${cdn}/comms/:path*`, permanent: true },
      { source: "/brand/:path*", destination: `${cdn}/brand/:path*`, permanent: true },
      // /fonts/* is intentionally NOT redirected — Nord-Regular.ttf lives
      // in public/fonts and must be served same-origin so @font-face can
      // load it without a CORS preflight.
      { source: "/house-reveal.mp4", destination: `${cdn}/house-reveal.mp4`, permanent: true },
    ];
  },
};

export default config;

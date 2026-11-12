import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin/",
          "/studio/",
          "/metrics/",
          "/monitor/",
          "/account/",
          "/binder/",
          "/dvr",
          "/passport",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/access",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

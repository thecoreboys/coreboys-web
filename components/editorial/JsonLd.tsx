import { absoluteSiteUrl, CORE_SHARE_IMAGE, SITE_DESCRIPTION, SITE_URL as SITE, serializeJsonLd } from "@/lib/seo";

/** Describe the site without presenting the independent fan project as the creators' official organization. */
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    name: "CORE TV",
    alternateName: "The Core Boys fan site",
    url: SITE,
    description: SITE_DESCRIPTION,
    inLanguage: "en-US",
    image: { "@type": "ImageObject", url: absoluteSiteUrl(CORE_SHARE_IMAGE.url), width: CORE_SHARE_IMAGE.width, height: CORE_SHARE_IMAGE.height },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

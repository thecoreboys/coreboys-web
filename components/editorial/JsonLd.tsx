const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

/** Describe the site without presenting the independent fan project as the creators' official organization. */
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    name: "CORE TV",
    alternateName: "The Core Boys fan site",
    url: SITE,
    description: "An independent fan site for The Core Boys, with live streams, videos, Shorts, and shows.",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

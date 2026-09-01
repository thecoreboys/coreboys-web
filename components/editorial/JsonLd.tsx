import { MEMBERS } from "@/lib/members";
import { GROUP_SOCIALS } from "@coreboys/shared";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com";

/**
 * Site-wide JSON-LD Organization schema. Members are projected as Person
 * memberOf with sameAs links to their socials so Google can connect the dots.
 */
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "CORE",
        alternateName: ["The Core Boys", "CORE Crew", "CoreCrew"],
        url: SITE,
        description:
          "CORE is a creator network and entertainment home for live streams, videos, Shorts, Reels, news, and shows.",
        sameAs: GROUP_SOCIALS.map((s) => s.url),
        keywords: "CORE, The Core Boys, CORE Crew, CoreCrew, creator network, live streams",
        areaServed: "US",
        member: MEMBERS.map((m) => ({
          "@type": "Person",
          name: m.stageName,
          alternateName: m.realName,
          url: `${SITE}/channels/${m.slug}`,
          sameAs: [...m.socials.map((s) => s.url), ...m.wikipedia],
          memberOf: { "@id": `${SITE}/#organization` },
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: "CORE | The Core Boys",
        alternateName: ["The Core Boys", "CORE Crew", "CoreCrew"],
        url: SITE,
        description: "Live streams, videos, Shorts, Reels, and shows from CORE creators.",
        publisher: { "@id": `${SITE}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE}/watch?query={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

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
    "@type": "Organization",
    name: "CORE",
    alternateName: "CORE",
    url: SITE,
    description: "Six creators. One core. Everything we make, we own.",
    sameAs: GROUP_SOCIALS.map((s) => s.url),
    member: MEMBERS.map((m) => ({
      "@type": "Person",
      name: m.stageName,
      alternateName: m.realName,
      url: `${SITE}/about/${m.slug}`,
      sameAs: [...m.socials.map((s) => s.url), ...m.wikipedia],
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

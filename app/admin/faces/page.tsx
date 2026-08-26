import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FaceRecognitionControlRoom } from "@/components/admin/faces/FaceRecognitionControlRoom";
import type { FaceCanonicalPerson } from "@/components/admin/faces/types";
import { getCrewPortrait } from "@/lib/asset-index";
import { CREW, MEMBERS } from "@/lib/members";

export const metadata: Metadata = {
  title: "Admin · On-screen people",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminFacesPage() {
  const people: FaceCanonicalPerson[] = [
    ...MEMBERS.map((member) => ({
      key: `member:${member.slug}`,
      kind: "member" as const,
      slug: member.slug,
      displayName: member.stageName,
      secondaryLabel: member.comm.name,
      portraitUrl: member.portrait,
      profileHref: `/m/${member.slug}`,
      socials: member.socials,
    })),
    ...CREW.map((person) => ({
      key: `crew:${person.slug}`,
      kind: "crew" as const,
      slug: person.slug,
      displayName: person.name,
      secondaryLabel: person.roleLabel ?? person.role,
      portraitUrl: getCrewPortrait(person.slug),
      profileHref: `/crew/${person.slug}`,
      socials: person.socials,
    })),
  ];

  return (
    <AuthGate>
      <div className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · On-screen people"
          title="Consent-first face tagging."
          supporting="Enroll only adults who have directly opted in, review every proposed match, and stop recognition for any source or session instantly. Canonical profile photos below are identity context only—they are never training data."
        />
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-4 py-6 sm:px-6 md:px-8 md:py-10">
            <FaceRecognitionControlRoom people={people} />
          </div>
        </section>
      </div>
    </AuthGate>
  );
}

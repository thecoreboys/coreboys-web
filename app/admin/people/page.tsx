import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Plus } from "lucide-react";
import { MEMBERS, CREW } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { AuthGate } from "@/components/admin/AuthGate";
import { PeopleEditorClient } from "@/components/admin/PeopleEditor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata: Metadata = {
  title: "Admin · People",
  robots: { index: false, follow: false },
};

export const revalidate = 600;

/**
 * Admin people CRUD. Lists every member + crew row with overrides
 * editable inline. Phase 1: edits write to localStorage. Phase 4:
 * `PUT /v1/members/:slug` and `PUT /v1/crew/:slug` against
 * `editable_member_overrides` / `editable_crew_overrides`.
 */
export default async function AdminPeoplePage() {
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const memberRows = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    realName: m.realName,
    birthDate: m.birthDate ?? null,
    accent: m.accent,
    twitchLogin: m.twitchLogin,
    commName: m.comm.name,
    commLogo: m.comm.logo,
    avatarUrl: m.portrait ?? avatars[m.twitchLogin.toLowerCase()],
    bio: m.bio,
  }));

  const crewRows = CREW.map((c) => ({
    slug: c.slug,
    name: c.name,
    role: c.role,
    worksWith: [...c.worksWith],
  }));

  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · People"
          title="Members & crew."
          supporting="Edit name, real name, DOB, comm, socials. Add or remove members and crew. Edits persist to localStorage in this Phase-1 stub; Phase 4 wires the override tables."
        />

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <PeopleEditorClient memberRows={memberRows} crewRows={crewRows} />
          </div>
        </section>

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-primary p-6 ring-1 ring-inset ring-secondary shadow-xs">
              <div>
                <p className="text-sm font-semibold text-brand-secondary">Quick links</p>
                <p className="mt-1 text-md text-tertiary">
                  Jump to a public profile to verify your edits before publishing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {memberRows.slice(0, 3).map((m) => (
                  <Link
                    key={m.slug}
                    href={`/channels/${m.slug}` as never}
                    className="inline-flex items-center gap-2 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary shadow-xs-skeuomorphic transition-all hover:-translate-y-px hover:text-primary"
                  >
                    <Image src={m.avatarUrl} alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
                    {m.stageName}
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}

// Suppress server-component-side unused import — used by the client.
void Plus;

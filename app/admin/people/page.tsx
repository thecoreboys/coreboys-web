import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Plus, Users } from "lucide-react";
import { MEMBERS, CREW } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { AuthGate } from "@/components/admin/AuthGate";
import { PeopleEditorClient } from "@/components/admin/PeopleEditor";

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
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                ← Admin
              </Link>
              <p className="mt-2 eyebrow inline-flex items-center gap-2">
                <Users size={11} />
                Admin · People
              </p>
              <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                Members & crew.
              </h1>
              <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
                Edit name, real name, DOB, comm, socials. Add or remove members and crew. Edits
                persist to localStorage in this Phase-1 stub; Phase 4 wires the override tables.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <PeopleEditorClient memberRows={memberRows} crewRows={crewRows} />
          </div>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Quick links</p>
                <p className="mt-2 text-[14px] text-[color:var(--ink-dim)]">
                  Jump to a public profile to verify your edits before publishing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {memberRows.slice(0, 3).map((m) => (
                  <Link
                    key={m.slug}
                    href={`/m/${m.slug}` as `/m/${string}`}
                    className="inline-flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-1.5 text-[12px] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                  >
                    <Image src={m.avatarUrl} alt="" width={18} height={18} className="h-4 w-4 rounded-full" />
                    {m.stageName}
                    <ArrowUpRight size={12} />
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

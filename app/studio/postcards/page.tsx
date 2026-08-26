import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/admin/AuthGate";
import { PostcardStudioManager } from "@/components/studio/PostcardStudioManager";
import { getCurrentStaff } from "@/lib/admin-api";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { staffMemberScope } from "@/lib/staff-policy";

export const metadata: Metadata = {
  title: "Postcard Studio",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StudioPostcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/sign-in?next=/studio/postcards" as never);

  const requested = (await searchParams).member;
  const adminDefault = staff.role === "admin" ? requested ?? MEMBERS[0]?.slug : requested;
  const memberSlug = staffMemberScope(staff, adminDefault, MEMBER_SLUGS);
  if (!memberSlug) redirect(staff.role === "admin" ? "/studio" as never : "/admin/sign-in" as never);
  const member = MEMBERS_BY_SLUG[memberSlug]!;

  return (
    <main className="min-h-screen bg-secondary pt-20 md:pt-24">
      <section className="border-b border-secondary">
        <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-secondary">CORE · Community Studio</p>
              <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">{member.stageName}&apos;s Postcard Studio.</h1>
              <p className="mt-2 max-w-[68ch] text-md text-tertiary">Create community design packs, plan drops, and acknowledge delivered fan mail. Every request is scoped to this member in both authorization and SQL.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/studio?member=${memberSlug}` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">Back to Studio</Link>
              <SignOutButton />
            </div>
          </div>

          {staff.role === "admin" ? (
            <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-tertiary">Member<select name="member" defaultValue={memberSlug} className="mt-1 min-h-10 rounded-lg border border-secondary bg-primary px-3 text-sm text-primary">{MEMBERS.map((option) => <option key={option.slug} value={option.slug}>{option.stageName}</option>)}</select></label>
              <button className="min-h-10 rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary hover:text-primary">Open Postcard Studio</button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-container px-4 py-8 sm:px-6 md:px-8 md:py-12">
        <PostcardStudioManager
          memberSlug={memberSlug}
          memberName={member.stageName}
          isAdmin={staff.role === "admin"}
        />
      </section>
    </main>
  );
}

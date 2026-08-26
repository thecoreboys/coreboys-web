import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin-api";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { staffMemberScope } from "@/lib/staff-policy";
import { StudioProfileEditor } from "@/components/studio/StudioProfileEditor";
import { SignOutButton } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: "Community Studio",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/sign-in?next=/studio" as never);

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
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-quaternary">CORE · Community Studio</p>
              <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">{member.stageName}&apos;s Studio.</h1>
              <p className="mt-2 max-w-[60ch] text-md text-tertiary">Manage the approved public profile fields for this community. Access is checked against the live staff assignment on every request.</p>
            </div>
            <SignOutButton />
          </div>

          {staff.role === "admin" ? (
            <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-tertiary">Member<select name="member" defaultValue={memberSlug} className="mt-1 min-h-10 rounded-lg border border-secondary bg-primary px-3 text-sm text-primary">{MEMBERS.map((option) => <option key={option.slug} value={option.slug}>{option.stageName}</option>)}</select></label>
              <button className="min-h-10 rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary hover:text-primary">Open Studio</button>
              <Link href={"/admin/accounts" as Route} className="min-h-10 rounded-lg border border-secondary bg-primary px-3 py-2.5 text-sm font-semibold text-secondary hover:text-primary">Manage staff</Link>
            </form>
          ) : null}

          <nav className="mt-6 flex flex-wrap gap-2" aria-label={`${member.stageName} management links`}>
            <Link href={`/studio/passport?member=${memberSlug}` as Route} className="rounded-lg border border-brand-secondary bg-brand-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-secondary">Open live control room</Link>
            <Link href={`/studio/postcards?member=${memberSlug}` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:border-brand-secondary hover:text-primary">Postcard Studio</Link>
            <Link href={`/about/${memberSlug}/numbers` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">View member analytics</Link>
            <Link href={`/about/${memberSlug}` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">Open public profile</Link>
            {staff.role === "admin" ? <Link href="/metrics" className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">House metrics</Link> : null}
          </nav>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
          <StudioProfileEditor memberSlug={memberSlug} />
        </div>
      </section>
    </main>
  );
}

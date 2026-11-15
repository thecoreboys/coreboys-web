import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin-api";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { staffMemberScope } from "@/lib/staff-policy";
import { StudioProfileEditor } from "@/components/studio/StudioProfileEditor";
import { SignOutButton } from "@/components/admin/AuthGate";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="studio-page min-h-[var(--page-min-height)] bg-secondary">
      <PageHeader
        eyebrow="CORE · Community Studio"
        title={<>{member.stageName}&apos;s Studio.</>}
        supporting="Manage your community’s public profile and find everything you need to go live."
        actions={<SignOutButton />}
      />
      <section className="studio-page__tools">
        <div className="studio-page__toolbar mx-auto max-w-container">
          {staff.role === "admin" ? (
            <form method="get" className="studio-page__member-switch flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium text-tertiary">Member<select name="member" defaultValue={memberSlug} className="mt-2 block min-h-11 rounded-xl border border-secondary bg-primary px-3 text-base text-primary">{MEMBERS.map((option) => <option key={option.slug} value={option.slug}>{option.stageName}</option>)}</select></label>
              <button className="min-h-10 rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary hover:text-primary">Open Studio</button>
              <Link href={"/admin/accounts" as Route} className="min-h-10 rounded-lg border border-secondary bg-primary px-3 py-2.5 text-sm font-semibold text-secondary hover:text-primary">Manage staff</Link>
            </form>
          ) : null}

          <nav className="studio-page__links flex flex-wrap gap-2" aria-label={`${member.stageName} management links`}>
            <Link href={`/studio/passport?member=${memberSlug}` as Route} className="rounded-lg border border-brand-secondary bg-brand-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-secondary">Open live control room</Link>
            <Link href={`/studio/postcards?member=${memberSlug}` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:border-brand-secondary hover:text-primary">Postcard Studio</Link>
            <Link href={`/about/${memberSlug}/numbers` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">View member analytics</Link>
            <Link href={`/channels/${memberSlug}` as Route} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">Open public channel</Link>
            {staff.role === "admin" ? <Link href="/metrics" className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">House metrics</Link> : null}
          </nav>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
          <StudioProfileEditor memberSlug={memberSlug} />
        </div>
      </section>
    </div>
  );
}

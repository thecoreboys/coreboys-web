import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PassportControlRoom } from "@/components/admin/passport/PassportControlRoom";
import { SignOutButton } from "@/components/admin/AuthGate";
import { getCurrentStaff } from "@/lib/admin-api";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import { staffMemberScope } from "@/lib/staff-policy";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";

export const metadata: Metadata = {
  title: "Channel Control Room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StudioPassportPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/sign-in?next=/studio/passport" as never);

  const requested = (await searchParams).member;
  const defaultMember = staff.role === "admin" ? requested ?? MEMBERS[0]?.slug : requested;
  const memberSlug = staffMemberScope(staff, defaultMember, MEMBER_SLUGS);
  if (!memberSlug) redirect(staff.role === "admin" ? "/studio" as never : "/admin/sign-in" as never);

  const member = MEMBERS_BY_SLUG[memberSlug]!;
  const channel = NETWORK_CHANNELS.find((candidate) => candidate.memberSlug === memberSlug);
  if (!channel) redirect("/studio" as never);

  return (
    <main className="min-h-screen bg-secondary pt-20 md:pt-24">
      <section className="border-b border-secondary">
        <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-secondary">
                {channel.name} · Moderator Studio
              </p>
              <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
                {member.stageName}&apos;s live control room.
              </h1>
              <p className="mt-2 max-w-[68ch] text-md text-tertiary">
                Run polls, verified scores, live moments, and reward nominations for this channel. Every action is scoped, reversible where appropriate, and recorded in the audit trail.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/studio?member=${memberSlug}`} className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm font-semibold text-secondary hover:text-primary">
                Back to Studio
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-container px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <PassportControlRoom
          channels={[{
            slug: channel.slug,
            name: channel.name,
            community: channel.community,
            host: channel.host,
            accent: channel.accent,
            artwork: channel.artwork,
          }]}
        />
      </section>
    </main>
  );
}

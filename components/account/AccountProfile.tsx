"use client";

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { FanUser } from "@/components/providers/AuthProvider";
import { publicDisplayName } from "@/lib/profile-display";

export function AccountProfile({ user }: { user: FanUser }) {
  const name = publicDisplayName(user.displayName);
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <section id="profile" className="scroll-mt-32 rounded-xl border border-secondary bg-primary p-5 sm:p-6" aria-labelledby="account-profile-heading">
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-lg font-semibold text-primary" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0"><h2 id="account-profile-heading" className="break-words text-xl font-semibold tracking-tight text-primary">{name}</h2><p className="mt-1 text-sm text-tertiary">Member since {memberSince}</p></div>
      </div>
      <dl className="mt-6 grid gap-4 border-t border-secondary pt-5 sm:grid-cols-2">
        <div><dt className="text-xs text-tertiary">Email address</dt><dd className="mt-1 break-all text-sm text-primary">{user.email}</dd></div>
        <div><dt className="text-xs text-tertiary">Email verification</dt><dd className="mt-1 flex items-center gap-1.5 text-sm text-primary">{user.emailVerified ? <><Check className="size-4" aria-hidden /> Verified</> : <Link href="#notifications" className="underline underline-offset-4">Verification needed</Link>}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-secondary pt-4">
        {[["/passport", "View Passport"], ["/dvr", "Open DVR"], ["/account/settings/billing", "Manage billing"]].map(([href, label]) => <Link key={href} href={href as never} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline hover:underline-offset-4">{label}<ArrowUpRight className="size-3.5" aria-hidden /></Link>)}
      </div>
    </section>
  );
}

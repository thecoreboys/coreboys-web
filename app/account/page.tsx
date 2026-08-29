"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { AccountFanZone } from "@/components/account/AccountFanZone";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MEMBERS } from "@/lib/members";
import { HouseWeekPulse } from "@/components/watch/MemberPulse";
import { Button } from "@/components/base/buttons/button";
import { BillingSummaryCard } from "@/components/account/BillingSummaryCard";
import { CreditCard01, Settings01, Trophy01 } from "@untitledui/icons";
import { publicDisplayName } from "@/lib/profile-display";

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-3xl px-6 py-16">
        <div className="h-40 animate-pulse bg-[color:var(--bg-elev)]" />
      </div>
    );
  }

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
              Account
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--ink)] md:text-4xl">
              {publicDisplayName(user.displayName)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              href={"/account/plan" as never}
              size="md"
              color="secondary"
              iconLeading={CreditCard01}
            >
              Billing
            </Button>
            <Button
              href={"/passport" as never}
              size="md"
              color="primary"
              iconLeading={Trophy01}
            >
              CORE Passport
            </Button>
            <Button
              href={"/account/settings" as never}
              size="md"
              color="secondary"
              iconLeading={Settings01}
            >
              Settings
            </Button>
          </div>
        </div>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
          Since {memberSince}
        </p>
        <p className="mt-3 text-sm text-[color:var(--ink-dim)]">{user.email}</p>
        <HouseWeekPulse className="mt-3" />
        <BillingSummaryCard />

        <AccountFanZone
          members={MEMBERS.map((m) => ({ slug: m.slug, stageName: m.stageName }))}
        />

        <Suspense fallback={<div className="mt-6 h-64 animate-pulse bg-[color:var(--bg-elev)]" />}>
          <ConnectedAccounts
            members={MEMBERS.map((m) => ({ slug: m.slug, stageName: m.stageName }))}
          />
        </Suspense>

        <p className="mt-16">
          <button
            type="button"
            onClick={() => void logout()}
            className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          >
            Log out
          </button>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

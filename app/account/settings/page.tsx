"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell01, Settings01, User01 } from "@untitledui/icons";
import { AccountSettingsHub } from "@/components/account/AccountSettingsHub";
import { AccountPageHeader } from "@/components/account/AccountPageHeader";
import { AccountProfile } from "@/components/account/AccountProfile";
import { AccountFanZone } from "@/components/account/AccountFanZone";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { SocialNotificationSettings } from "@/components/account/SocialNotificationSettings";
import { AccountDeletionCard } from "@/components/account/AccountDeletionCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { useAuth } from "@/components/providers/AuthProvider";
import { MEMBERS } from "@/lib/members";
import { cx } from "@/utils/cx";
import billingStyles from "@/components/marketing/PricingExperience.module.css";

const SETTINGS_NAV = [
  { group: "Account", label: "Profile", href: "#profile", icon: User01 },
  { group: "Account", label: "Connections", href: "#connections", icon: User01 },
  { group: "Account", label: "Notifications", href: "#notifications", icon: Bell01 },
  { group: "Account", label: "Privacy & safety", href: "#privacy", icon: Settings01 },
  { group: "Watch", label: "Appearance", href: "#experience", icon: Settings01 },
  { group: "Watch", label: "Playback", href: "#playback", icon: Settings01 },
  { group: "Watch", label: "Station audio", href: "#station-audio", icon: Settings01 },
  { group: "Watch", label: "Accessibility", href: "#accessibility", icon: Settings01 },
  { group: "Watch", label: "Personalization", href: "#personalization", icon: User01 },
] as const;

export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fanDetailsOpen, setFanDetailsOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/settings");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="h-28 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-[36rem] animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={billingStyles.shell}>
        <AccountPageHeader active="settings" title="Account settings" description="Your profile, connected platforms, and preferences." />
        <main className={`${billingStyles.cleanMain} grid grid-cols-1 items-start gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10`}>
          <aside className="min-w-0 lg:sticky lg:top-[calc(var(--site-header-h,8rem)+1rem)]">
            <nav
              aria-label="Account settings"
              className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl bg-secondary p-1 ring-1 ring-inset ring-secondary lg:flex-col"
            >
              {SETTINGS_NAV.map((item, index) => {
                const previous = SETTINGS_NAV[index - 1];
                return (
                  <div key={item.href} className={cx("shrink-0", item.group !== previous?.group && index > 0 && "lg:mt-3 lg:border-t lg:border-secondary lg:pt-3")}>
                    {item.group !== previous?.group ? <p className="hidden px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-quaternary lg:block">{item.group}</p> : null}
                    <Link href={item.href as never} className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-tertiary transition hover:bg-primary_hover hover:text-secondary">
                      {item.label}
                    </Link>
                  </div>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            <AccountProfile user={user} />
            <section id="connections" className="scroll-mt-24">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-secondary" />}>
                <ConnectedAccounts
                  members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))}
                />
              </Suspense>
            </section>
            <AccountSettingsHub />
            <section id="notifications" className="scroll-mt-24">
              <SocialNotificationSettings members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))} />
              <div className="mt-6">
              <NotificationSettings
                accountEmail={user.email}
                accountEmailVerified={user.emailVerified}
              />
              </div>
              <details className="mt-6 rounded-xl border border-secondary p-5" onToggle={(event) => setFanDetailsOpen(event.currentTarget.open)}>
                <summary className="cursor-pointer text-sm font-medium text-primary">Fan score & creator live alerts</summary>
                {fanDetailsOpen ? <AccountFanZone members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))} /> : null}
              </details>
            </section>
            <AccountDeletionCard />
          </div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

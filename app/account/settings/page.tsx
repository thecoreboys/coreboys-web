"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell01, Settings01, User01 } from "@untitledui/icons";
import { AccountSettingsHub } from "@/components/account/AccountSettingsHub";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { SocialNotificationSettings } from "@/components/account/SocialNotificationSettings";
import { AccountDeletionCard } from "@/components/account/AccountDeletionCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { useAuth } from "@/components/providers/AuthProvider";
import { MEMBERS } from "@/lib/members";
import { cx } from "@/utils/cx";

const SETTINGS_NAV = [
  { group: "Watch", label: "Appearance", href: "#experience", icon: Settings01 },
  { group: "Watch", label: "Playback", href: "#playback", icon: Settings01 },
  { group: "Watch", label: "Station audio", href: "#station-audio", icon: Settings01 },
  { group: "Watch", label: "Accessibility", href: "#accessibility", icon: Settings01 },
  { group: "Account", label: "Personalization", href: "#personalization", icon: User01 },
  { group: "Account", label: "Privacy & safety", href: "#privacy", icon: Settings01 },
  { group: "Account", label: "Connections", href: "#connections", icon: User01 },
  { group: "Account", label: "Notifications", href: "#notifications", icon: Bell01 },
] as const;

export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
      <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-brand-secondary ring-1 ring-inset ring-brand">
            <Settings01 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Account</p>
            <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary">
              Settings
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tertiary">
              Set how CORE looks, plays, connects, and keeps you in the loop.
            </p>
          </div>
        </div>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
          <aside className="lg:sticky lg:top-28">
            <nav
              aria-label="Account settings"
              className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1 ring-1 ring-inset ring-secondary lg:flex-col"
            >
              {SETTINGS_NAV.map((item, index) => {
                const Icon = item.icon;
                const previous = SETTINGS_NAV[index - 1];
                return (
                  <div key={item.href} className={cx(item.group !== previous?.group && index > 0 && "lg:mt-3 lg:border-t lg:border-secondary lg:pt-3")}>
                    {item.group !== previous?.group ? <p className="hidden px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-quaternary lg:block">{item.group}</p> : null}
                    <Link href={item.href as never} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-tertiary transition hover:bg-primary_hover hover:text-secondary">
                      <Icon className="size-4.5" aria-hidden />
                      {item.label}
                    </Link>
                  </div>
                );
              })}
            </nav>
          </aside>

          <div className="space-y-6">
            <AccountSettingsHub />
            <AccountDeletionCard />
            <section id="connections" className="scroll-mt-24">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-secondary" />}>
                <ConnectedAccounts
                  members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))}
                />
              </Suspense>
            </section>
            <section id="notifications" className="scroll-mt-24">
              <SocialNotificationSettings members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))} />
              <div className="mt-6">
              <NotificationSettings
                accountEmail={user.email}
                accountEmailVerified={user.emailVerified}
              />
              </div>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

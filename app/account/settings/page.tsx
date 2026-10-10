"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountSettingsHub } from "@/components/account/AccountSettingsHub";
import { ACCOUNT_SETTINGS_NAV, AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";
import { AccountProfile } from "@/components/account/AccountProfile";
import { AccountFanZone } from "@/components/account/AccountFanZone";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { SocialNotificationSettings } from "@/components/account/SocialNotificationSettings";
import { AccountDeletionCard } from "@/components/account/AccountDeletionCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { useAuth } from "@/components/providers/AuthProvider";
import { MEMBERS } from "@/lib/members";

export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fanDetailsOpen, setFanDetailsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/settings");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const sections = ACCOUNT_SETTINGS_NAV
      .filter((item) => item.id !== "billing")
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const id = visible[0]?.target.id;
      if (id) setActiveSection(id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [user]);

  if (loading || !user) {
    return <AccountSettingsLayout title="Account settings" description="Your profile, connected platforms, and preferences." activeSection={activeSection}>
      <div className="h-40 animate-pulse rounded-xl border border-secondary bg-primary" />
      <div className="h-[36rem] animate-pulse rounded-xl border border-secondary bg-primary" />
    </AccountSettingsLayout>;
  }

  return (
    <>
      <AccountSettingsLayout title="Account settings" description="Your profile, connected platforms, and preferences." activeSection={activeSection}>
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
      </AccountSettingsLayout>
      <SiteFooter />
    </>
  );
}

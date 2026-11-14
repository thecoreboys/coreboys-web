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
import { CREW, MEMBERS } from "@/lib/members";
import { crewXAuthorSlug } from "@/lib/x/crew-roster";

export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fanDetailsOpen, setFanDetailsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/settings");
  }, [loading, user, router]);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      const id = hash === "connections" || (!hash && new URLSearchParams(window.location.search).has("oauth")) ? "connected-accounts" : hash || "profile";
      if (ACCOUNT_SETTINGS_NAV.some((item) => item.id === id && item.id !== "billing")) setActiveSection(id);
    };
    sync(); window.addEventListener("hashchange", sync); window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  const selectSection = (id: string) => { setActiveSection(id); window.history.pushState(null, "", `#${id}`); };

  if (loading || !user) {
    return <AccountSettingsLayout title="Account settings" description="Your profile, connected platforms, and preferences." activeSection={activeSection} onSectionChange={selectSection}>
      <div className="h-40 animate-pulse rounded-xl border border-secondary bg-primary" />
      <div className="h-[36rem] animate-pulse rounded-xl border border-secondary bg-primary" />
    </AccountSettingsLayout>;
  }

  return (
    <>
      <AccountSettingsLayout title="Account settings" description="Your profile, connected platforms, and preferences." activeSection={activeSection} onSectionChange={selectSection}>
            {activeSection === "profile" ? <AccountProfile user={user} /> : null}
            {activeSection === "connected-accounts" ? <section id="connections" className="scroll-mt-24">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-secondary" />}>
                <ConnectedAccounts
                  members={MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }))}
                />
              </Suspense>
            </section> : null}
            <AccountSettingsHub section={activeSection} />
            {activeSection === "notifications" ? <section id="notifications" className="scroll-mt-24">
              <SocialNotificationSettings members={[
                { slug: "core", stageName: "CORE" },
                ...MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName })),
                ...CREW.filter((crew) => crew.socials.some((social) => social.platform === "x")).map((crew) => ({
                  slug: crewXAuthorSlug(crew.slug),
                  stageName: `${crew.name} · Crew`,
                  contentTypes: ["post"] as const,
                })),
              ]} />
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
            </section> : null}
            {activeSection === "privacy" ? <AccountDeletionCard /> : null}
      </AccountSettingsLayout>
      <SiteFooter />
    </>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountSettingsHub } from "@/components/account/AccountSettingsHub";
import { ACCOUNT_SETTINGS_NAV, AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";
import { AccountProfile } from "@/components/account/AccountProfile";
import { AccountSecurity } from "@/components/account/AccountSecurity";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { SocialNotificationSettings } from "@/components/account/SocialNotificationSettings";
import { AccountDataExportCard, AccountDeletionCard } from "@/components/account/AccountDeletionCard";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { useAuth } from "@/components/providers/AuthProvider";
import { CREW, MEMBERS } from "@/lib/members";
import { crewXAuthorSlug } from "@/lib/x/crew-roster";
import { settingsHashFromHref, settingsSectionFromLocation } from "@/lib/account/settings-navigation";

const MEMBER_OPTIONS = MEMBERS.map((member) => ({ slug: member.slug, stageName: member.stageName }));
const SECTION_IDS = new Set<string>(ACCOUNT_SETTINGS_NAV.filter((item) => item.id !== "billing").map((item) => item.id));
// Section ids other than the section itself that should be scrolled to once it renders.
const NESTED_TARGETS = new Set(["account-deletion", "data-export", "public-profile", "email", "password", "sessions", "connections"]);

export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("profile");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/settings");
  }, [loading, user, router]);

  const applyHash = useCallback((hash: string) => {
    const target = hash.replace(/^#/, "");
    const id = settingsSectionFromLocation(target, new URLSearchParams(window.location.search).has("oauth"));
    if (!SECTION_IDS.has(id)) return false;
    setActiveSection(id);
    setScrollTarget(NESTED_TARGETS.has(target) ? target : null);
    return true;
  }, []);

  useEffect(() => {
    const sync = () => { applyHash(window.location.hash); };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    // Next <Link> navigates same-page hashes with history.pushState, which fires
    // neither event above. Resolve those clicks here so every in-page settings
    // link (nav, hub rows, header menus, notification cards) switches sections.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const hash = settingsHashFromHref(anchor.getAttribute("href") ?? "", window.location.href);
      if (hash === null || !applyHash(hash)) return;
      event.preventDefault();
      if (window.location.hash !== `#${hash}`) window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
      // Links from inside a section or the site header reveal the new section from its top.
      if (!NESTED_TARGETS.has(hash) && !anchor.closest('nav[aria-label="Account settings"]')) window.scrollTo({ top: 0, behavior: "smooth" });
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      document.removeEventListener("click", onClick, true);
    };
  }, [applyHash]);

  useEffect(() => {
    if (!user || !scrollTarget) return;
    let frame = 0;
    let tries = 0;
    // Nested cards can render after their data loads; retry briefly.
    const scroll = () => {
      const element = document.getElementById(scrollTarget);
      if (element) element.scrollIntoView({ block: "start", behavior: "smooth" });
      else if (tries++ < 30) frame = window.requestAnimationFrame(scroll);
    };
    frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, scrollTarget, user]);

  const selectSection = (id: string) => {
    setActiveSection(id);
    setScrollTarget(null);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  };

  if (loading || !user) {
    return <AccountSettingsLayout title="Account settings" description="Your profile, security, connected platforms, and preferences." activeSection={activeSection} onSectionChange={selectSection}>
      <div className="h-40 animate-pulse rounded-xl border border-secondary bg-primary" />
      <div className="h-[36rem] animate-pulse rounded-xl border border-secondary bg-primary" />
    </AccountSettingsLayout>;
  }

  return (
    <>
      <AccountSettingsLayout title="Account settings" description="Your profile, security, connected platforms, and preferences." activeSection={activeSection} onSectionChange={selectSection}>
            {activeSection === "profile" ? <AccountProfile key={user.id} user={user} members={MEMBER_OPTIONS} /> : null}
            {activeSection === "security" ? <AccountSecurity key={user.id} user={user} /> : null}
            {activeSection === "connected-accounts" ? <section id="connections" className="scroll-mt-24">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-xl border border-secondary bg-primary" />}>
                <ConnectedAccounts />
              </Suspense>
            </section> : null}
            <AccountSettingsHub key={user.id} accountId={user.id} section={activeSection} />
            {activeSection === "notifications" ? <section id="notifications" className="scroll-mt-24 space-y-6">
              <SocialNotificationSettings members={[
                { slug: "core", stageName: "CORE" },
                ...MEMBER_OPTIONS,
                ...CREW.filter((crew) => crew.socials.some((social) => social.platform === "x")).map((crew) => ({
                  slug: crewXAuthorSlug(crew.slug),
                  stageName: `${crew.name} · Crew`,
                  contentTypes: ["post"] as const,
                })),
              ]} />
              <NotificationSettings
                accountEmail={user.email}
                accountEmailVerified={user.emailVerified}
              />
            </section> : null}
            {activeSection === "privacy" ? <>
              <AccountDataExportCard accountId={user.id} />
              <AccountDeletionCard />
            </> : null}
      </AccountSettingsLayout>
      <SiteFooter />
    </>
  );
}

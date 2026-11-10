"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertCircle, Award, BookOpen, Check, IdCard, LayoutDashboard, RefreshCw, Settings, X } from "lucide-react";
import { usePassport } from "@/hooks/usePassport";
import { usePassportInventory } from "@/hooks/passport/usePassportInventory";
import { PassportOverview } from "./PassportOverview";
import { publicDisplayName } from "@/lib/profile-display";

const MemoryBook = dynamic(() => import("./MemoryBook").then((module) => module.MemoryBook));
const PassportAchievements = dynamic(() => import("./PassportAchievements").then((module) => module.PassportAchievements));
const PassportIdentity = dynamic(() => import("./PassportIdentity").then((module) => module.PassportIdentity));
const MemberCard = dynamic(() => import("./MemberCard").then((module) => module.MemberCard));

type PassportTab = "overview" | "memories" | "achievements" | "identity";

const TABS: Array<{ id: PassportTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Activity", icon: LayoutDashboard },
  { id: "memories", label: "Collection", icon: BookOpen },
  { id: "achievements", label: "Achievements", icon: Award },
  { id: "identity", label: "Profile", icon: IdCard },
];

export function PassportDashboard() {
  const passport = usePassport();
  const { refresh } = passport;
  const [tab, setTab] = useState<PassportTab>("overview");
  const inventory = usePassportInventory(passport.passport?.cards ?? [], {
    enabled: Boolean(passport.passport) && (tab === "memories" || tab === "identity"),
    autoLoadAll: tab === "identity",
    maxAutoPages: 50,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const requested = window.location.hash.slice(1) as PassportTab;
    if (TABS.some((item) => item.id === requested)) setTab(requested);
    const onHash = () => {
      const next = window.location.hash.slice(1) as PassportTab;
      if (TABS.some((item) => item.id === next)) setTab(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (next: PassportTab) => {
    setTab(next);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  if (passport.loading) return <PassportLoading />;
  if (!passport.passport) {
    return (
      <div className="passport-shell">
        <div className="passport-load-error"><AlertCircle aria-hidden="true" /><h1>Passport is temporarily unavailable.</h1><p>{passport.loadError ?? "We couldn’t load your Passport. Please try again."}</p><button type="button" className="passport-button passport-button--primary" onClick={() => void passport.refresh()}><RefreshCw aria-hidden="true" /> Try again</button></div>
      </div>
    );
  }

  const data = passport.passport;
  const displayName = publicDisplayName(data.profile.displayName);
  const channels = Array.from(new Set(data.channels.map((channel) => channel.channelSlug)));
  const busy = Boolean(passport.mutation.pendingAction);
  return (
    <div className="passport-shell">
      <header className="passport-hero">
        <div className="passport-cover" aria-hidden="true"><span>CORE</span><span>Passport</span></div>
        <div className="passport-hero__identity">
          <div><h1>My Passport</h1><p>{displayName} <span aria-hidden="true">·</span> Level {data.profile.level}</p><p className="passport-hero__description">Your moments, achievements and watch time.</p></div>
        </div>
        <Link href="/account/settings#connections" className="passport-button"><Settings aria-hidden="true" /> Connected accounts</Link>
      </header>

      <nav className="passport-tabs" aria-label="Passport sections">
        {TABS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" aria-label={item.label} className={tab === item.id ? "is-active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span></button>; })}
      </nav>

      <div className="passport-content">
        {passport.loadError ? <aside className="passport-inventory-sync" role="status"><AlertCircle aria-hidden="true" /><span>Couldn’t refresh your Passport. Showing the last saved activity.</span><button type="button" onClick={() => void passport.refresh()}>Try again</button></aside> : null}
        {tab === "overview" ? <><PassportOverview passport={data} onNavigate={navigate} onClaimPresence={passport.claimPresence} onClaimQuest={passport.claimQuest} onClaimCommunityGoal={passport.claimCommunityGoal} claiming={busy} /></> : null}
        {tab === "memories" ? <MemoryBook inventory={inventory} albums={data.albums} onClaimAlbum={passport.claimAlbum} claimingAlbum={busy} /> : null}
        {tab === "achievements" ? <PassportAchievements achievements={data.achievements} quests={data.quests} campaigns={data.campaigns} onClaimQuest={passport.claimQuest} claiming={busy} /> : null}
        {tab === "identity" ? <><MemberCard passport={data} /><InventorySyncStatus inventory={inventory} /></> : null}
        {tab === "identity" ? <PassportIdentity key={data.profile.userId} displayName={displayName} cards={inventory.cards} achievements={data.achievements} cosmetics={data.cosmeticCatalog} loadouts={data.loadouts} showcase={data.showcase} privacy={data.privacy} channelSlugs={channels} onSaveShowcase={passport.saveShowcase} onSaveLoadout={passport.saveLoadout} onActivateLoadout={passport.activateLoadout} onSavePrivacy={passport.savePrivacy} pending={busy} /> : null}
      </div>

      {passport.mutation.notice || passport.mutation.error ? (
        <aside className={`passport-status-toast ${passport.mutation.error ? "is-error" : "is-success"}`} aria-live={passport.mutation.error ? "assertive" : "polite"}>
          {passport.mutation.error ? <AlertCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
          <span>{passport.mutation.error ?? passport.mutation.notice}</span>
          <button type="button" onClick={passport.clearStatus} aria-label="Dismiss message"><X aria-hidden="true" /></button>
        </aside>
      ) : null}
    </div>
  );
}

function InventorySyncStatus({ inventory }: { inventory: ReturnType<typeof usePassportInventory> }) {
  if (!inventory.loading && !inventory.loadingMore && !inventory.error && !inventory.hasMore) return null;
  return (
    <aside className="passport-inventory-sync" aria-live="polite">
      <BookOpen aria-hidden="true" />
      <span>{inventory.error ?? (inventory.loading || inventory.loadingMore ? `Syncing your full collection · ${inventory.cards.length} loaded` : `${inventory.cards.length} cards loaded`)}</span>
      {inventory.error ? <button type="button" onClick={() => void inventory.reload()}>Try again</button> : inventory.hasMore && !inventory.loading ? <button type="button" disabled={inventory.loadingMore} onClick={() => void inventory.loadMore()}>{inventory.loadingMore ? "Loading…" : "Load more"}</button> : null}
    </aside>
  );
}

function PassportLoading() {
  return (
    <div className="passport-shell" aria-busy="true" aria-label="Loading CORE Passport">
      <div className="passport-skeleton passport-skeleton--hero" />
      <div className="passport-skeleton passport-skeleton--tabs" />
      <div className="passport-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <div key={index} className="passport-skeleton" />)}</div>
    </div>
  );
}

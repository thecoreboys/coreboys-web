"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, IdCard, MessageCircle, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
import type {
  PassportAchievement,
  PassportCard,
  PassportCosmetic,
  PassportLoadout,
  PassportPrivacy,
  PassportPrivacyLevel,
} from "@/lib/passport/types";
import { passportScope } from "@/hooks/usePassport";
import { NativeSelect } from "@/components/base/select/select-native";
import { MomentCardBack, MomentCardTile } from "./MomentCard";
import { PassportDialog } from "./PassportDialog";
import { channelLabel } from "./passport-utils";

type SaveLoadout = (loadout: Omit<PassportLoadout, "updatedAt">) => Promise<unknown>;

export function PassportIdentity({
  cards,
  achievements,
  cosmetics,
  loadouts,
  showcase,
  privacy,
  channelSlugs,
  onSaveShowcase,
  onSaveLoadout,
  onActivateLoadout,
  onSavePrivacy,
  pending,
}: {
  cards: PassportCard[];
  achievements: PassportAchievement[];
  cosmetics: PassportCosmetic[];
  loadouts: PassportLoadout[];
  showcase: { cardIds: string[]; achievementCodes: string[] };
  privacy: PassportPrivacy;
  channelSlugs: string[];
  onSaveShowcase: (cardIds: string[], achievementCodes: string[]) => Promise<unknown>;
  onSaveLoadout: SaveLoadout;
  onActivateLoadout: (scope: string) => Promise<unknown>;
  onSavePrivacy: (privacy: PassportPrivacy) => Promise<unknown>;
  pending: boolean;
}) {
  const [showcaseCards, setShowcaseCards] = useState(showcase.cardIds);
  const [showcaseBadges, setShowcaseBadges] = useState(showcase.achievementCodes);
  const [selectedCard, setSelectedCard] = useState<PassportCard | null>(null);
  const [privacyDraft, setPrivacyDraft] = useState(privacy);
  const [scope, setScope] = useState("global");
  const [showcaseQuery, setShowcaseQuery] = useState("");
  const [showcaseLimit, setShowcaseLimit] = useState(24);

  useEffect(() => { setShowcaseCards(showcase.cardIds); setShowcaseBadges(showcase.achievementCodes); }, [showcase]);
  useEffect(() => setPrivacyDraft(privacy), [privacy]);

  const earned = achievements.filter((achievement) => achievement.earned);
  const matchingShowcaseCards = useMemo(() => {
    const query = showcaseQuery.trim().toLocaleLowerCase();
    if (!query) return cards;
    return cards.filter((card) => [card.name, card.eventTitle, card.channelSlug, card.variant, card.editionCode]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(query)));
  }, [cards, showcaseQuery]);
  const toggleLimited = (values: string[], value: string, limit: number) =>
    values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value].slice(-limit);

  return (
    <div className="passport-section-stack">
      <section className="passport-section-heading">
        <div>
          <span className="passport-kicker"><IdCard aria-hidden="true" /> Identity studio</span>
          <h2>Wear the memories you earned.</h2>
          <p>Your account permissions are separate. These appearance settings only change how your profile is shown.</p>
        </div>
      </section>

      <section className="passport-identity-section">
        <header><div><h3>Profile showcase</h3><p>Choose up to three verified records and three earned milestones for your public profile.</p></div><button type="button" className="passport-button passport-button--primary" disabled={pending} onClick={() => void onSaveShowcase(showcaseCards, showcaseBadges).catch(() => {})}><Save aria-hidden="true" /> Save showcase</button></header>
        <div className="passport-showcase-layout">
          <div>
            <h4>Featured records <span>{showcaseCards.length}/3</span></h4>
            <div className="passport-showcase-search">
              <label><Search aria-hidden="true" /><span className="sr-only">Search full card collection</span><input value={showcaseQuery} onChange={(event) => { setShowcaseQuery(event.target.value); setShowcaseLimit(24); }} placeholder="Search your full collection" /></label>
              <small>{matchingShowcaseCards.length} matching cards</small>
            </div>
            <div className="passport-card-picker">
              {matchingShowcaseCards.slice(0, showcaseLimit).map((card) => <MomentCardTile key={card.id} card={card} selected={showcaseCards.includes(card.id)} onSelect={() => setShowcaseCards((current) => toggleLimited(current, card.id, 3))} onOpen={() => setSelectedCard(card)} compact />)}
            </div>
            {matchingShowcaseCards.length > showcaseLimit ? <button type="button" className="passport-button passport-button--small passport-showcase-more" onClick={() => setShowcaseLimit((current) => current + 24)}>Show more cards</button> : null}
          </div>
          <div>
            <h4>Featured milestones <span>{showcaseBadges.length}/3</span></h4>
            <div className="passport-badge-picker">
              {earned.map((achievement) => {
                const selected = showcaseBadges.includes(achievement.code);
                return <button key={achievement.code} type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} onClick={() => setShowcaseBadges((current) => toggleLimited(current, achievement.code, 3))}><span><Sparkles aria-hidden="true" /></span><strong>{achievement.name}</strong><small>{achievement.tier}</small>{selected ? <Check className="passport-picker-check" aria-hidden="true" /> : null}</button>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="passport-identity-section">
        <header><div><h3>Channel identity loadouts</h3><p>Chat and channel pages can automatically use the identity you saved for that community.</p></div></header>
        <div className="passport-scope-tabs" role="tablist" aria-label="Identity scope">
          <button type="button" role="tab" aria-selected={scope === "global"} className={scope === "global" ? "is-active" : ""} onClick={() => setScope("global")}>Everywhere</button>
          {channelSlugs.map((slug) => { const value = passportScope(slug); return <button key={slug} type="button" role="tab" aria-selected={scope === value} className={scope === value ? "is-active" : ""} onClick={() => setScope(value)}>{channelLabel(slug)}</button>; })}
        </div>
        <LoadoutEditor
          key={scope}
          scope={scope}
          cards={cards}
          achievements={earned}
          cosmetics={cosmetics}
          loadout={loadouts.find((candidate) => candidate.scope === scope) ?? null}
          onSave={onSaveLoadout}
          onActivate={onActivateLoadout}
          pending={pending}
        />
      </section>

      <PrivacyEditor value={privacyDraft} onChange={setPrivacyDraft} onSave={onSavePrivacy} pending={pending} />

      <PassportDialog open={Boolean(selectedCard)} title={selectedCard?.name ?? "Verified record"} onClose={() => setSelectedCard(null)} wide>
        {selectedCard ? <MomentCardBack card={selectedCard} /> : null}
      </PassportDialog>
    </div>
  );
}

function cosmeticOptions(cosmetics: PassportCosmetic[], kind: PassportCosmetic["kind"], scope: string) {
  const channel = scope.startsWith("channel:") ? scope.slice("channel:".length) : null;
  return cosmetics.filter((cosmetic) => cosmetic.unlocked && cosmetic.kind === kind && (!cosmetic.channelSlug || cosmetic.channelSlug === channel));
}

function LoadoutEditor({
  scope,
  cards,
  achievements,
  cosmetics,
  loadout,
  onSave,
  onActivate,
  pending,
}: {
  scope: string;
  cards: PassportCard[];
  achievements: PassportAchievement[];
  cosmetics: PassportCosmetic[];
  loadout: PassportLoadout | null;
  onSave: SaveLoadout;
  onActivate: (scope: string) => Promise<unknown>;
  pending: boolean;
}) {
  const initial = useMemo<Omit<PassportLoadout, "updatedAt">>(() => ({
    scope,
    titleCode: loadout?.titleCode ?? null,
    nameplateCode: loadout?.nameplateCode ?? null,
    frameCode: loadout?.frameCode ?? null,
    themeCode: loadout?.themeCode ?? null,
    reactionCodes: loadout?.reactionCodes ?? [],
    featuredCardId: loadout?.featuredCardId ?? null,
    badgeCodes: loadout?.badgeCodes ?? [],
  }), [loadout, scope]);
  const [draft, setDraft] = useState(initial);
  const channel = scope.startsWith("channel:") ? scope.slice("channel:".length) : null;
  const eligibleCards = cards.filter((card) => !channel || card.channelSlug === channel);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="passport-loadout-editor">
      <aside className="passport-identity-preview">
        <div className="passport-identity-preview__avatar"><IdCard aria-hidden="true" /></div>
        <div><strong>Your display name</strong><span>{cosmetics.find((item) => item.code === draft.titleCode)?.name ?? "CORE Member"}</span></div>
        {draft.featuredCardId ? <small>Featured: {cards.find((card) => card.id === draft.featuredCardId)?.name}</small> : null}
        <p><MessageCircle aria-hidden="true" /> This is how your identity can appear in channel chat.</p>
      </aside>
      <div className="passport-identity-controls">
        <div className="passport-form-grid">
          <CosmeticSelect label="Title" value={draft.titleCode} options={cosmeticOptions(cosmetics, "title", scope)} onChange={(value) => set("titleCode", value)} />
          <CosmeticSelect label="Nameplate" value={draft.nameplateCode} options={cosmeticOptions(cosmetics, "nameplate", scope)} onChange={(value) => set("nameplateCode", value)} />
          <CosmeticSelect label="Avatar frame" value={draft.frameCode} options={cosmeticOptions(cosmetics, "frame", scope)} onChange={(value) => set("frameCode", value)} />
          <CosmeticSelect label="Theme" value={draft.themeCode} options={cosmeticOptions(cosmetics, "theme", scope)} onChange={(value) => set("themeCode", value)} />
          <NativeSelect label="Featured record" value={draft.featuredCardId ?? ""} onChange={(event) => set("featuredCardId", event.target.value || null)} options={[{ value: "", label: "No featured record" }, ...eligibleCards.map((card) => ({ value: card.id, label: `${card.name} · #${card.serialNumber ?? "—"}` }))]} size="sm" />
        </div>
        <fieldset className="passport-inline-picker"><legend>Chat badges · pick 3</legend>{achievements.map((achievement) => { const selected = draft.badgeCodes.includes(achievement.code); return <button key={achievement.code} type="button" aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => set("badgeCodes", selected ? draft.badgeCodes.filter((code) => code !== achievement.code) : [...draft.badgeCodes, achievement.code].slice(-3))}>{achievement.name}</button>; })}</fieldset>
        <fieldset className="passport-inline-picker"><legend>Reaction pack</legend>{cosmeticOptions(cosmetics, "reaction", scope).map((reaction) => { const selected = draft.reactionCodes.includes(reaction.code); return <button key={reaction.code} type="button" aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => set("reactionCodes", selected ? draft.reactionCodes.filter((code) => code !== reaction.code) : [...draft.reactionCodes, reaction.code].slice(-6))}>{reaction.name}</button>; })}</fieldset>
        <div className="passport-action-row"><button type="button" className="passport-button passport-button--primary" disabled={pending} onClick={() => void onSave(draft).catch(() => {})}><Save aria-hidden="true" /> Save identity</button><button type="button" className="passport-button" disabled={pending || !loadout} onClick={() => void onActivate(scope).catch(() => {})}><Check aria-hidden="true" /> Use now</button></div>
      </div>
    </div>
  );
}

function CosmeticSelect({ label, value, options, onChange }: { label: string; value: string | null; options: PassportCosmetic[]; onChange: (value: string | null) => void }) {
  return <NativeSelect label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} options={[{ value: "", label: "Default" }, ...options.map((option) => ({ value: option.code, label: option.name }))]} size="sm" />;
}

const PRIVACY_OPTIONS: Array<{ value: PassportPrivacyLevel; label: string; copy: string }> = [
  { value: "public", label: "Public", copy: "Anyone can see it." },
  { value: "members", label: "CORE members", copy: "Signed-in members only." },
  { value: "private", label: "Private", copy: "Only you can see it." },
];

function PrivacyEditor({ value, onChange, onSave, pending }: { value: PassportPrivacy; onChange: (value: PassportPrivacy) => void; onSave: (value: PassportPrivacy) => Promise<unknown>; pending: boolean }) {
  const rows: Array<{ key: keyof PassportPrivacy; label: string; copy: string }> = [
    { key: "profile", label: "Passport profile", copy: "Your level, title, and featured identity." },
    { key: "inventory", label: "Memory Book", copy: "Cards, albums, and collection details." },
    { key: "activity", label: "Earned dates", copy: "When achievements and memories were earned." },
    { key: "channelAffinity", label: "Channel affinity", copy: "Channel XP, levels, and favorite communities." },
  ];
  return (
    <section className="passport-identity-section passport-privacy">
      <header><div><h3><ShieldCheck aria-hidden="true" /> Privacy</h3><p>You decide who can see each part of your Passport. These choices never affect eligibility.</p></div><button type="button" className="passport-button passport-button--primary" disabled={pending} onClick={() => void onSave(value).catch(() => {})}><Save aria-hidden="true" /> Save privacy</button></header>
      <div className="passport-privacy-grid">
        {rows.map((row) => <div key={row.key} className="passport-privacy__row"><span className="passport-privacy__icon">{value[row.key] === "private" ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</span><span><strong>{row.label}</strong><small>{row.copy}</small></span><NativeSelect aria-label={`${row.label} visibility`} value={value[row.key]} onChange={(event) => onChange({ ...value, [row.key]: event.target.value as PassportPrivacyLevel })} options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} size="sm" /></div>)}
      </div>
    </section>
  );
}

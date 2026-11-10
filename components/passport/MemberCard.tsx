"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, Palette, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import type { PassportDashboard } from "@/lib/passport/types";
import { NativeSelect } from "@/components/base/select/select-native";
import { publicDisplayName } from "@/lib/profile-display";

type CardSkin = "classic" | "obsidian" | "prism";
type CardStyle = { skin: CardSkin; accent: string };
const STORAGE_KEY = "core-member-card-style:v2";
const DEFAULT_STYLE: CardStyle = { skin: "classic", accent: "#e31b36" };

export function MemberCard({ passport }: { passport: PassportDashboard }) {
  const subscription = useSubscription();
  const [style, setStyle] = useState<CardStyle>(DEFAULT_STYLE);
  const canCustomize = subscription.hasFeature("passport.card_customization");
  const storageKey = `${STORAGE_KEY}:${passport.profile.userId}`;
  const displayName = publicDisplayName(passport.profile.displayName);

  useEffect(() => {
    setStyle(DEFAULT_STYLE);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "") as Partial<CardStyle>;
      if ((saved.skin === "classic" || saved.skin === "obsidian" || saved.skin === "prism") && /^#[0-9a-f]{6}$/i.test(saved.accent ?? "")) {
        setStyle({ skin: saved.skin, accent: saved.accent! });
      }
    } catch {
      // The classic card remains available when local preferences are blocked.
    }
  }, [storageKey]);

  const update = (next: Partial<CardStyle>) => {
    if (!canCustomize) return;
    const value = { ...style, ...next };
    setStyle(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* optional preference */ }
  };

  const cardClass = style.skin === "prism"
    ? "bg-[#eef2f6]"
    : style.skin === "obsidian"
      ? "bg-[#e8ebef]"
      : "bg-[#efe2c8]";

  return (
    <section className="passport-member-card overflow-hidden rounded-xl border border-primary bg-primary p-4 sm:p-5" aria-label="Your CORE Passport identity">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold text-primary">Passport card</h2><p className="mt-1 text-sm text-tertiary">Your account at a glance.</p></div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary"><Sparkles className="size-3" /> {passport.profile.sparks.toLocaleString("en-US")} Sparks</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,44rem)_15rem] lg:items-center">
        <article className={`passport-member-card__document relative max-w-2xl overflow-hidden rounded-xl ${cardClass} p-4 shadow-sm ring-1 ring-black/10`} style={{ borderTop: `3px solid ${style.accent}` }}>
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between"><span className="text-xs font-semibold text-[#30343b]">CORE Passport</span></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5b616b]">Member</p><h3 className="mt-1 text-2xl font-black tracking-[-0.045em] text-[#14161a] sm:text-3xl">{displayName}</h3><div className="mt-3 flex items-end justify-between"><span><strong className="block text-xl text-[#14161a]">Level {passport.profile.level}</strong><small className="text-[10px] text-[#5b616b]">{passport.globalProgress.xp.toLocaleString("en-US")} XP recorded</small></span><span className="text-right"><strong className="block text-xl text-[#14161a]">{passport.recap.cardsCollected}</strong><small className="text-[10px] text-[#5b616b]">Collected moments</small></span></div></div>
          </div>
        </article>

        {canCustomize ? (
          <div className="space-y-3 rounded-2xl bg-secondary p-3 ring-1 ring-secondary">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary"><Palette className="size-4 text-tertiary" /> Appearance</div>
            <NativeSelect label="Card style" value={style.skin} onChange={(event) => update({ skin: event.target.value as CardSkin })} options={[{ value: "classic", label: "Classic" }, { value: "obsidian", label: "Soft gray" }, { value: "prism", label: "Cool gray" }]} size="sm" />
            <label className="grid gap-1 text-[10px] text-tertiary">Accent color<input aria-label="Accent color" type="color" value={style.accent} onChange={(event) => update({ accent: event.target.value })} className="h-10 w-full cursor-pointer rounded-lg bg-primary p-1 ring-1 ring-primary" /></label>
            <p className="text-[10px] leading-4 text-tertiary">Appearance changes are saved on this device and do not change your recorded activity.</p>
          </div>
        ) : (
          <Link href={subscription.featureHref("passport.card_customization") as never} className="passport-card-appearance flex items-center gap-3 rounded-xl bg-secondary p-4 text-left ring-1 ring-primary transition hover:bg-tertiary"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary"><LockKeyhole className="size-4" /></span><span><span className="block text-sm font-semibold text-primary">Card appearance</span><span className="mt-1 block text-xs leading-5 text-tertiary">Customize with membership</span></span></Link>
        )}
      </div>
    </section>
  );
}

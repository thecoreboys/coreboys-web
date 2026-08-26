"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, Palette, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import type { PassportDashboard } from "@/lib/passport/types";

type CardSkin = "classic" | "obsidian" | "prism";
type CardStyle = { skin: CardSkin; accent: string };
const STORAGE_KEY = "core-member-card-style:v1";
const DEFAULT_STYLE: CardStyle = { skin: "classic", accent: "#e31b36" };

export function MemberCard({ passport }: { passport: PassportDashboard }) {
  const subscription = useSubscription();
  const [style, setStyle] = useState<CardStyle>(DEFAULT_STYLE);
  const canCustomize = subscription.hasFeature("passport.card_customization");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as Partial<CardStyle>;
      if ((saved.skin === "classic" || saved.skin === "obsidian" || saved.skin === "prism") && /^#[0-9a-f]{6}$/i.test(saved.accent ?? "")) {
        setStyle({ skin: saved.skin, accent: saved.accent! });
      }
    } catch {
      // The classic card remains available when local preferences are blocked.
    }
  }, []);

  const update = (next: Partial<CardStyle>) => {
    if (!canCustomize) return;
    const value = { ...style, ...next };
    setStyle(value);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* optional preference */ }
  };

  const cardClass = style.skin === "prism"
    ? "from-[#161224] via-[#10243a] to-[#3c1b4d]"
    : style.skin === "obsidian"
      ? "from-[#18181b] via-[#070709] to-[#171820]"
      : "from-[#2a0a0e] via-[#141215] to-[#10131d]";

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5" aria-label="Your CORE membership card">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">CORE membership card</p><h2 className="mt-1 text-lg font-semibold text-white">Your player card</h2><p className="mt-1 text-xs text-white/45">Progress is tracked for every site user. Membership unlocks card skins and colorways.</p></div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/7 px-2.5 py-1 text-[10px] font-semibold text-white/65"><Sparkles className="size-3" /> {passport.profile.sparks.toLocaleString("en-US")} Sparks</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-center">
        <article className={`relative aspect-[1.58/1] overflow-hidden rounded-2xl bg-gradient-to-br ${cardClass} p-4 shadow-[0_22px_55px_rgba(0,0,0,.38)] ring-1 ring-white/20`} style={{ ["--member-card-accent" as string]: style.accent }}>
          <span className="absolute -right-8 -top-10 size-40 rounded-full bg-[var(--member-card-accent)] opacity-35 blur-2xl" />
          <span className="absolute inset-0 bg-[linear-gradient(115deg,transparent_25%,rgba(255,255,255,.13)_42%,transparent_58%)] opacity-60" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between"><span className="rounded-md border border-white/25 bg-black/25 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white">CORE SITE USER</span><span className="text-[10px] font-bold tracking-[0.18em] text-white/55">#{passport.profile.level.toString().padStart(2, "0")}</span></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/55">Season one</p><h3 className="mt-1 text-2xl font-black tracking-[-0.045em] text-white sm:text-3xl">{passport.profile.displayName}</h3><div className="mt-3 flex items-end justify-between"><span><strong className="block text-xl text-white">LVL {passport.profile.level}</strong><small className="text-[10px] text-white/55">{passport.globalProgress.xp.toLocaleString("en-US")} XP</small></span><span className="text-right"><strong className="block text-xl text-white">{passport.recap.cardsCollected}</strong><small className="text-[10px] text-white/55">Moment cards</small></span></div></div>
          </div>
        </article>

        {canCustomize ? (
          <div className="space-y-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/8">
            <div className="flex items-center gap-2 text-xs font-semibold text-white"><Palette className="size-4 text-white/60" /> Card studio</div>
            <label className="grid gap-1 text-[10px] text-white/48">Skin<select value={style.skin} onChange={(event) => update({ skin: event.target.value as CardSkin })} className="min-h-10 rounded-xl bg-white/7 px-3 text-xs text-white outline-none ring-1 ring-white/10"><option value="classic">Classic</option><option value="obsidian">Obsidian</option><option value="prism">Prism</option></select></label>
            <label className="grid gap-1 text-[10px] text-white/48">Accent color<input type="color" value={style.accent} onChange={(event) => update({ accent: event.target.value })} className="h-10 w-full cursor-pointer rounded-xl bg-white/7 p-1 ring-1 ring-white/10" /></label>
            <p className="text-[10px] leading-4 text-white/38">Spend Sparks in future drops for additional card backs, frames, and visual effects.</p>
          </div>
        ) : (
          <Link href={subscription.featureHref("passport.card_customization") as never} className="flex min-h-32 items-center gap-3 rounded-2xl bg-white/[0.04] p-4 text-left ring-1 ring-white/10 transition hover:bg-white/[0.07] hover:ring-white/20"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-black"><LockKeyhole className="size-4" /></span><span><span className="block text-xs font-semibold text-white">Unlock Card Studio</span><span className="mt-1 block text-[10px] leading-4 text-white/45">CORE Membership adds skins and custom colorways while keeping your card’s earned stats intact.</span></span></Link>
        )}
      </div>
    </section>
  );
}

import type { PassportCosmetic, PublicPassportProfile } from "@/lib/passport/types";
import { channelLabel, formatCompact } from "@/components/passport/passport-utils";
import { passportXpForLevel } from "@/lib/passport/policy";

function rarityClass(rarity: string) {
  if (rarity === "legendary") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  if (rarity === "historic") return "border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100";
  if (rarity === "rare") return "border-sky-300/35 bg-sky-300/10 text-sky-100";
  return "border-white/15 bg-white/5 text-secondary";
}

function cosmeticAccent(cosmetic: PassportCosmetic | null) {
  const value = cosmetic?.asset.accent;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function cosmeticLabel(cosmetic: PassportCosmetic | null) {
  const label = cosmetic?.asset.label;
  return typeof label === "string" && label.trim()
    ? label.trim().slice(0, 48)
    : cosmetic?.name ?? null;
}

export function PublicPassportShowcase({ passport }: { passport: PublicPassportProfile }) {
  const visibleAchievements = passport.achievements.filter((achievement) => !achievement.secret || achievement.earned);
  const loadout = passport.identity.loadout;
  const cosmetic = (kind: PassportCosmetic["kind"]) =>
    passport.identity.cosmetics.find((item) => item.kind === kind) ?? null;
  const title = cosmetic("title");
  const nameplate = cosmetic("nameplate");
  const frame = cosmetic("frame") ?? cosmetic("avatar_frame");
  const theme = cosmetic("theme");
  const accent = cosmeticAccent(theme) ?? cosmeticAccent(nameplate) ?? cosmeticAccent(frame) ?? "#e31b36";
  const activeTitle = cosmeticLabel(title) ?? passport.profile.displayTitle ?? "Community member";
  const identityScope = passport.identity.scope.startsWith("channel:")
    ? `${channelLabel(passport.identity.scope.slice("channel:".length))} identity`
    : "Global identity";
  const equippedBadges = new Set(loadout?.badgeCodes ?? []);
  const equippedVisuals = [title, nameplate, frame, theme].filter((item): item is PassportCosmetic => Boolean(item));
  return (
    <section className="mt-10 space-y-8" aria-labelledby="passport-heading">
      <div
        className="rounded-2xl border bg-secondary p-5 shadow-lg sm:p-6"
        style={{
          borderColor: `${accent}80`,
          backgroundImage: `radial-gradient(circle at top right, ${accent}38, transparent 46%)`,
          boxShadow: `0 20px 55px ${accent}18`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 bg-primary text-xl font-black text-primary shadow-lg"
              style={{ borderColor: cosmeticAccent(frame) ?? accent, boxShadow: `0 0 0 4px ${accent}20` }}
              aria-hidden="true"
            >
              {passport.profile.displayName.trim().charAt(0).toLocaleUpperCase() || "C"}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent }}>
                CORE Passport · {identityScope}
              </p>
              <span
                className="mt-2 inline-flex max-w-full rounded-full border px-3 py-1 text-sm font-semibold"
                style={{ borderColor: `${accent}80`, backgroundColor: `${accent}20`, color: accent }}
              >
                <span className="truncate">{passport.profile.displayName}</span>
              </span>
              <h2 id="passport-heading" className="mt-2 text-2xl font-semibold tracking-tight text-primary">
                {activeTitle}
              </h2>
              {passport.profile.displayTitle && passport.profile.displayTitle !== activeTitle ? <p className="mt-1 text-sm text-tertiary">{passport.profile.displayTitle}</p> : null}
            </div>
          </div>
          <span className="rounded-full border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: `${accent}80`, backgroundColor: `${accent}20`, color: accent }}>
            Level {passport.profile.level}
          </span>
        </div>
        <p className="mt-4 text-sm text-tertiary">Moments, achievements, and channel history chosen for this profile.</p>
        {equippedVisuals.length ? (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Equipped Passport identity">
            {equippedVisuals.map((item) => <span key={item.code} className="rounded-full border border-secondary bg-primary px-2.5 py-1 text-[11px] font-semibold text-secondary"><span className="capitalize">{item.kind.replace("_", " ")}</span> · {item.name}</span>)}
          </div>
        ) : null}
      </div>

      {passport.showcase.length ? (
        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-quaternary">Featured memories</p>
              <h3 className="mt-1 text-xl font-semibold text-primary">Digital trading cards</h3>
            </div>
            <span className="text-xs text-quaternary">Account-verified provenance</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {passport.showcase.map((card) => (
              <article key={card.id} className={`group relative isolate aspect-[5/7] overflow-hidden rounded-2xl border shadow-lg ${rarityClass(card.rarity)}`}>
                {card.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.artworkUrl} alt="" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_26%),linear-gradient(145deg,rgba(227,27,54,0.5),rgba(8,8,10,0.92)_70%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/5" />
                {loadout?.featuredCardId === card.id ? <span className="absolute left-3 top-3 z-10 rounded-full border border-white/25 bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-white">Featured identity</span> : null}
                <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    <span>{card.rarity}</span>
                    {card.serialNumber ? <span>#{card.serialNumber}</span> : null}
                  </div>
                  <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-tight text-white sm:text-base">{card.name}</h4>
                  <p className="mt-1 text-[11px] text-white/65">{channelLabel(card.channelSlug)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {visibleAchievements.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-quaternary">Earned achievements</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleAchievements.map((achievement) => (
              <span key={achievement.code} title={achievement.description} className="inline-flex items-center gap-2 rounded-full border border-secondary bg-secondary px-3 py-2 text-sm font-semibold text-primary">
                <span aria-hidden>{achievement.tier === "icon" ? "✦" : achievement.tier === "gold" ? "★" : "◆"}</span>
                {achievement.name}
                {equippedBadges.has(achievement.code) ? <small className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide" style={{ backgroundColor: `${accent}20`, color: accent }}>Equipped</small> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {passport.channels.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-quaternary">Channel affinity</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {passport.channels.slice(0, 6).map((channel) => {
              const levelStart = passportXpForLevel(channel.level);
              const range = Math.max(1, channel.nextLevelXp - levelStart);
              const percent = Math.max(0, Math.min(100, ((channel.xp - levelStart) / range) * 100));
              return (
                <article key={channel.channelSlug} className="rounded-xl border border-secondary bg-secondary p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-primary">{channelLabel(channel.channelSlug)}</h4>
                    <span className="text-xs font-semibold text-brand-secondary">Level {channel.level}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary" aria-label={`${Math.round(percent)} percent to the next channel level`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
                    <div className="h-full rounded-full bg-brand-solid" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-quaternary">{formatCompact(channel.xp)} XP · {channel.eventsAttended} live {channel.eventsAttended === 1 ? "event" : "events"}</p>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

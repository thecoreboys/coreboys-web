"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

export type MemberCardData = {
  slug: string;
  stageName: string;
  realName: string;
  accent: string;
  index: string;
  avatarUrl: string;
  commName: string;
  commLogo: string;
  twitchFollowers: number | null;
};

/**
 * Hero-grade members grid. The boys roster is the page's centerpiece —
 * cards are tall (3:5), full-bleed Twitch avatars, animated accent
 * border, follower-count boast in the corner, real name + comm
 * underneath. Designed to feel like a roster you'd see on 100T.
 */
export function MembersGridClient({ cards }: { cards: MemberCardData[] }) {
  return (
    <section
      id="members"
      className="relative border-t border-[color:var(--rule)] bg-[color:var(--bg)]"
    >
      {/* Atmospheric bloom under the section */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(239,68,68,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1440px] px-6 py-20 md:px-8 md:py-32">
        <header className="mb-12 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 md:col-span-7">
            <p className="eyebrow">Roster · 6</p>
            <h2 className="mt-3 text-display text-[clamp(48px,7vw,96px)] font-black leading-[0.9] tracking-[-0.04em] text-[color:var(--ink)]">
              Meet the boys.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-5 md:text-right">
            <p className="text-[16px] leading-relaxed text-[color:var(--ink-dim)] md:text-[17px]">
              Six creators, six communities.
            </p>
          </div>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => (
            <motion.li
              key={c.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <MemberCard card={c} />
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MemberCard({ card }: { card: MemberCardData }) {
  return (
    <Link
      href={`/m/${card.slug}` as `/m/${string}`}
      className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black transition-all duration-500"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = card.accent;
        e.currentTarget.style.boxShadow = `0 24px 60px -24px ${card.accent}99, inset 0 0 0 1px ${card.accent}66`;
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.transform = "";
      }}
      aria-label={`Open ${card.stageName}`}
    >
      {/* Photo — full bleed, face anchored in the upper third. */}
      <Image
        src={card.avatarUrl}
        alt={`${card.stageName} — ${card.realName}`}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
        className="object-cover grayscale-[0.45] transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.05]"
        style={{ objectPosition: "50% 22%" }}
      />

      {/* Bottom-up accent fade — keeps text readable + tints to member color on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            "linear-gradient(180deg, transparent 30%, rgba(8,8,10,0.6) 60%, rgba(8,8,10,0.96) 100%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(180deg, transparent 50%, ${card.accent}3f 100%)`,
        }}
      />

      {/* Subtle scanlines */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Comm logo top-right — no chrome, just the mark. */}
      <div className="absolute right-4 top-4">
        <span className="block h-16 w-16" title={`${card.commName} comm`}>
          <Image
            src={card.commLogo}
            alt={`${card.commName} logo`}
            width={64}
            height={64}
            className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
            style={{ transform: `scale(${commScaleFor(card.commName)})`, transformOrigin: "center" }}
          />
        </span>
      </div>

      {/* Bottom — name + real name only. Comm moved to top corner. */}
      <div className="absolute inset-x-5 bottom-5">
        <h3 className="text-display text-[clamp(28px,3vw,42px)] font-black leading-[0.94] tracking-[-0.02em] text-on-image">
          {card.stageName}
        </h3>
        <p className="mt-1 text-[13px] font-medium text-on-image-dim">{card.realName}</p>
      </div>
    </Link>
  );
}

/**
 * Comm logo PNGs have very different amounts of internal padding so
 * `object-contain` alone makes some marks tiny. Per-comm scale tunes
 * each one to roughly fill the chip.
 */
function commScaleFor(name: string): number {
  switch (name.toLowerCase()) {
    case "m3":
      return 1.45;
    case "flock":
      return 1.4;
    case "stable":
      return 1.05;
    case "thugs":
      return 1.05;
    case "nms":
      return 1.05;
    case "slg":
      return 1.05;
    default:
      return 1;
  }
}



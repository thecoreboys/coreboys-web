import { CopyAddress } from "./CopyAddress";
import { canonicalFor, clipboardPayloadFor, type MailMember } from "@/lib/fan-mail";

/**
 * One paper card per member. Cream background, slight rotation per slug
 * for the "pile of mail" feel, postage stamp graphic in the top-right
 * with the member's initial in a wonky serif italic, postmark ring half-
 * overlapping the stamp. Address block in typewriter face.
 *
 * Semantic <article> with an id matching the slug so /fan-mail#ron
 * deep-links cleanly.
 */
export function MailCard({ member }: { member: MailMember }) {
  // Stable per-slug rotation — same member always tilts the same way so
  // the pile feels intentional rather than re-shuffled on every render.
  const rotate = ROTATIONS[member.slug] ?? 0;
  const accent = canonicalFor(member.slug)?.accent;
  const stampBg = stampBgFor(member.slug);
  const payload = clipboardPayloadFor(member);

  return (
    <article
      id={member.slug}
      aria-label={`Send fan mail to ${member.displayName}`}
      className="paper-card scroll-mt-32 md:scroll-mt-24"
      style={
        {
          "--paper-rotate": `${rotate}deg`,
          ...(stampBg ? { "--stamp-bg": stampBg.bg, "--stamp-bg-base": stampBg.base } : {}),
        } as React.CSSProperties
      }
    >
      {/* Stamp + postmark — anchored top-right, layered. */}
      <div className="pointer-events-none absolute right-5 top-5 hidden items-start sm:flex">
        <span
          className="postmark"
          style={{ right: "62px", top: "16px", borderColor: accent ?? undefined, color: accent ?? undefined }}
          aria-hidden="true"
        >
          <span>
            VAN&nbsp;NUYS
            <br />
            CA · USA
            <br />
            {currentMonthYear()}
          </span>
        </span>

        <span className="postage-stamp" aria-hidden="true">
          <span className="postage-stamp__inner">
            <span className="postage-stamp__initial">{member.initial}</span>
            <span className="postage-stamp__caption">USA · Forever</span>
          </span>
        </span>
      </div>

      {/* Header */}
      <header className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-ink-dim)]">
          To
        </p>
        <h2 className="font-editorial-serif mt-1 text-[40px] font-semibold leading-[0.95] tracking-[-0.02em] text-[color:var(--paper-ink)] sm:text-[56px]">
          {member.displayName}
        </h2>
      </header>

      {/* Address block */}
      <div className="mt-6 max-w-[420px]">
        <p className="address-block">
          <span className="block">{member.displayName}</span>
          {member.addressLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        {member.note ? (
          <p className="mt-3 max-w-[400px] text-[12px] italic leading-snug text-[color:var(--paper-ink-dim)]">
            {member.note}
          </p>
        ) : null}
      </div>

      {/* Action row */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyAddress payload={payload} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--paper-ink-dim)]">
          /send-to-{member.slug}
        </span>
      </div>
    </article>
  );
}

/**
 * Stable rotation per member. Hand-chosen so the pile reads as
 * intentional — alternating ±, capped at 2.5deg so cards don't feel
 * unstable.
 */
const ROTATIONS: Record<string, number> = {
  ron: -1.6,
  jason: 1.2,
  lacy: -2.2,
  marlon: 1.8,
  adapt: -0.8,
};

/**
 * Stamp interior color per member — pulled from their accent so the
 * postage feels personal without overwhelming the cream paper.
 */
function stampBgFor(slug: string): { bg: string; base: string } | null {
  const accent = canonicalFor(slug)?.accent;
  if (!accent) return null;
  // Two-tone stamp: a soft accent halo over a tinted base.
  return {
    bg: `${accent}55`,
    base: `${accent}33`,
  };
}

function currentMonthYear(): string {
  const d = new Date();
  return d
    .toLocaleString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
}

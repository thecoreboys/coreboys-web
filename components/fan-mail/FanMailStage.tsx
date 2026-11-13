import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "@untitledui/icons";
import type { MailMember } from "@/lib/fan-mail";
import type { FanMailStage as Stage } from "@/lib/fan-mail-stages";
import type { PostcardIdentity } from "@/lib/postcard-identities";
import { MailCard } from "./MailCard";
import styles from "./FanMail.module.css";
import { fitTitleSize, fontStyle, stageVars } from "./stage-style";

/**
 * Full-bleed hero for a creator's fan-mail page. The backdrop, type and ticker
 * come from that creator's postcard identity, and the postcard itself sits in
 * the hero so the address is visible without scrolling.
 */
export function FanMailStage({ member, identity, stage }: { member: MailMember; identity: PostcardIdentity; stage: Stage }) {
  const city = member.addressLines[member.addressLines.length - 1] ?? "";
  const ticker = [...stage.ticker, ...stage.ticker];

  return (
    <section className={styles.stage} style={stageVars(stage)} aria-labelledby="fan-mail-stage-title">
      <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-20 md:px-10 md:pb-20 md:pt-28">
        <Link href={"/fan-mail" as Route} className={styles.backLink}>
          <ArrowLeft className="size-3.5" aria-hidden /> All fan mail
        </Link>

        <div className={`${styles.stageGrid} mt-4 md:mt-8`}>
          <div className="@container min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: stage.mutedInk }}>
              <span className="size-2 rounded-full" style={{ background: stage.ring }} aria-hidden />
              {stage.kicker}
            </p>
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em]" style={{ ...fontStyle(identity.typography.accent), color: stage.mutedInk }}>
              Send fan mail to
            </p>
            <h1
              id="fan-mail-stage-title"
              className="mt-2 whitespace-nowrap"
              style={{ ...fontStyle(identity.typography.display), fontSize: fitTitleSize(identity.creatorName, stage.titleWidthEm, 6.5) }}
            >
              {identity.creatorName}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: stage.mutedInk }}>
              {stage.pitch}
            </p>

            <ul className="mt-7 flex flex-wrap gap-2" aria-label="Postcard details">
              <li className={styles.chip}>
                <span className="grid size-5 place-items-center rounded-full bg-black/90">
                  <Image src={identity.media.communityLogo} alt="" width={14} height={14} className="size-3.5 object-contain" />
                </span>
                {identity.communityName}
              </li>
              <li className={styles.chip}>{stage.styleLabel}</li>
              <li className={styles.chip}>{city}</li>
            </ul>

            <dl className="mt-8 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl" style={{ background: `color-mix(in srgb, ${stage.ink} 16%, transparent)` }}>
              <div className="p-3.5" style={{ background: `color-mix(in srgb, ${stage.base} 82%, transparent)` }}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: stage.mutedInk }}>Recipient line</dt>
                <dd className="mt-1 truncate text-sm font-semibold">{member.mailRecipient}</dd>
              </div>
              <div className="p-3.5" style={{ background: `color-mix(in srgb, ${stage.base} 82%, transparent)` }}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: stage.mutedInk }}>Postmark</dt>
                <dd className="mt-1 truncate text-sm font-semibold">{identity.postage.postmark.cityLabel}</dd>
              </div>
            </dl>
          </div>

          <div className="min-w-0">
            <MailCard member={member} />
          </div>
        </div>
      </div>

      <div className={styles.ticker} aria-hidden="true">
        <div className={styles.tickerTrack}>
          {ticker.map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

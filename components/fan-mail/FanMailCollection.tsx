import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties } from "react";
import { ArrowRight } from "@untitledui/icons";
import { MAIL_MEMBERS } from "@/lib/fan-mail";
import { FAN_MAIL_STAGES } from "@/lib/fan-mail-stages";
import { postcardIdentityFor } from "@/lib/postcard-identities";
import styles from "./FanMail.module.css";
import { fitTitleSize, fontStyle, stageVars } from "./stage-style";

const TILTS: Record<string, string> = {
  ron: "-1deg",
  jason: "1.2deg",
  lacy: "-0.8deg",
  marlon: "0.6deg",
  adapt: "-1.4deg",
};

/**
 * One mini postcard per creator, each in its own postcard style, linking to
 * that creator's fan-mail page. Scrolls sideways on phones, grid on tablets up.
 */
export function FanMailCollection({ exclude }: { exclude?: string }) {
  const members = MAIL_MEMBERS.filter((member) => member.slug !== exclude);

  return (
    <ul
      className={`-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0 ${
        members.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4"
      }`}
    >
      {members.map((member) => {
        const identity = postcardIdentityFor(member.slug);
        const stage = identity ? FAN_MAIL_STAGES[identity.slug] : null;
        if (!identity || !stage) return null;
        return (
          <li key={member.slug} className="w-[68%] shrink-0 snap-start sm:w-[42%] md:w-auto">
            <Link
              href={`/send-to-${member.slug}` as Route}
              aria-label={`Send fan mail to ${identity.creatorName}, ${stage.styleLabel.toLowerCase()} postcard`}
              className={styles.tile}
              style={{ ...stageVars(stage), "--tile-tilt": TILTS[member.slug] ?? "0deg" } as CSSProperties}
            >
              <span className={styles.tileImage}>
                <Image
                  src={`/fan-mail/${identity.slug}-portrait.webp`}
                  alt=""
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 20vw, 68vw"
                  className="object-cover object-top"
                  style={{ filter: stage.portraitFilter }}
                />
              </span>
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ background: stage.accent, color: stage.accentInk }}>
                <span className="grid size-4 place-items-center rounded-full bg-black/90">
                  <Image src={identity.media.communityLogo} alt="" width={12} height={12} className="size-3 object-contain" />
                </span>
                {identity.communityName}
              </span>
              <span className="@container relative block p-4 pt-10">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: stage.mutedInk }}>
                  {stage.styleLabel}
                </span>
                <span
                  className="mt-1.5 block whitespace-nowrap"
                  style={{ ...fontStyle(identity.typography.display), fontSize: fitTitleSize(identity.creatorName, stage.titleWidthEm, 2) }}
                >
                  {identity.creatorName}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em]">
                  Send mail <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

import Image from "next/image";
import type { CSSProperties } from "react";
import type { PostcardFrontDesign, PostcardIdentity, PostcardImageTreatment } from "@/lib/postcard-identities";
import { FAN_MAIL_STAGES } from "@/lib/fan-mail-stages";
import styles from "./FanMail.module.css";
import { fontStyle } from "./stage-style";

const IMAGE_FILTERS: Record<PostcardImageTreatment, string> = {
  "broadcast-crt": "saturate(.75) contrast(1.15) brightness(.9)",
  "score-card": "saturate(1.2) contrast(1.05)",
  "halftone-newsprint": "grayscale(1) contrast(1.35)",
  "editorial-duotone": "grayscale(1) contrast(1.15)",
  "instant-film": "sepia(.22) saturate(.9) contrast(1.05)",
};

const FRAME_POSITIONS = ["50% 20%", "30% 35%", "70% 30%", "50% 60%", "20% 50%", "80% 55%"];

/**
 * The four front designs from a creator's postcard identity, drawn as small
 * swatches with that design's colors, image treatment, and headline.
 */
export function PostcardDesignSet({ identity }: { identity: PostcardIdentity }) {
  return (
    <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2">
      {identity.frontDesigns.map((design, index) => (
        <li key={design.id} className="min-w-0">
          <DesignSwatch identity={identity} design={design} />
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-xs font-semibold tabular-nums text-[color:var(--ink-faint)]">0{index + 1}</span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{design.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-dim)]">{design.description}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DesignSwatch({ identity, design }: { identity: PostcardIdentity; design: PostcardFrontDesign }) {
  const frames = Math.min(design.photoSlots, 4);
  const film = design.imageTreatment === "instant-film";
  const card = design.imageTreatment === "score-card";
  const texture =
    design.imageTreatment === "halftone-newsprint" ? styles.halftone : design.imageTreatment === "broadcast-crt" ? styles.scanlines : "";
  // Size the headline so its longest word fits the 40cqi text column without breaking.
  const longestWord = Math.max(...design.headline.split(/\s+/).map((word) => word.length));
  const glyphEm = (FAN_MAIL_STAGES[identity.slug]?.titleWidthEm ?? 0.7) + identity.typography.display.letterSpacingEm;
  const headlineSize = `max(13px, min(6.4cqi, ${(40 / (longestWord * glyphEm)).toFixed(2)}cqi))`;

  return (
    <div className={`${styles.design} @container`} style={{ background: design.background, color: design.ink }}>
      <div
        className={`absolute inset-y-[9%] right-[4%] grid w-[47%] gap-[4%] ${frames > 1 ? "grid-cols-2" : ""}`}
        style={{ gridAutoRows: "1fr" }}
      >
        {Array.from({ length: frames }, (_, frame) => (
          <div
            key={frame}
            className={`relative min-h-0 overflow-hidden ${film ? "bg-[#fffaf0] p-[5%] pb-[14%] shadow-md" : ""} ${card ? "rounded-lg border-[3px]" : ""}`}
            style={
              {
                borderColor: card ? design.ink : undefined,
                transform: film ? `rotate(${frame % 2 === 0 ? -2.5 : 2}deg)` : undefined,
                gridRow: frames === 3 && frame === 0 ? "span 2" : undefined,
              } as CSSProperties
            }
          >
            <div className="relative size-full overflow-hidden">
              <Image
                src={`/fan-mail/${identity.slug}-portrait.webp`}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 640px) 260px, 50vw"
                className="object-cover"
                style={{ filter: IMAGE_FILTERS[design.imageTreatment], objectPosition: FRAME_POSITIONS[frame] }}
              />
              {texture ? <div className={`${styles.designOverlay} ${texture}`} /> : null}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.designOverlay} style={{ background: design.overlay }} />

      <div className="absolute inset-y-[9%] left-[5%] z-[2] flex w-[40%] flex-col justify-between">
        <span className="w-fit px-1.5 py-0.5 text-[clamp(7px,2.6cqi,10px)] font-extrabold uppercase tracking-[0.16em]" style={{ background: design.accent, color: readableOn(design.accent) }}>
          {identity.communityName}
        </span>
        <div>
          <span className="mb-[6cqi] block h-[3px] w-[18cqi]" style={{ background: design.accent }} aria-hidden />
          <p style={{ ...fontStyle(identity.typography.display), fontSize: headlineSize }}>
            {design.headline}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Near-black or white, whichever reads better on a #rrggbb background. */
function readableOn(hex: string): string {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return "#111111";
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.4 ? "#111111" : "#ffffff";
}

/**
 * Page-level art direction for each fan-mail destination.
 *
 * `lib/postcard-identities.ts` describes the postcard itself (palette, type,
 * motifs, designs). This module adds what a full page needs around that card:
 * the backdrop the postcard sits on, fan-facing copy, and the ticker strip.
 * Pure data only, so it is safe in server and client components.
 */
import type { PostcardIdentitySlug } from "./postcard-identities";

export type FanMailStage = {
  /** Short label for the postcard style, shown in indexes. */
  styleLabel: string;
  /** Eyebrow above the page title. */
  kicker: string;
  /** One fan-facing sentence under the title. */
  pitch: string;
  /** Page backdrop behind the hero (any CSS background value). */
  backdrop: string;
  /** Optional texture layered over the backdrop. */
  texture: string;
  ink: string;
  mutedInk: string;
  /** Accent used for rules, dots and the ticker strip. */
  accent: string;
  /** Text color that reads on `accent`. */
  accentInk: string;
  /** Ticker items rendered in the strip under the hero. */
  ticker: readonly string[];
  /** CSS filter applied to the portrait in index tiles. */
  portraitFilter: string;
  /** Solid base color of the backdrop, used for fades over photos. */
  base: string;
  /** Hover ring color for index tiles; must read on dark and light site themes. */
  ring: string;
  /** Approximate glyph width (em) of the display face, used to fit the name on one line. */
  titleWidthEm: number;
};

export const FAN_MAIL_STAGES: Readonly<Record<PostcardIdentitySlug, FanMailStage>> = Object.freeze({
  ron: {
    styleLabel: "Broadcast freeze-frame",
    kicker: "Stable Network · Live fan-mail feed",
    pitch: "Letters, fan art and clip-worthy mail for StableRonaldo. Write it like a live report and send it straight to the Stable mailbox.",
    backdrop: "radial-gradient(ellipse 70% 80% at 78% 18%, #12324a 0%, #071019 46%, #030507 100%)",
    texture: "repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.035) 3px 4px)",
    ink: "#f7fbff",
    mutedInk: "#a7b4c2",
    accent: "#e1122e",
    accentInk: "#ffffff",
    ticker: ["REC ●", "Live transmission", "23:59:59:12", "The clip →", "Calling…", "No delay", "▂▄▆█"],
    portraitFilter: "saturate(.8) contrast(1.05)",
    base: "#030507",
    ring: "#2eaae8",
    titleWidthEm: 0.5,
  },
  jason: {
    styleLabel: "Creator trading card",
    kicker: "NMS player file · Card 001",
    pitch: "Your player card for JasonTheWeen. Stat him up, draw the card, report the side quest. NMS mail goes here.",
    backdrop: "linear-gradient(135deg, #17123a 0%, #111111 48%, #0b0b0b 100%)",
    texture: "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,243,0,.07) 14px 16px)",
    ink: "#ffffff",
    mutedInk: "#c9c6d8",
    accent: "#fff300",
    accentInk: "#101010",
    ticker: ["XP +999", "Ultra rare", "Quest ✓", "Clutch", "Level cleared", "NMS-FAN", "99 OVR"],
    portraitFilter: "saturate(1.1) contrast(1.05)",
    base: "#0b0b0b",
    ring: "#fff300",
    titleWidthEm: 0.8,
  },
  lacy: {
    styleLabel: "Newspaper front page",
    kicker: "Thugs Daily · Late edition",
    pitch: "Stop the presses. Headlines, roasts and genuinely nice letters for Lacy go to the Thugs Daily mail desk.",
    backdrop: "linear-gradient(180deg, #ebe1ca 0%, #e2d6bb 100%)",
    texture: "repeating-linear-gradient(0deg, rgba(24,21,18,.05) 0 1px, transparent 1px 4px)",
    ink: "#181512",
    mutedInk: "#5f574c",
    accent: "#e7352b",
    accentInk: "#ffffff",
    ticker: ["Extra!", "Late edition", "The internet reacts", "Final boss wins again", "Thugs want to know", "Still live after deadline"],
    portraitFilter: "grayscale(1) contrast(1.2)",
    base: "#e2d6bb",
    ring: "#e7352b",
    titleWidthEm: 0.74,
  },
  marlon: {
    styleLabel: "Editorial magazine",
    kicker: "M3 · Volume 03 · The icon issue",
    pitch: "Submissions for the next cover. Letters, sketches and editorial-grade fan mail for Marlon and M3.",
    backdrop: "linear-gradient(180deg, #ecebe6 0%, #dddbd4 100%)",
    texture: "repeating-linear-gradient(90deg, rgba(16,17,18,.035) 0 1px, transparent 1px 32px)",
    ink: "#101112",
    mutedInk: "#55575a",
    accent: "#101112",
    accentInk: "#b8ff3f",
    ticker: ["The icon issue", "Motion / form / M3", "Built for the moment", "After dark / No. 03", "Cover story"],
    portraitFilter: "grayscale(1) contrast(1.1)",
    base: "#dddbd4",
    ring: "#b8ff3f",
    titleWidthEm: 0.66,
  },
  adapt: {
    styleLabel: "Scrapbook contact sheet",
    kicker: "Flock archives · Filed 2014–",
    pitch: "File it in the Flock archives. Letters, photos and OG memories for the Unc himself.",
    backdrop: "linear-gradient(150deg, #d9bd85 0%, #e8cf9c 52%, #d4b47a 100%)",
    texture: "repeating-linear-gradient(0deg, transparent 0 27px, rgba(38,77,133,.12) 27px 28px)",
    ink: "#2a2118",
    mutedInk: "#5e4c37",
    accent: "#264d85",
    accentInk: "#fffaf0",
    ticker: ["Flock archive", "Certified Unc", "One for the archive", "Keepers", "Where the flock went", "★ ★ ★"],
    portraitFilter: "sepia(.25) contrast(1.05)",
    base: "#d4b47a",
    ring: "#ed2d25",
    titleWidthEm: 0.8,
  },
});

export function fanMailStageFor(slug: string): FanMailStage | null {
  return Object.prototype.hasOwnProperty.call(FAN_MAIL_STAGES, slug)
    ? FAN_MAIL_STAGES[slug as PostcardIdentitySlug]
    : null;
}

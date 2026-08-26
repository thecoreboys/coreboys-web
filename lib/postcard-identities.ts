/**
 * Client/server-safe creative direction for each fan-mail recipient.
 *
 * This module deliberately contains data and deterministic pure functions only.
 * Rendering, payment, addresses, and print-provider concerns live elsewhere.
 * The identity catalog is ordered from MAIL_MEMBERS so a newly eligible
 * recipient cannot silently disappear from the postcard studio.
 */
import { MAIL_MEMBERS } from "./fan-mail";
import { MEMBERS_BY_SLUG } from "./members";

/** Persist this value alongside resolved variation data in every order. */
export const POSTCARD_IDENTITY_CATALOG_VERSION = 1 as const;
export const POSTCARD_VARIATION_ALGORITHM_VERSION = 1 as const;

export type PostcardIdentitySlug = "ron" | "jason" | "lacy" | "marlon" | "adapt";

export type PostcardArchetype =
  | "broadcast-freeze-frame"
  | "creator-trading-card"
  | "newspaper-front-page"
  | "editorial-magazine"
  | "scrapbook-contact-sheet";

export type FontToken = {
  /** A complete CSS font-family value, including fallbacks. */
  family: string;
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
  transform: "none" | "uppercase";
  letterSpacingEm: number;
  lineHeight: number;
};

export type PostcardTypography = {
  display: FontToken;
  body: FontToken;
  accent: FontToken;
  numeric: FontToken;
  /** Provider-safe fallbacks: no app CSS variables or unbundled web fonts. */
  print: {
    displayFamily: string;
    bodyFamily: string;
    accentFamily: string;
    numericFamily: string;
  };
};

export type PostcardPalette = {
  background: string;
  surface: string;
  ink: string;
  mutedInk: string;
  primary: string;
  secondary: string;
  highlight: string;
};

export type PostcardPaper = {
  stock: "bright-white" | "warm-uncoated" | "recycled-newsprint" | "soft-touch" | "photo-matte";
  finish: "uncoated" | "matte" | "soft-touch";
  texture: "smooth" | "tooth" | "fibers" | "newsprint" | "photo";
  baseColor: string;
  edge: "clean" | "deckled" | "worn" | "inked" | "rounded";
  weightGsm: number;
};

export type BackLayout =
  | "split-broadcast-log"
  | "stats-and-message"
  | "late-edition-columns"
  | "editor-letter"
  | "pinned-scrapbook-note";

export type PostcardBack = {
  layout: BackLayout;
  messageSide: "left" | "right";
  messageAlignment: "left" | "center";
  divider: "signal-bars" | "score-rule" | "double-rule" | "hairline" | "torn-tape";
  addressFrame: "brackets" | "stat-box" | "classified-box" | "editorial-rule" | "notebook-lines";
  decoration: string;
  senderLabel: string;
  messageLabel: string;
};

export type PostcardStamp = {
  shape: "rounded-rectangle" | "shield" | "square" | "portrait" | "scalloped";
  treatment: "on-air-badge" | "foil-badge" | "one-color-print" | "monogram" | "rubber-stamp";
  label: string;
  background: string;
  ink: string;
  border: string;
  rotationRangeDeg: readonly [number, number];
};

export type PostcardPostmark = {
  style: "signal-rings" | "player-level" | "late-edition" | "fashion-house" | "library-date";
  cityLabel: string;
  topText: string;
  bottomText: string;
  dateFormat: "MM.DD.YY" | "DD MMM YYYY" | "MMM DD / YY" | "YYYY-MM-DD";
  positions: readonly ("top-left" | "top-right" | "center-right" | "bottom-right")[];
  rotationRangeDeg: readonly [number, number];
};

export type PostcardMotif = {
  id: string;
  label: string;
  kind: "badge" | "doodle" | "line" | "sticker" | "texture" | "type";
  mark: string;
  placements: readonly ("top-left" | "top-right" | "bottom-left" | "bottom-right" | "edge" | "field")[];
};

export type PostcardPrompt = {
  id: string;
  label: string;
  question: string;
  placeholder: string;
};

export type PostcardCopyProfile = {
  tone: readonly [string, string, string];
  greetings: readonly string[];
  signoffs: readonly string[];
  prompts: readonly PostcardPrompt[];
};

export type PostcardImageTreatment =
  | "broadcast-crt"
  | "score-card"
  | "halftone-newsprint"
  | "editorial-duotone"
  | "instant-film";

export type PostcardComposition =
  | "lower-third"
  | "full-frame-alert"
  | "night-vision-monitor"
  | "split-screen-recap"
  | "rookie-card"
  | "stat-leader"
  | "quest-card"
  | "holographic-mvp"
  | "banner-headline"
  | "sports-extra"
  | "classified-collage"
  | "late-edition-photo"
  | "cover-story"
  | "street-style-cover"
  | "match-day-editorial"
  | "noir-profile"
  | "polaroid-stack"
  | "contact-sheet"
  | "tour-notes"
  | "archive-folder";

export type PostcardFrontDesign = {
  id: string;
  label: string;
  description: string;
  composition: PostcardComposition;
  background: string;
  ink: string;
  accent: string;
  imageTreatment: PostcardImageTreatment;
  photoSlots: 1 | 2 | 3 | 4 | 6;
  overlay: string;
  headline: string;
  /** Opaque colors used by PDF/print renderers instead of screen gradients. */
  print: {
    background: `#${string}`;
    ink: `#${string}`;
    accent: `#${string}`;
  };
};

export type PostcardVariationProfile = {
  layoutVariants: readonly string[];
  attachmentStyles: readonly string[];
  edgeTreatments: readonly string[];
  artworkRotationRangeDeg: readonly [number, number];
  imageScaleRange: readonly [number, number];
  grainOpacityRange: readonly [number, number];
  inkBleedRangePx: readonly [number, number];
};

export type PostcardIdentity = {
  catalogVersion: typeof POSTCARD_IDENTITY_CATALOG_VERSION;
  slug: PostcardIdentitySlug;
  /** Mailing-list name; the destination address remains in fan-mail.ts. */
  recipientName: string;
  creatorName: string;
  communityName: string;
  archetype: PostcardArchetype;
  concept: string;
  media: {
    portrait: string;
    communityLogo: string;
  };
  palette: PostcardPalette;
  typography: PostcardTypography;
  paper: PostcardPaper;
  back: PostcardBack;
  postage: {
    /** These are creator seals/cancellations, never postal indicia. */
    decorativeOnly: true;
    placementZone: "front" | "back-message-panel";
    stamp: PostcardStamp;
    postmark: PostcardPostmark;
  };
  motifs: readonly PostcardMotif[];
  copy: PostcardCopyProfile;
  frontDesigns: readonly PostcardFrontDesign[];
  variation: PostcardVariationProfile;
};

function identityCore(slug: PostcardIdentitySlug) {
  const mailMember = MAIL_MEMBERS.find((member) => member.slug === slug);
  const member = MEMBERS_BY_SLUG[slug];
  if (!mailMember || !member) {
    throw new Error(`Missing postcard identity source data for "${slug}".`);
  }
  return {
    catalogVersion: POSTCARD_IDENTITY_CATALOG_VERSION,
    slug,
    recipientName: mailMember.displayName,
    creatorName: member.stageName,
    communityName: member.comm.name,
    media: {
      portrait: member.portrait,
      communityLogo: member.comm.logo,
    },
  } as const;
}

const IDENTITIES = {
  ron: {
    ...identityCore("ron"),
    archetype: "broadcast-freeze-frame",
    concept: "A live control-room capture: urgent lower thirds, timecode, signal noise, and one impossible-to-miss clip.",
    palette: {
      background: "#05070a",
      surface: "#111820",
      ink: "#f7fbff",
      mutedInk: "#a7b4c2",
      primary: "#2eaae8",
      secondary: "#e1122e",
      highlight: "#f2ef3a",
    },
    typography: {
      display: { family: 'Impact, "Arial Black", sans-serif', weight: 900, style: "normal", transform: "uppercase", letterSpacingEm: 0.01, lineHeight: 0.88 },
      body: { family: 'var(--font-sans), Inter, Arial, sans-serif', weight: 600, style: "normal", transform: "none", letterSpacingEm: 0, lineHeight: 1.35 },
      accent: { family: '"Arial Narrow", Arial, sans-serif', weight: 800, style: "italic", transform: "uppercase", letterSpacingEm: 0.06, lineHeight: 1 },
      numeric: { family: 'var(--font-mono), "Courier New", monospace', weight: 700, style: "normal", transform: "uppercase", letterSpacingEm: 0.08, lineHeight: 1 },
      print: { displayFamily: "Arial, Helvetica, sans-serif", bodyFamily: "Arial, Helvetica, sans-serif", accentFamily: "Arial, Helvetica, sans-serif", numericFamily: '"Courier New", Courier, monospace' },
    },
    paper: { stock: "bright-white", finish: "matte", texture: "smooth", baseColor: "#f4f7f8", edge: "clean", weightGsm: 325 },
    back: {
      layout: "split-broadcast-log",
      messageSide: "left",
      messageAlignment: "left",
      divider: "signal-bars",
      addressFrame: "brackets",
      decoration: "REC tally, rolling timecode, and a clipped broadcast log along the footer.",
      senderLabel: "FROM THE CHAT",
      messageLabel: "TRANSMISSION",
    },
    postage: {
      decorativeOnly: true,
      placementZone: "front",
      stamp: { shape: "rounded-rectangle", treatment: "on-air-badge", label: "STABLE / LIVE", background: "#07090c", ink: "#f7fbff", border: "#2eaae8", rotationRangeDeg: [-2.2, 1.4] },
      postmark: { style: "signal-rings", cityLabel: "STABLE NETWORK", topText: "LIVE TRANSMISSION", bottomText: "NO DELAY", dateFormat: "MM.DD.YY", positions: ["top-right", "center-right"], rotationRangeDeg: [-8, -2] },
    },
    motifs: [
      { id: "ron-rec", label: "REC tally", kind: "badge", mark: "REC", placements: ["top-left", "top-right"] },
      { id: "ron-timecode", label: "Rolling timecode", kind: "type", mark: "23:59:59:12", placements: ["top-right", "bottom-left"] },
      { id: "ron-signal", label: "Signal bars", kind: "line", mark: "▂▄▆█", placements: ["edge", "bottom-right"] },
      { id: "ron-payphone", label: "Payphone callback", kind: "sticker", mark: "CALLING…", placements: ["field", "bottom-left"] },
      { id: "ron-clip", label: "Clip marker", kind: "doodle", mark: "THE CLIP →", placements: ["field", "bottom-right"] },
    ],
    copy: {
      tone: ["high-energy", "playfully dramatic", "clip-aware"],
      greetings: ["Ron—breaking news:", "Yo Stable,", "Live from the chat:"],
      signoffs: ["Still watching,", "Your most stable viewer,", "End transmission —"],
      prompts: [
        { id: "ron-clip", label: "The clip", question: "Which Ron moment still lives in your head?", placeholder: "The stream, timestamp, or one line everyone remembers…" },
        { id: "ron-chaos", label: "Peak chaos", question: "When did the whole stream go off the rails?", placeholder: "Set the scene like a live report…" },
        { id: "ron-thanks", label: "Real talk", question: "What has watching Ron meant to you?", placeholder: "A sincere note beneath the broadcast noise…" },
        { id: "ron-headline", label: "Breaking headline", question: "Write the headline Ron deserves today.", placeholder: "BREAKING: …" },
      ],
    },
    frontDesigns: [
      { id: "ron-breaking-live", label: "Breaking Live", description: "Full-frame stream still with urgent red-and-blue lower thirds.", composition: "lower-third", background: "linear-gradient(145deg,#09131d 0%,#020305 72%)", ink: "#ffffff", accent: "#e1122e", imageTreatment: "broadcast-crt", photoSlots: 1, overlay: "linear-gradient(180deg,transparent 42%,rgba(0,0,0,.9) 100%)", headline: "BREAKING: HE IS THE CLIP", print: { background: "#09131d", ink: "#ffffff", accent: "#e1122e" } },
      { id: "ron-overtime", label: "Overtime", description: "A scoreboard-like recap built for a legendary late-night moment.", composition: "full-frame-alert", background: "linear-gradient(110deg,#172430,#071017)", ink: "#f7fbff", accent: "#f2ef3a", imageTreatment: "broadcast-crt", photoSlots: 1, overlay: "repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.035) 4px)", headline: "OVERTIME / STILL LIVE", print: { background: "#172430", ink: "#f7fbff", accent: "#f2ef3a" } },
      { id: "ron-night-monitor", label: "Night Monitor", description: "Green-tinted surveillance monitor with a timestamp and camera ID.", composition: "night-vision-monitor", background: "#03100b", ink: "#d8ffe4", accent: "#57ff8a", imageTreatment: "broadcast-crt", photoSlots: 1, overlay: "radial-gradient(circle at center,transparent 45%,rgba(0,0,0,.72) 100%)", headline: "CAM 02 / DO NOT CUT", print: { background: "#03100b", ink: "#d8ffe4", accent: "#57ff8a" } },
      { id: "ron-instant-replay", label: "Instant Replay", description: "Four-angle replay board with director marks and a hero frame.", composition: "split-screen-recap", background: "#06090d", ink: "#ffffff", accent: "#2eaae8", imageTreatment: "broadcast-crt", photoSlots: 4, overlay: "linear-gradient(90deg,rgba(46,170,232,.16),transparent 35%,rgba(225,18,46,.12))", headline: "RUN THAT BACK", print: { background: "#06090d", ink: "#ffffff", accent: "#2eaae8" } },
    ],
    variation: {
      layoutVariants: ["network-a", "field-report", "control-room"],
      attachmentStyles: ["gaffer-tape", "monitor-brackets", "hard-cut"],
      edgeTreatments: ["scanline", "signal-tear", "clean-feed"],
      artworkRotationRangeDeg: [-0.7, 0.7],
      imageScaleRange: [1, 1.09],
      grainOpacityRange: [0.03, 0.13],
      inkBleedRangePx: [0, 0.35],
    },
  },
  jason: {
    ...identityCore("jason"),
    archetype: "creator-trading-card",
    concept: "A game-era creator card with stats, quest markers, and collectible-inspired finishes.",
    palette: {
      background: "#fff300",
      surface: "#111111",
      ink: "#101010",
      mutedInk: "#585858",
      primary: "#f7df00",
      secondary: "#7657ff",
      highlight: "#67f3ff",
    },
    typography: {
      display: { family: '"Arial Black", Impact, sans-serif', weight: 900, style: "normal", transform: "uppercase", letterSpacingEm: -0.025, lineHeight: 0.92 },
      body: { family: 'var(--font-sans), Inter, Arial, sans-serif', weight: 600, style: "normal", transform: "none", letterSpacingEm: 0, lineHeight: 1.3 },
      accent: { family: 'var(--font-mono), "Courier New", monospace', weight: 700, style: "normal", transform: "uppercase", letterSpacingEm: 0.05, lineHeight: 1.1 },
      numeric: { family: '"Arial Black", Impact, sans-serif', weight: 900, style: "italic", transform: "uppercase", letterSpacingEm: -0.04, lineHeight: 0.85 },
      print: { displayFamily: "Arial, Helvetica, sans-serif", bodyFamily: "Arial, Helvetica, sans-serif", accentFamily: '"Courier New", Courier, monospace', numericFamily: "Arial, Helvetica, sans-serif" },
    },
    paper: { stock: "photo-matte", finish: "matte", texture: "photo", baseColor: "#fffdf0", edge: "rounded", weightGsm: 325 },
    back: {
      layout: "stats-and-message",
      messageSide: "right",
      messageAlignment: "left",
      divider: "score-rule",
      addressFrame: "stat-box",
      decoration: "A player bio, artwork code, class chip, and three fan-defined stat bars.",
      senderLabel: "CARD OWNER",
      messageLabel: "PLAYER NOTE",
    },
    postage: {
      decorativeOnly: true,
      placementZone: "front",
      stamp: { shape: "shield", treatment: "foil-badge", label: "NMS / PLAYER FILE", background: "#f7df00", ink: "#111111", border: "#7657ff", rotationRangeDeg: [-1, 2.5] },
      postmark: { style: "player-level", cityLabel: "NMS LEAGUE", topText: "LEVEL CLEARED", bottomText: "XP AWARDED", dateFormat: "YYYY-MM-DD", positions: ["top-left", "bottom-right"], rotationRangeDeg: [-5, 5] },
    },
    motifs: [
      { id: "jason-xp", label: "XP bar", kind: "line", mark: "XP +999", placements: ["edge", "bottom-left"] },
      { id: "jason-rare", label: "Rarity gem", kind: "badge", mark: "ULTRA RARE", placements: ["top-right", "bottom-right"] },
      { id: "jason-quest", label: "Quest complete", kind: "sticker", mark: "QUEST ✓", placements: ["field", "top-left"] },
      { id: "jason-valorant", label: "Clutch marker", kind: "type", mark: "CLUTCH", placements: ["field", "bottom-left"] },
      { id: "jason-nms", label: "NMS artwork code", kind: "type", mark: "NMS-FAN", placements: ["edge", "top-right"] },
    ],
    copy: {
      tone: ["quick-witted", "competitive", "warm underneath"],
      greetings: ["Jason, quest update:", "Yo Jason—", "Player one to player one:"],
      signoffs: ["GGs,", "NMS forever,", "See you in the next lobby —"],
      prompts: [
        { id: "jason-stat", label: "Best stat", question: "What should Jason have a 99 rating in?", placeholder: "Clutch timing, collabs, accidental comedy…" },
        { id: "jason-quest", label: "Quest cleared", question: "Which stream felt like a completed side quest?", placeholder: "Name the challenge and how it ended…" },
        { id: "jason-breakout", label: "Breakout memory", question: "When did you realize Jason was next up?", placeholder: "The first moment you knew…" },
        { id: "jason-message", label: "Player note", question: "What do you genuinely want Jason to know?", placeholder: "Keep it honest, funny, or both…" },
      ],
    },
    frontDesigns: [
      { id: "jason-rookie", label: "Rookie Issue", description: "Classic portrait card with a bold nameplate and player-file seal.", composition: "rookie-card", background: "linear-gradient(145deg,#fff300,#ffb800)", ink: "#101010", accent: "#7657ff", imageTreatment: "score-card", photoSlots: 1, overlay: "linear-gradient(135deg,rgba(255,255,255,.45),transparent 42%)", headline: "ROOKIE OF THE STREAM", print: { background: "#fff300", ink: "#101010", accent: "#7657ff" } },
      { id: "jason-stat-leader", label: "Stat Leader", description: "A performance card driven by oversized ratings and fan-assigned stats.", composition: "stat-leader", background: "#111111", ink: "#ffffff", accent: "#fff300", imageTreatment: "score-card", photoSlots: 1, overlay: "repeating-linear-gradient(135deg,transparent 0 12px,rgba(255,243,0,.06) 12px 14px)", headline: "99 OVR / BREAKOUT", print: { background: "#111111", ink: "#ffffff", accent: "#fff300" } },
      { id: "jason-side-quest", label: "Side Quest", description: "Mission card with objective stamps, progress markers, and two scenes.", composition: "quest-card", background: "linear-gradient(135deg,#20184b,#7657ff)", ink: "#ffffff", accent: "#67f3ff", imageTreatment: "score-card", photoSlots: 2, overlay: "radial-gradient(circle at 80% 10%,rgba(103,243,255,.35),transparent 28%)", headline: "QUEST COMPLETE", print: { background: "#20184b", ink: "#ffffff", accent: "#67f3ff" } },
      { id: "jason-holo-mvp", label: "Holo MVP", description: "A prismatic hero card with bold color and a non-scarcity artwork code.", composition: "holographic-mvp", background: "linear-gradient(120deg,#67f3ff,#f789ff 32%,#fff300 62%,#7657ff)", ink: "#111111", accent: "#ffffff", imageTreatment: "score-card", photoSlots: 1, overlay: "linear-gradient(110deg,transparent 20%,rgba(255,255,255,.65) 38%,transparent 54%)", headline: "MVP / PRISMATIC", print: { background: "#67f3ff", ink: "#111111", accent: "#7657ff" } },
    ],
    variation: {
      layoutVariants: ["base-set", "away-kit", "championship"],
      attachmentStyles: ["foil-corners", "collector-sleeve", "stat-brackets"],
      edgeTreatments: ["rounded", "prismatic", "black-keyline"],
      artworkRotationRangeDeg: [-1.2, 1.2],
      imageScaleRange: [1.02, 1.14],
      grainOpacityRange: [0.01, 0.07],
      inkBleedRangePx: [0, 0.2],
    },
  },
  lacy: {
    ...identityCore("lacy"),
    archetype: "newspaper-front-page",
    concept: "A loud late-edition front page where stream lore becomes headlines, captions, columns, and classifieds.",
    palette: {
      background: "#f2ead7",
      surface: "#ddd2bb",
      ink: "#181512",
      mutedInk: "#655d52",
      primary: "#e7352b",
      secondary: "#f07f22",
      highlight: "#f4ca3f",
    },
    typography: {
      display: { family: 'Georgia, "Times New Roman", serif', weight: 900, style: "normal", transform: "uppercase", letterSpacingEm: -0.045, lineHeight: 0.9 },
      body: { family: 'Georgia, "Times New Roman", serif', weight: 400, style: "normal", transform: "none", letterSpacingEm: 0, lineHeight: 1.25 },
      accent: { family: '"Arial Narrow", Arial, sans-serif', weight: 800, style: "normal", transform: "uppercase", letterSpacingEm: 0.055, lineHeight: 1 },
      numeric: { family: 'var(--font-mono), "Courier New", monospace', weight: 700, style: "normal", transform: "uppercase", letterSpacingEm: 0.04, lineHeight: 1 },
      print: { displayFamily: 'Georgia, "Times New Roman", serif', bodyFamily: 'Georgia, "Times New Roman", serif', accentFamily: "Arial, Helvetica, sans-serif", numericFamily: '"Courier New", Courier, monospace' },
    },
    paper: { stock: "recycled-newsprint", finish: "uncoated", texture: "newsprint", baseColor: "#f2ead7", edge: "worn", weightGsm: 300 },
    back: {
      layout: "late-edition-columns",
      messageSide: "left",
      messageAlignment: "left",
      divider: "double-rule",
      addressFrame: "classified-box",
      decoration: "Dateline, edition slug, tiny classified joke, and a continuation marker at the fold.",
      senderLabel: "BYLINE",
      messageLabel: "LETTER TO THE EDITOR",
    },
    postage: {
      decorativeOnly: true,
      placementZone: "front",
      stamp: { shape: "square", treatment: "one-color-print", label: "THUGS DAILY", background: "#f2ead7", ink: "#e7352b", border: "#181512", rotationRangeDeg: [-3.5, 2] },
      postmark: { style: "late-edition", cityLabel: "SHERMAN OAKS", topText: "LATE EDITION", bottomText: "THUGS DAILY", dateFormat: "DD MMM YYYY", positions: ["top-right", "bottom-right"], rotationRangeDeg: [-10, -4] },
    },
    motifs: [
      { id: "lacy-extra", label: "Extra banner", kind: "type", mark: "EXTRA!", placements: ["top-left", "top-right"] },
      { id: "lacy-fries", label: "Fries classified", kind: "doodle", mark: "FRIES", placements: ["field", "bottom-left"] },
      { id: "lacy-scoop", label: "Exclusive scoop", kind: "badge", mark: "SCOOP", placements: ["top-right", "field"] },
      { id: "lacy-red-circle", label: "Editor circle", kind: "doodle", mark: "○", placements: ["field", "edge"] },
      { id: "lacy-breaking", label: "Breaking ticker", kind: "line", mark: "BREAKING / BREAKING", placements: ["edge", "bottom-right"] },
    ],
    copy: {
      tone: ["roasting", "headline-sized", "unexpectedly sincere"],
      greetings: ["Lacy—today’s headline:", "Dear editor (and Lacy),", "Breaking from the Thugs desk:"],
      signoffs: ["Filed by,", "Your loyal correspondent,", "More after the break —"],
      prompts: [
        { id: "lacy-headline", label: "Front-page news", question: "What Lacy moment deserves the biggest headline?", placeholder: "LACY SHOCKS THE WORLD BY…" },
        { id: "lacy-roast", label: "Friendly roast", question: "What would the opinion column say about Lacy?", placeholder: "Keep it funny without making it cruel…" },
        { id: "lacy-transform", label: "The real story", question: "What part of Lacy’s journey impressed you?", placeholder: "Behind the jokes, this mattered because…" },
        { id: "lacy-classified", label: "Classified ad", question: "Write a tiny community in-joke as an ad.", placeholder: "WANTED: …" },
      ],
    },
    frontDesigns: [
      { id: "lacy-front-page", label: "Front Page", description: "One enormous headline, hero photo, dateline, and two short columns.", composition: "banner-headline", background: "#f2ead7", ink: "#181512", accent: "#e7352b", imageTreatment: "halftone-newsprint", photoSlots: 1, overlay: "repeating-linear-gradient(0deg,rgba(24,21,18,.025) 0 1px,transparent 1px 4px)", headline: "THE INTERNET REACTS", print: { background: "#f2ead7", ink: "#181512", accent: "#e7352b" } },
      { id: "lacy-sports-extra", label: "Sports Extra", description: "Scoreline, action image, commentary box, and a late result banner.", composition: "sports-extra", background: "#eee3ca", ink: "#17130f", accent: "#f07f22", imageTreatment: "halftone-newsprint", photoSlots: 2, overlay: "linear-gradient(90deg,rgba(231,53,43,.1),transparent 35%)", headline: "FINAL BOSS WINS AGAIN", print: { background: "#eee3ca", ink: "#17130f", accent: "#f07f22" } },
      { id: "lacy-classifieds", label: "The Classifieds", description: "A chaotic collage of small ads, mini photos, jokes, and red editor marks.", composition: "classified-collage", background: "#e5dac4", ink: "#201c17", accent: "#e7352b", imageTreatment: "halftone-newsprint", photoSlots: 6, overlay: "repeating-linear-gradient(90deg,transparent 0 31%,rgba(24,21,18,.18) 31% 31.4%)", headline: "THUGS WANT TO KNOW", print: { background: "#e5dac4", ink: "#201c17", accent: "#e7352b" } },
      { id: "lacy-late-edition", label: "Late Edition", description: "A moody full-width photo with a torn breaking-news strip.", composition: "late-edition-photo", background: "#171512", ink: "#f2ead7", accent: "#f4ca3f", imageTreatment: "halftone-newsprint", photoSlots: 1, overlay: "linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.78))", headline: "STILL LIVE AFTER DEADLINE", print: { background: "#171512", ink: "#f2ead7", accent: "#f4ca3f" } },
    ],
    variation: {
      layoutVariants: ["morning", "late-edition", "weekend-extra"],
      attachmentStyles: ["paste-up", "editor-pin", "torn-clipping"],
      edgeTreatments: ["rough-trim", "folded", "ink-smudge"],
      artworkRotationRangeDeg: [-1.8, 1.8],
      imageScaleRange: [1, 1.11],
      grainOpacityRange: [0.09, 0.22],
      inkBleedRangePx: [0.2, 0.85],
    },
  },
  marlon: {
    ...identityCore("marlon"),
    archetype: "editorial-magazine",
    concept: "A fashion-and-sport magazine cover system with disciplined typography, premium portrait crops, and issue-level polish.",
    palette: {
      background: "#101112",
      surface: "#e9e7e2",
      ink: "#f8f6f1",
      mutedInk: "#a9aaa7",
      primary: "#efefed",
      secondary: "#8f9397",
      highlight: "#b8ff3f",
    },
    typography: {
      display: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 800, style: "normal", transform: "uppercase", letterSpacingEm: -0.055, lineHeight: 0.86 },
      body: { family: 'var(--font-sans), Inter, Arial, sans-serif', weight: 500, style: "normal", transform: "none", letterSpacingEm: 0.005, lineHeight: 1.4 },
      accent: { family: 'Georgia, "Times New Roman", serif', weight: 400, style: "italic", transform: "none", letterSpacingEm: 0, lineHeight: 1.1 },
      numeric: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700, style: "normal", transform: "uppercase", letterSpacingEm: 0.12, lineHeight: 1 },
      print: { displayFamily: "Arial, Helvetica, sans-serif", bodyFamily: "Arial, Helvetica, sans-serif", accentFamily: 'Georgia, "Times New Roman", serif', numericFamily: "Arial, Helvetica, sans-serif" },
    },
    paper: { stock: "bright-white", finish: "matte", texture: "smooth", baseColor: "#eeece7", edge: "inked", weightGsm: 325 },
    back: {
      layout: "editor-letter",
      messageSide: "right",
      messageAlignment: "left",
      divider: "hairline",
      addressFrame: "editorial-rule",
      decoration: "Issue number, vertical folio, restrained pull quote, and a monochrome M3 monogram.",
      senderLabel: "CONTRIBUTOR",
      messageLabel: "EDITOR'S LETTER",
    },
    postage: {
      decorativeOnly: true,
      placementZone: "front",
      stamp: { shape: "portrait", treatment: "monogram", label: "M3 / ICON ISSUE", background: "#101112", ink: "#f8f6f1", border: "#8f9397", rotationRangeDeg: [-0.8, 0.8] },
      postmark: { style: "fashion-house", cityLabel: "M3 STUDIOS", topText: "ICON ISSUE", bottomText: "PRIVATE EDITION", dateFormat: "DD MMM YYYY", positions: ["top-right", "bottom-right"], rotationRangeDeg: [-3, 1] },
    },
    motifs: [
      { id: "marlon-m3", label: "M3 monogram", kind: "type", mark: "M3", placements: ["top-left", "edge"] },
      { id: "marlon-folio", label: "Issue folio", kind: "type", mark: "VOL. 03", placements: ["edge", "bottom-right"] },
      { id: "marlon-pullquote", label: "Pull quote", kind: "type", mark: "THE ROOM SHIFTS", placements: ["field", "bottom-left"] },
      { id: "marlon-playbook", label: "Playbook line", kind: "line", mark: "01 — 03 — 09", placements: ["edge", "field"] },
      { id: "marlon-lime", label: "Lime proof mark", kind: "doodle", mark: "+", placements: ["field", "top-right"] },
    ],
    copy: {
      tone: ["confident", "clean", "respectful"],
      greetings: ["Marlon—an editor’s note:", "To M3,", "For the next issue:"],
      signoffs: ["Respectfully,", "From one of the D1s,", "Until the next cover —"],
      prompts: [
        { id: "marlon-cover", label: "Cover line", question: "What cover line sums up Marlon right now?", placeholder: "MARLON: …" },
        { id: "marlon-room", label: "The room shifted", question: "Which stream changed the energy the moment he arrived?", placeholder: "The room shifted when…" },
        { id: "marlon-respect", label: "Give flowers", question: "What do you respect about Marlon’s work?", placeholder: "Beyond the clips, I notice…" },
        { id: "marlon-sport", label: "Match report", question: "Describe a favorite competitive or sports moment.", placeholder: "Final score, best play, and your reaction…" },
      ],
    },
    frontDesigns: [
      { id: "marlon-icon-issue", label: "Icon Issue", description: "A tightly cropped portrait with an oversized masthead and sparse cover lines.", composition: "cover-story", background: "#101112", ink: "#f8f6f1", accent: "#b8ff3f", imageTreatment: "editorial-duotone", photoSlots: 1, overlay: "linear-gradient(180deg,transparent 58%,rgba(0,0,0,.56))", headline: "THE ICON ISSUE", print: { background: "#101112", ink: "#f8f6f1", accent: "#b8ff3f" } },
      { id: "marlon-street-style", label: "Street Style", description: "Full-bleed street portrait with vertical type and a numbered location caption.", composition: "street-style-cover", background: "#d9d7d0", ink: "#101112", accent: "#f8f6f1", imageTreatment: "editorial-duotone", photoSlots: 1, overlay: "linear-gradient(90deg,rgba(255,255,255,.2),transparent 40%)", headline: "MOTION / FORM / M3", print: { background: "#d9d7d0", ink: "#101112", accent: "#777777" } },
      { id: "marlon-match-day", label: "Match Day", description: "A two-image sport editorial with score typography and a quiet analysis deck.", composition: "match-day-editorial", background: "#eceae4", ink: "#111111", accent: "#b8ff3f", imageTreatment: "editorial-duotone", photoSlots: 2, overlay: "linear-gradient(115deg,transparent 60%,rgba(184,255,63,.28))", headline: "BUILT FOR THE MOMENT", print: { background: "#eceae4", ink: "#111111", accent: "#739f28" } },
      { id: "marlon-after-dark", label: "After Dark", description: "High-contrast monochrome portrait with a single luminous proof color.", composition: "noir-profile", background: "#050505", ink: "#f2f1ee", accent: "#b8ff3f", imageTreatment: "editorial-duotone", photoSlots: 1, overlay: "radial-gradient(circle at 62% 32%,transparent 8%,rgba(0,0,0,.72) 75%)", headline: "AFTER DARK / NO. 03", print: { background: "#050505", ink: "#f2f1ee", accent: "#91c733" } },
    ],
    variation: {
      layoutVariants: ["cover-a", "subscriber-cover", "special-edition"],
      attachmentStyles: ["perfect-bound", "proof-crop", "gallery-mount"],
      edgeTreatments: ["black-edge", "clean-trim", "proof-line"],
      artworkRotationRangeDeg: [-0.35, 0.35],
      imageScaleRange: [1.05, 1.18],
      grainOpacityRange: [0.01, 0.08],
      inkBleedRangePx: [0, 0.16],
    },
  },
  adapt: {
    ...identityCore("adapt"),
    archetype: "scrapbook-contact-sheet",
    concept: "An OG archive assembled from instant photos, handwritten notes, contact sheets, tape, and Flock history.",
    palette: {
      background: "#efe7d8",
      surface: "#fffaf0",
      ink: "#201b18",
      mutedInk: "#766b61",
      primary: "#ed2d25",
      secondary: "#264d85",
      highlight: "#f2b642",
    },
    typography: {
      display: { family: '"Arial Black", Impact, sans-serif', weight: 900, style: "normal", transform: "uppercase", letterSpacingEm: -0.035, lineHeight: 0.92 },
      body: { family: 'var(--font-typewriter), "Courier New", monospace', weight: 500, style: "normal", transform: "none", letterSpacingEm: 0.01, lineHeight: 1.35 },
      accent: { family: '"Segoe Print", "Bradley Hand", cursive', weight: 600, style: "normal", transform: "none", letterSpacingEm: 0, lineHeight: 1.1 },
      numeric: { family: 'var(--font-mono), "Courier New", monospace', weight: 700, style: "normal", transform: "uppercase", letterSpacingEm: 0.08, lineHeight: 1 },
      print: { displayFamily: "Arial, Helvetica, sans-serif", bodyFamily: '"Courier New", Courier, monospace', accentFamily: '"Comic Sans MS", cursive', numericFamily: '"Courier New", Courier, monospace' },
    },
    paper: { stock: "warm-uncoated", finish: "uncoated", texture: "fibers", baseColor: "#efe7d8", edge: "deckled", weightGsm: 325 },
    back: {
      layout: "pinned-scrapbook-note",
      messageSide: "left",
      messageAlignment: "left",
      divider: "torn-tape",
      addressFrame: "notebook-lines",
      decoration: "Blue pencil notes, archive date, tape shadow, and a tiny handwritten Flock index.",
      senderLabel: "ARCHIVED BY",
      messageLabel: "NOTE FOR UNC",
    },
    postage: {
      decorativeOnly: true,
      placementZone: "front",
      stamp: { shape: "scalloped", treatment: "rubber-stamp", label: "FLOCK ARCHIVE", background: "#fffaf0", ink: "#ed2d25", border: "#264d85", rotationRangeDeg: [-4, 3.5] },
      postmark: { style: "library-date", cityLabel: "FLOCK ARCHIVES", topText: "CHECKED OUT", bottomText: "RETURN NEVER", dateFormat: "MMM DD / YY", positions: ["top-left", "center-right", "bottom-right"], rotationRangeDeg: [-12, 6] },
    },
    motifs: [
      { id: "adapt-flock", label: "Flock note", kind: "doodle", mark: "FLOCK →", placements: ["field", "bottom-left"] },
      { id: "adapt-unc", label: "Unc label", kind: "sticker", mark: "CERTIFIED UNC", placements: ["top-right", "bottom-right"] },
      { id: "adapt-date", label: "Archive date", kind: "type", mark: "FILED / 2014—", placements: ["edge", "top-left"] },
      { id: "adapt-stars", label: "Marker stars", kind: "doodle", mark: "★ ★ ★", placements: ["field", "bottom-right"] },
      { id: "adapt-contact", label: "Contact marks", kind: "line", mark: "01 02 03 04", placements: ["edge", "field"] },
    ],
    copy: {
      tone: ["nostalgic", "inside-joke fluent", "grateful"],
      greetings: ["Adapt—one for the archive:", "Yo Unc,", "From the Flock files:"],
      signoffs: ["Flock forever,", "From an old (or new) viewer,", "Filed with respect —"],
      prompts: [
        { id: "adapt-era", label: "Your era", question: "Which Adapt era or series is yours?", placeholder: "The videos or streams that pulled you into the Flock…" },
        { id: "adapt-og", label: "OG memory", question: "What old moment do you still bring up?", placeholder: "I still remember when…" },
        { id: "adapt-unc", label: "Advice from Unc", question: "What did Adapt say—seriously or accidentally—that stuck?", placeholder: "The quote and why it stayed with you…" },
        { id: "adapt-thanks", label: "Archive note", question: "What do you want to thank Adapt for?", placeholder: "This belongs in the archive because…" },
      ],
    },
    frontDesigns: [
      { id: "adapt-og-stack", label: "OG Stack", description: "Three overlapping instant photos with tape, dates, and handwritten captions.", composition: "polaroid-stack", background: "#efe7d8", ink: "#201b18", accent: "#ed2d25", imageTreatment: "instant-film", photoSlots: 3, overlay: "repeating-linear-gradient(0deg,transparent 0 18px,rgba(38,77,133,.08) 18px 19px)", headline: "ONE FOR THE ARCHIVE", print: { background: "#efe7d8", ink: "#201b18", accent: "#b3231d" } },
      { id: "adapt-contact-sheet", label: "Contact Sheet", description: "Six chronological frames with grease-pencil circles and keeper marks.", composition: "contact-sheet", background: "#171513", ink: "#fffaf0", accent: "#f2b642", imageTreatment: "instant-film", photoSlots: 6, overlay: "linear-gradient(135deg,rgba(237,45,37,.12),transparent 46%)", headline: "KEEPERS / FLOCK FILE 03", print: { background: "#171513", ink: "#fffaf0", accent: "#c58d2b" } },
      { id: "adapt-tour-notes", label: "Tour Notes", description: "Four snapshots arranged like a travel page with places, dates, and arrows.", composition: "tour-notes", background: "#fffaf0", ink: "#201b18", accent: "#264d85", imageTreatment: "instant-film", photoSlots: 4, overlay: "radial-gradient(circle at 80% 18%,rgba(242,182,66,.2),transparent 22%)", headline: "WHERE THE FLOCK WENT", print: { background: "#fffaf0", ink: "#201b18", accent: "#264d85" } },
      { id: "adapt-flock-files", label: "Flock Files", description: "A manila archive folder with evidence labels, a hero print, and two inserts.", composition: "archive-folder", background: "linear-gradient(145deg,#caaa73,#e3c58f)", ink: "#2a2118", accent: "#ed2d25", imageTreatment: "instant-film", photoSlots: 3, overlay: "repeating-linear-gradient(90deg,rgba(74,52,28,.035) 0 1px,transparent 1px 6px)", headline: "CONFIDENTIAL: UNC HISTORY", print: { background: "#caaa73", ink: "#2a2118", accent: "#b3231d" } },
    ],
    variation: {
      layoutVariants: ["kitchen-table", "archive-box", "road-book"],
      attachmentStyles: ["masking-tape", "paper-clip", "photo-corners", "staples"],
      edgeTreatments: ["deckled", "thumbed", "torn-notebook"],
      artworkRotationRangeDeg: [-3.5, 3.5],
      imageScaleRange: [0.98, 1.12],
      grainOpacityRange: [0.07, 0.19],
      inkBleedRangePx: [0.1, 0.65],
    },
  },
} as const satisfies Record<PostcardIdentitySlug, PostcardIdentity>;

export const POSTCARD_IDENTITIES_BY_SLUG: Readonly<Record<PostcardIdentitySlug, PostcardIdentity>> =
  Object.freeze(IDENTITIES);

export function isPostcardIdentitySlug(slug: string): slug is PostcardIdentitySlug {
  return Object.prototype.hasOwnProperty.call(POSTCARD_IDENTITIES_BY_SLUG, slug);
}

/** Ordered exactly like MAIL_MEMBERS, with a runtime guard for future roster additions. */
export const POSTCARD_IDENTITIES: readonly PostcardIdentity[] = Object.freeze(
  MAIL_MEMBERS.map((member) => {
    if (!isPostcardIdentitySlug(member.slug)) {
      throw new Error(`MAIL_MEMBERS contains "${member.slug}" without a postcard identity.`);
    }
    return POSTCARD_IDENTITIES_BY_SLUG[member.slug];
  }),
);

export function postcardIdentityFor(slug: string | null | undefined): PostcardIdentity | null {
  return slug && isPostcardIdentitySlug(slug) ? POSTCARD_IDENTITIES_BY_SLUG[slug] : null;
}

/** Designs are scoped to a recipient so the studio never presents a shared skin grid. */
export function postcardDesignsFor(slug: string | null | undefined): readonly PostcardFrontDesign[] {
  return postcardIdentityFor(slug)?.frontDesigns ?? [];
}

/**
 * Resolve a design inside its recipient first. Unknown ids fall back to that
 * recipient's first design, matching the legacy postcard catalog's behavior.
 * With no recipient, ids are searched globally before using the first catalog
 * design as the safe initial value.
 */
export function designById(
  id: string | null | undefined,
  recipientSlug?: string | null,
): PostcardFrontDesign {
  const scopedIdentity = postcardIdentityFor(recipientSlug);
  if (scopedIdentity) {
    return scopedIdentity.frontDesigns.find((design) => design.id === id)
      ?? scopedIdentity.frontDesigns[0]!;
  }
  for (const identity of POSTCARD_IDENTITIES) {
    const design = identity.frontDesigns.find((candidate) => candidate.id === id);
    if (design) return design;
  }
  return POSTCARD_IDENTITIES[0]!.frontDesigns[0]!;
}

export type PostcardSeed = string | number;

function normalizedSeed(seed: PostcardSeed): string {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) throw new TypeError("A postcard seed must be a finite number or string.");
    return Object.is(seed, -0) ? "0" : String(seed);
  }
  return seed;
}

/** Stable 32-bit FNV-1a hash with a final avalanche. */
export function hashPostcardSeed(seed: PostcardSeed, channel = "root"): number {
  const input = `${channel}\u0000${normalizedSeed(seed)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** A deterministic value in [0, 1), independently salted by field channel. */
export function seededPostcardUnit(seed: PostcardSeed, channel = "root"): number {
  return hashPostcardSeed(seed, channel) / 0x1_0000_0000;
}

export function pickSeededPostcardValue<T>(
  values: readonly T[],
  seed: PostcardSeed,
  channel: string,
): T {
  if (values.length === 0) throw new RangeError("Cannot pick a postcard value from an empty list.");
  const index = Math.floor(seededPostcardUnit(seed, channel) * values.length);
  return values[index]!;
}

function seededRange(
  seed: PostcardSeed,
  channel: string,
  range: readonly [number, number],
  decimals: number,
): number {
  const [minimum, maximum] = range;
  const value = minimum + (maximum - minimum) * seededPostcardUnit(seed, channel);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type SeededPostcardVariation = {
  catalogVersion: typeof POSTCARD_IDENTITY_CATALOG_VERSION;
  algorithmVersion: typeof POSTCARD_VARIATION_ALGORITHM_VERSION;
  /** Normalized public seed, suitable for saving with a draft/order. */
  seed: string;
  seedHash: number;
  designId: string;
  motifIds: readonly [string, string];
  layoutVariant: string;
  attachmentStyle: string;
  edgeTreatment: string;
  postmarkPosition: PostcardPostmark["positions"][number];
  stampRotationDeg: number;
  postmarkRotationDeg: number;
  artworkRotationDeg: number;
  imageScale: number;
  grainOpacity: number;
  inkBleedPx: number;
  registrationShift: boolean;
};

/**
 * Builds repeatable, streamer-specific imperfections from an order/draft seed.
 * Every property uses its own channel, so introducing a new property later does
 * not change the already-generated choices in other properties.
 */
export function createSeededPostcardVariation(
  identityOrSlug: PostcardIdentity | PostcardIdentitySlug,
  seed: PostcardSeed,
  selectedDesignId?: string | null,
): SeededPostcardVariation {
  const identity = typeof identityOrSlug === "string"
    ? POSTCARD_IDENTITIES_BY_SLUG[identityOrSlug]
    : identityOrSlug;
  const scopedSeed = `${identity.slug}:${normalizedSeed(seed)}`;
  const primaryMotif = pickSeededPostcardValue(identity.motifs, scopedSeed, "motif-primary");
  const remainingMotifs = identity.motifs.filter((motif) => motif.id !== primaryMotif.id);
  const secondaryMotif = pickSeededPostcardValue(remainingMotifs, scopedSeed, "motif-secondary");

  return Object.freeze({
    catalogVersion: POSTCARD_IDENTITY_CATALOG_VERSION,
    algorithmVersion: POSTCARD_VARIATION_ALGORITHM_VERSION,
    seed: normalizedSeed(seed),
    seedHash: hashPostcardSeed(scopedSeed, "identity"),
    // Seeded details never replace the design explicitly chosen by the fan.
    designId: designById(selectedDesignId, identity.slug).id,
    motifIds: Object.freeze([primaryMotif.id, secondaryMotif.id]) as readonly [string, string],
    layoutVariant: pickSeededPostcardValue(identity.variation.layoutVariants, scopedSeed, "layout"),
    attachmentStyle: pickSeededPostcardValue(identity.variation.attachmentStyles, scopedSeed, "attachment"),
    edgeTreatment: pickSeededPostcardValue(identity.variation.edgeTreatments, scopedSeed, "edge"),
    postmarkPosition: pickSeededPostcardValue(identity.postage.postmark.positions, scopedSeed, "postmark-position"),
    stampRotationDeg: seededRange(scopedSeed, "stamp-rotation", identity.postage.stamp.rotationRangeDeg, 2),
    postmarkRotationDeg: seededRange(scopedSeed, "postmark-rotation", identity.postage.postmark.rotationRangeDeg, 2),
    artworkRotationDeg: seededRange(scopedSeed, "artwork-rotation", identity.variation.artworkRotationRangeDeg, 2),
    imageScale: seededRange(scopedSeed, "image-scale", identity.variation.imageScaleRange, 3),
    grainOpacity: seededRange(scopedSeed, "grain", identity.variation.grainOpacityRange, 3),
    inkBleedPx: seededRange(scopedSeed, "ink-bleed", identity.variation.inkBleedRangePx, 2),
    registrationShift: seededPostcardUnit(scopedSeed, "registration-shift") >= 0.68,
  });
}

/** Seed-first alias for view code; pass the selected recipient when available. */
export function seededPostcardVariation(
  seed: PostcardSeed,
  recipientSlug: PostcardIdentitySlug = POSTCARD_IDENTITIES[0]!.slug,
  selectedDesignId?: string | null,
): SeededPostcardVariation {
  return createSeededPostcardVariation(recipientSlug, seed, selectedDesignId);
}

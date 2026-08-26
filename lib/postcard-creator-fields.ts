/**
 * Recipient-owned postcard controls.
 *
 * These definitions are data only and shared by the editor, scene resolver,
 * screen preview, and print renderer. A control is valid only for its named
 * recipient and the explicitly listed catalog design ids.
 */
import type { PostcardIdentitySlug } from "./postcard-identities";

export type PostcardCreatorFieldGroup = "badge" | "headline" | "detail" | "note";

export type PostcardCreatorFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  options?: readonly string[];
  designIds: readonly string[];
  group: PostcardCreatorFieldGroup;
  section?: "collection";
};

const RON_ALL = ["ron-breaking-live", "ron-overtime", "ron-night-monitor", "ron-instant-replay"] as const;
const JASON_ALL = ["jason-rookie", "jason-stat-leader", "jason-side-quest", "jason-holo-mvp"] as const;
const LACY_ALL = ["lacy-front-page", "lacy-sports-extra", "lacy-classifieds", "lacy-late-edition"] as const;
const MARLON_ALL = ["marlon-icon-issue", "marlon-street-style", "marlon-match-day", "marlon-after-dark"] as const;
const ADAPT_ALL = ["adapt-og-stack", "adapt-contact-sheet", "adapt-tour-notes", "adapt-flock-files"] as const;

const CORE_CREATIVE_META = [
  { id: "crossover-format", label: "Crossover", options: ["Solo", "Duo", "Trio", "Full house"], group: "badge" },
  { id: "featured-members", label: "Featured members", placeholder: "Ron + Jason + Lacy", group: "detail" },
  { id: "edition-type", label: "Edition type", options: ["Moment", "First stream", "Channel anniversary", "Event", "Trip", "Tournament", "House move", "Yearbook"], group: "badge" },
  { id: "milestone-kind", label: "Milestone", options: ["Followers", "Subscribers", "Airtime", "Viewership", "Watchtime"], group: "badge" },
  { id: "milestone-value", label: "Verified milestone value", placeholder: "1,000,000 followers", group: "headline" },
  { id: "watching-since", label: "Watching since", placeholder: "2021", group: "detail" },
  { id: "core-era", label: "Favorite CORE era / series", placeholder: "The first house era", group: "note" },
  { id: "artwork-composition", label: "Artwork composition", options: ["Single-card artwork", "Matching-pair artwork", "Panoramic artwork"], group: "badge" },
] as const;

function coreCreativeMeta(designIds: readonly string[]) {
  return CORE_CREATIVE_META.map((field) => ({ ...field, designIds, section: "collection" as const }));
}

export const POSTCARD_CREATOR_FIELD_DEFINITIONS = {
  ron: {
    title: "Stable control room",
    fields: [
      { id: "broadcast-mode", label: "Broadcast mode", options: ["Red alert", "Blue broadcast", "Green night-cam", "Monochrome"], designIds: RON_ALL, group: "badge" },
      { id: "ticker", label: "Scrolling ticker", placeholder: "BREAKING · chat is moving...", designIds: ["ron-breaking-live", "ron-overtime"], group: "headline" },
      { id: "camera-feed", label: "Camera feed / channel", placeholder: "CAM 02 · STABLE HOUSE", designIds: ["ron-breaking-live", "ron-night-monitor", "ron-instant-replay"], group: "badge" },
      { id: "clip-timecode", label: "Clip timestamp", placeholder: "02:14:37", designIds: ["ron-breaking-live", "ron-night-monitor", "ron-instant-replay"], group: "detail" },
      { id: "hero-replay", label: "Hero replay panel", options: ["Feed A", "Feed B", "Replay 1", "Replay 2"], designIds: ["ron-instant-replay"], group: "badge" },
      { id: "live-duration", label: "Still live after…", placeholder: "8h 42m", designIds: ["ron-overtime"], group: "headline" },
      { id: "stream-category", label: "Stream title / category", placeholder: "IRL · Just Chatting", designIds: ["ron-breaking-live", "ron-overtime"], group: "detail" },
      { id: "on-air-schedule", label: "On-air schedule", placeholder: "9 PM · House stream", designIds: ["ron-breaking-live", "ron-overtime"], group: "detail" },
      { id: "director-notes", label: "Director notes / cue", placeholder: "TAKE CAM 3 · ROLL REPLAY", designIds: ["ron-instant-replay"], group: "note" },
      ...coreCreativeMeta(RON_ALL),
    ],
  },
  jason: {
    title: "NMS player card",
    fields: [
      { id: "card-class", label: "Card class", options: ["Rookie", "MVP", "Quest", "Breakout", "Teammate", "Legendary"], designIds: JASON_ALL, group: "badge" },
      { id: "holo", label: "Faux-holo treatment", options: ["Cyan", "Magenta", "Gold", "Dark-prism", "Rainbow"], designIds: ["jason-holo-mvp"], group: "badge" },
      { id: "serial-prefix", label: "Display prefix", options: ["NMS", "MVP", "ROOKIE", "QUEST"], designIds: JASON_ALL, group: "badge" },
      { id: "ability", label: "Custom move / ability", placeholder: "Aura Overdrive", designIds: ["jason-rookie", "jason-stat-leader", "jason-holo-mvp"], group: "headline" },
      { id: "quest-objective", label: "Quest objective", placeholder: "Complete the side mission", designIds: ["jason-side-quest"], group: "headline" },
      { id: "quest-reward", label: "Reward", placeholder: "+500 Aura", designIds: ["jason-side-quest"], group: "detail" },
      { id: "quest-xp", label: "XP", placeholder: "2,500 XP", designIds: ["jason-side-quest"], group: "badge" },
      { id: "completion-date", label: "Completion date", placeholder: "Aug 21, 2026", designIds: ["jason-side-quest"], group: "detail" },
      { id: "matchup", label: "CORE matchup", placeholder: "Jason vs. Ron", designIds: ["jason-stat-leader"], group: "headline" },
      { id: "strengths", label: "Strengths", placeholder: "Clutch · IRL · loyalty", designIds: ["jason-rookie", "jason-stat-leader", "jason-holo-mvp"], group: "detail" },
      { id: "weaknesses", label: "Weaknesses", placeholder: "Side quests", designIds: ["jason-rookie", "jason-stat-leader", "jason-holo-mvp"], group: "detail" },
      { id: "special-trait", label: "Special trait", placeholder: "Achievement unlocked", designIds: ["jason-rookie", "jason-stat-leader", "jason-holo-mvp"], group: "note" },
      { id: "career-moment", label: "Career moment", placeholder: "The stream that changed everything", designIds: ["jason-rookie", "jason-holo-mvp"], group: "note" },
      { id: "rating-clutch", label: "Clutch rating", placeholder: "99", designIds: ["jason-stat-leader"], group: "detail" },
      { id: "rating-chaos", label: "Chaos rating", placeholder: "99", designIds: ["jason-stat-leader"], group: "detail" },
      { id: "rating-aura", label: "Aura rating", placeholder: "99", designIds: ["jason-stat-leader"], group: "detail" },
      { id: "rating-comedy", label: "Comedy rating", placeholder: "99", designIds: ["jason-stat-leader"], group: "detail" },
      { id: "rating-irl", label: "IRL rating", placeholder: "99", designIds: ["jason-stat-leader"], group: "detail" },
      ...coreCreativeMeta(JASON_ALL),
    ],
  },
  lacy: {
    title: "Thugs late edition",
    fields: [
      { id: "masthead", label: "Newspaper masthead", placeholder: "THE THUGS TIMES", designIds: LACY_ALL, group: "headline" },
      { id: "edition-mode", label: "Edition", options: ["Broadsheet", "Tabloid", "Late edition", "Sports extra"], designIds: LACY_ALL, group: "badge" },
      { id: "article-deck", label: "Article deck", placeholder: "The full story from inside the house", designIds: ["lacy-front-page", "lacy-late-edition"], group: "detail" },
      { id: "byline", label: "Byline", placeholder: "By a CORE correspondent", designIds: ["lacy-front-page", "lacy-late-edition"], group: "detail" },
      { id: "classified", label: "Mini classified ad", placeholder: "WANTED: one good teammate", designIds: ["lacy-classifieds"], group: "headline" },
      { id: "editor-marks", label: "Editor marks", options: ["Clean", "Circled", "Corrected", "Approved"], designIds: ["lacy-classifieds"], group: "badge" },
      { id: "match-report", label: "Score / match report", placeholder: "THUGS 3 — 1 WORLD", designIds: ["lacy-sports-extra"], group: "headline" },
      { id: "breaking-strip", label: "Breaking-news strip", placeholder: "BREAKING: LACY RESPONDS", designIds: ["lacy-front-page", "lacy-late-edition"], group: "headline" },
      { id: "opinion-roast", label: "Opinion-column roast", placeholder: "Keep it playful—not personal.", designIds: ["lacy-front-page", "lacy-classifieds"], group: "note" },
      ...coreCreativeMeta(LACY_ALL),
    ],
  },
  marlon: {
    title: "M3 editorial desk",
    fields: [
      { id: "art-direction", label: "Art direction", options: ["Minimalist", "Sport", "Streetwear", "After dark"], designIds: MARLON_ALL, group: "badge" },
      { id: "cover-line-1", label: "Cover line 1", placeholder: "THE NEW STANDARD", designIds: ["marlon-icon-issue", "marlon-street-style", "marlon-after-dark"], group: "headline" },
      { id: "cover-line-2", label: "Cover line 2", placeholder: "STYLE · SPORT · CULTURE", designIds: ["marlon-icon-issue", "marlon-street-style", "marlon-after-dark"], group: "headline" },
      { id: "cover-line-3", label: "Cover line 3", placeholder: "INSIDE M3", designIds: ["marlon-icon-issue", "marlon-street-style", "marlon-after-dark"], group: "headline" },
      { id: "issue-name", label: "Issue name", placeholder: "The Movement Issue", designIds: MARLON_ALL, group: "badge" },
      { id: "folio", label: "Folio number", placeholder: "M3 / 024", designIds: MARLON_ALL, group: "badge" },
      { id: "opponent", label: "Opponent", placeholder: "CORE House", designIds: ["marlon-match-day"], group: "detail" },
      { id: "player-of-match", label: "Player of the match", placeholder: "Marlon", designIds: ["marlon-match-day"], group: "headline" },
      { id: "location-study", label: "Location-study caption", placeholder: "Los Angeles, after dark", designIds: ["marlon-street-style", "marlon-after-dark"], group: "detail" },
      { id: "editor-letter", label: "Editor’s-letter note", placeholder: "A note from this issue…", designIds: MARLON_ALL, group: "note" },
      { id: "vertical-type", label: "Fashion-house type", options: ["Horizontal", "Vertical"], designIds: ["marlon-street-style"], group: "badge" },
      { id: "premium-density", label: "Layout density", options: ["Premium clean", "Balanced", "Maximal"], designIds: MARLON_ALL, group: "badge" },
      ...coreCreativeMeta(MARLON_ALL),
    ],
  },
  adapt: {
    title: "Flock archive lab",
    fields: [
      { id: "archive-era", label: "Archive era / year", placeholder: "FLOCK · 2024", designIds: ADAPT_ALL, group: "badge" },
      { id: "map-pins", label: "Trip / tour map pins", placeholder: "LA → Paris → London", designIds: ["adapt-tour-notes"], group: "headline" },
      { id: "folder-tab", label: "Archive folder tab", placeholder: "ROLL 06 · FRIENDS", designIds: ["adapt-flock-files"], group: "badge" },
      { id: "evidence-label", label: "Evidence label", placeholder: "FILED BY ADAPT", designIds: ["adapt-contact-sheet", "adapt-flock-files"], group: "headline" },
      { id: "sequence", label: "Contact-sheet order", options: ["Chronological", "Newest first", "Story order"], designIds: ["adapt-contact-sheet"], group: "badge" },
      { id: "then-now", label: "Then & now", options: ["Off", "Split", "Overlay"], designIds: ["adapt-og-stack", "adapt-flock-files"], group: "badge" },
      { id: "collaborators", label: "Collaborator tags", placeholder: "Flock · CORE · friends", designIds: ADAPT_ALL, group: "detail" },
      { id: "series-tags", label: "Series tags", placeholder: "Tour log · episode 4", designIds: ADAPT_ALL, group: "detail" },
      { id: "memory-arrows", label: "Handwritten arrows", options: ["None", "Subtle", "All connections"], designIds: ["adapt-og-stack", "adapt-tour-notes"], group: "note" },
      { id: "travel-stops", label: "Travel-journal stops", placeholder: "1. Paris  2. London  3. Home", designIds: ["adapt-tour-notes"], group: "note" },
      ...coreCreativeMeta(ADAPT_ALL),
    ],
  },
} as const satisfies Readonly<Record<PostcardIdentitySlug, { title: string; fields: readonly PostcardCreatorFieldDefinition[] }>>;

type CreatorDefinitions = typeof POSTCARD_CREATOR_FIELD_DEFINITIONS;

export type PostcardCreatorFieldId<Slug extends PostcardIdentitySlug = PostcardIdentitySlug> =
  CreatorDefinitions[Slug]["fields"][number]["id"];

export type PostcardCreatorFieldValues<Slug extends PostcardIdentitySlug = PostcardIdentitySlug> =
  Partial<Record<PostcardCreatorFieldId<Slug>, string>>;

export type PostcardCreatorFields = {
  [Slug in PostcardIdentitySlug]: {
    recipientSlug: Slug;
    values: PostcardCreatorFieldValues<Slug>;
  }
}[PostcardIdentitySlug];

export function creatorFieldDefinitionsFor(
  recipientSlug: PostcardIdentitySlug,
  designId?: string,
): readonly PostcardCreatorFieldDefinition[] {
  const fields: readonly PostcardCreatorFieldDefinition[] = POSTCARD_CREATOR_FIELD_DEFINITIONS[recipientSlug].fields;
  return designId ? fields.filter((field) => field.designIds.includes(designId)) : fields;
}

export function emptyPostcardCreatorFields<Slug extends PostcardIdentitySlug>(
  recipientSlug: Slug,
): Extract<PostcardCreatorFields, { recipientSlug: Slug }> {
  return { recipientSlug, values: {} } as Extract<PostcardCreatorFields, { recipientSlug: Slug }>;
}

export function creatorFieldDefinition(
  recipientSlug: PostcardIdentitySlug,
  fieldId: string,
): PostcardCreatorFieldDefinition | null {
  return creatorFieldDefinitionsFor(recipientSlug).find((field) => field.id === fieldId) ?? null;
}

/** Editorial house eras — cinematic, not a tweet dump. */
export type TimelineBeat = {
  id: string;
  when: string;
  title: string;
  body: string;
  slug?: string;
};

export const HOUSE_TIMELINE: readonly TimelineBeat[] = [
  {
    id: "form",
    when: "The forming",
    title: "Six names. One roof.",
    body: "A house, not a brand deal. The roster locks: Adapt, Ron, Lacy, Marlon, Jason, Silky.",
  },
  {
    id: "unc",
    when: "The Unc",
    title: "Adapt keeps the flock moving.",
    body: "The OG voice. IRL gravity. The room still turns when he goes live.",
    slug: "adapt",
  },
  {
    id: "stable",
    when: "The clip",
    title: "StableRonaldo is the clip.",
    body: "FNCS, cars, Payphone, the GT3. He doesn’t post highlights. He is one.",
    slug: "ron",
  },
  {
    id: "irl",
    when: "The street",
    title: "Lacy takes it outside.",
    body: "IRL pioneer energy. McDonald’s, cameramen, transformation arcs.",
    slug: "lacy",
  },
  {
    id: "d1",
    when: "The sportsman",
    title: "Marlon, D1.",
    body: "Studio polish, street tempo. M3 in the blood, CORE in the house.",
    slug: "marlon",
  },
  {
    id: "ween",
    when: "The breakout",
    title: "JasonTheWeen, collab after collab.",
    body: "Valorant to household. When he’s live the room shifts.",
    slug: "jason",
  },
  {
    id: "silk",
    when: "The veteran",
    title: "Silky, give him two hours.",
    body: "Trenches to the house. If he says he’s live, pour a drink. #wootiming",
    slug: "silky",
  },
  {
    id: "now",
    when: "Now",
    title: "Create. Own. Run. Everything.",
    body: "The Watch is the living room. The Guide is the night. The house is on.",
  },
];

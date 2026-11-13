/** November 12, 2026, 5 PM Pacific / 8 PM Eastern. One instant for every visitor. */
export const STREAMER_AWARDS_ENDS_AT = "2026-11-13T01:00:00.000Z";
export const STREAMER_AWARDS_ENDS_AT_MS = Date.parse(STREAMER_AWARDS_ENDS_AT);

/** One week in the home hero: November 13–20, 2026, ending at 3 PM Eastern. */
export const STREAMER_AWARDS_WINNER_ENDS_AT_MS = Date.parse("2026-11-20T20:00:00.000Z");

export function streamerAwardsCountdown(now: number) {
  const secondsLeft = Math.ceil((STREAMER_AWARDS_ENDS_AT_MS - now) / 1000);
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return null;
  return {
    days: Math.floor(secondsLeft / 86_400),
    hours: Math.floor(secondsLeft / 3_600) % 24,
    minutes: Math.floor(secondsLeft / 60) % 60,
    seconds: secondsLeft % 60,
  };
}

export const STREAMER_AWARDS_NOMINEES = [
  { id: "ron-streamer-of-the-year", name: "StableRonaldo", category: "Streamer of the Year", image: "stableronaldo-streamer-of-the-year.webp" },
  { id: "ron-reality", name: "StableRonaldo", category: "Best Reality Streamer", image: "stableronaldo-reality.webp" },
  { id: "lacy-sports", name: "Lacy", category: "Best Sports Streamer", image: "lacy-sports.webp" },
  { id: "marlon-lacy", name: "Marlon & Lacy", category: "Best Stream Duo", image: "marlon-lacy-duo.webp" },
  { id: "adapt-maya", name: "Adapt × Maya Higa", category: "Best Streamer Collab", image: "adapt-maya-higa-collab.webp" },
  { id: "ron-jynxzi-lospollos", name: "Jynxzi × StableRonaldo × LosPollosTV", category: "Best Streamer Collab", image: "ron-jynxzi-lospollos-collab.webp" },
  { id: "jason-collab", name: "JasonTheWeen × NotQuiteLikeDub × TBVNKS × Pudgie16", category: "Best Streamer Collab", image: "jason-collab.webp" },
  { id: "jason-stranded", name: "7 Days Stranded · JasonTheWeen", category: "Best Marathon Stream", image: "jason-seven-days-stranded.webp" },
  { id: "chained-together", name: "Chained Together · Jynxzi × StableRonaldo × LosPollosTV", category: "Best Marathon Stream", image: "chained-together.webp" },
] as const;

export function streamerAwardsImage(image: string) {
  return `/awards/2026/${image}`;
}

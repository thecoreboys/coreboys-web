import type { CoreOriginal, CoreOriginalItem, CoreOriginalSnapshot } from "./core-originals";
import { originalSourceKey } from "./core-originals-matching";

/**
 * Published CORE Originals episodes curated in code.
 *
 * This is the single place to add or reorder built-in episodes. Every entry is
 * a reference (platform + id) to an official upload on a CORE creator's own
 * channel — never copied media — and was checked to exist, be public and allow
 * embedding when it was added. Episodes are listed in episode order (oldest
 * first), which is the order the collection page numbers and queues them.
 *
 * Collections that carry the CORE name only include uploads from on or after
 * the group's launch (2026-04-30).
 *
 * Editorial control still lives in the admin queue: approved database items are
 * shown after these, and rejecting an item with the same source link in the
 * admin hides the matching entry here. New uploads that match a collection's
 * title rules (`core-originals-matching.ts`) are suggested to that queue
 * automatically by the catalog sync.
 */
type CuratedEpisode = {
  platform: "youtube";
  /** Provider id; for YouTube, the 11-character video id. */
  id: string;
  /** The upload's own title. */
  title: string;
  /** The official channel the episode was published on. */
  channel: string;
  /** Provider publish date (YYYY-MM-DD). */
  publishedAt: string;
  format?: "long" | "short";
};

const yt = (id: string, title: string, channel: string, publishedAt: string, format: CuratedEpisode["format"] = "long"): CuratedEpisode =>
  ({ platform: "youtube", id, title, channel, publishedAt, format });

export const CURATED_ORIGINAL_EPISODES: Readonly<Record<string, readonly CuratedEpisode[]>> = {
  // The group trip to Las Vegas, 24–25 May 2026, from four members' channels.
  "core-x-vegas": [
    yt("TafNWRddT9g", "I Spent 24 Hours In Vegas", "Lacy", "2026-05-24"),
    yt("s5ngOWt817E", "Surviving 24 Hours In Las Vegas!", "Stable Ronaldo Live", "2026-05-24"),
    yt("jHlOfCiV_fA", "24 Hours in Vegas With CORE!", "Adapt Live", "2026-05-25"),
    yt("44UNvNS5mBs", "CORE Goes To Las Vegas FULL Stream!", "JasonTheWeen VODs", "2026-05-25"),
  ],
  // CORE members playing basketball together since the group launched.
  "basketball-segments": [
    yt("1jSpibfC9rM", "CORE Plays 3v3 Basketball!", "Silky Live", "2026-05-02"),
    yt("sPN1ohJ5fCI", "CORE Basketball Gets TOXIC..", "Silky Live", "2026-05-11"),
    yt("Zpca8y4eZZI", "I Played Basketball With Core And It Got Heated..", "Marlon", "2026-05-11"),
    yt("LRpsewlpyjE", "CORE Plays Basketball w/ Plaqueboymax & Kyle Richh!", "Silky Live", "2026-05-26"),
    yt("In6v4AmCgoo", "Lacy & Clix VS JasonTheWeen & Deji 2v2 Basketball", "Lacy Live", "2026-06-07"),
    yt("s7F-HGojupM", "CORE & OSCS TOXIC 4V4 BASKETBALL!", "Silky Live", "2026-07-02"),
    yt("fRugXRS4z6k", "CORE Plays Basketball At 1AM..", "JasonTheWeen Live", "2026-07-30"),
    yt("HuO7ez10kCw", "Marlon VS JasonTheWeen INTENSE Basketball 1V1!", "Marlon", "2026-08-14"),
    yt("NwU1InxLOxY", "I 1v1'd Marlon, But He's One Handed..", "JasonTheWeen Live", "2026-08-14"),
    yt("MfN0YDLEVJ4", "I Hosted a $100,000 Basketball Tournament!", "Marlon", "2026-08-18"),
    yt("MCU6Kr6uOw0", "How I Won The CORE 3V3 Basketball Tourney!", "JasonTheWeen Live", "2026-08-18"),
    yt("lhCCcrrflrg", "2AM Basketball At The CORE House..", "Silky Live", "2026-09-09"),
  ],
  // The members' recurring "SPICIEST Questions | Hot Ones" episodes, including
  // the guest episodes JasonTheWeen hosted.
  "hot-ones": [
    yt("AddmkgHz5m8", "HasanAbi Answers SPICIEST Questions | Hot Ones", "JasonTheWeen", "2024-09-09"),
    yt("hZoHZbHwLkc", "Valkyrae Answers SPICIEST Questions | Hot Ones", "JasonTheWeen", "2024-09-13"),
    yt("6UST1PC3uJo", "FaZe LEAKS Everything During Spicy Questions | Hot Ones", "Silky Live", "2024-09-19"),
    yt("zyefPAbRHWw", "Ludwig Answers SPICIEST Questions | Hot Ones", "JasonTheWeen", "2024-09-24"),
    yt("vvWd2xT-zmk", "FaZe Answers SPICIEST Questions | Hot Ones", "Stable Ronaldo Live", "2025-02-23"),
    yt("MJ8K0-IKmtY", "JasonTheWeen Answers SPICIEST Questions | Hot Ones", "JasonTheWeen Live", "2025-04-12"),
    yt("mHgXJ1S7Spk", "FaZe Rug & Lacy Answer the SPICIEST Questions | Hot Ones", "Lacy", "2025-04-20"),
    yt("TU_KxtXBeP8", "We Faced The SPICIEST Questions Ever On Hot Ones..", "Marlon", "2025-08-09"),
    yt("arQK0BAHP0I", "Jason & OSCS Answer SPICIEST Questions | Hot Ones", "JasonTheWeen Live", "2025-08-31"),
    yt("j0BrLZtPLW4", "Spicy Questions Expose EVERYTHING | Hot Ones ft. FaZe", "Silky Live", "2025-10-23"),
  ],
  // Lacy's Caretaker series (17–27 Aug 2026); Marlon's caretaker day closes it.
  "caretakers": [
    yt("_ynlAVRWCDE", "I Hired 2 Streamers to Take Care of Me..", "Lacy Live", "2026-08-21"),
    yt("c9_nhLrOthU", "Wardrobe Became My Caretaker..", "Lacy Live", "2026-08-24"),
    yt("xbznstOcNh4", "MARLON X LACY SURPRISING HIM WITH THE BEST DAY EVER! (Part 1)", "Marlon VODs", "2026-08-26"),
    yt("gLp1qGst5KU", "MARLON X LACY SURPRISING HIM WITH THE BEST DAY EVER! (Part 2)", "Marlon VODs", "2026-08-27"),
  ],
  // The $25,000 99-kill-lead 1v1 against Peterbot, and the follow-up.
  "stable-99-kill-lead": [
    yt("JrEJTB73_HE", "I 1v1'd The BEST Fortnite Player For $25,000.. (Peterbot)", "Stable Ronaldo Live", "2025-05-14"),
    yt("lNqGLtoOShY", "I Gave Plaqueboymax A 99 Kill Lead! 😂", "Stable Ronaldo Live", "2025-12-01", "short"),
    yt("XZaEsfl7D5U", "I Gave The Worst Fortnite Player A 99 Kill Lead..", "Stable Ronaldo Live", "2025-12-03"),
  ],
  // "7 Days Stranded On An Island", one edited episode per day.
  "jason-the-ween": [
    yt("edabzbXP3KU", "I Survived 7 Days Stranded On An Island! (Day 1)", "JasonTheWeen", "2026-02-16"),
    yt("F1Uq5eo2YF0", "I Survived 7 Days Stranded On An Island! (Day 2)", "JasonTheWeen", "2026-02-17"),
    yt("p4e_vdZmUmU", "I Survived 7 Days Stranded On An Island! (Day 3)", "JasonTheWeen", "2026-02-18"),
    yt("KV74Si0Yyzc", "I Survived 7 Days Stranded On An Island! (Day 4)", "JasonTheWeen", "2026-02-19"),
    yt("hGwtqWvkOlg", "I Survived 7 Days Stranded On An Island! (Day 5)", "JasonTheWeen", "2026-02-20"),
    yt("D9POsdMNS5M", "I Survived 7 Days Stranded On An Island! (Day 6)", "JasonTheWeen", "2026-02-21"),
    yt("6ZJgNxOh84c", "I Survived 7 Days Stranded On An Island! (Day 7)", "JasonTheWeen", "2026-02-21"),
  ],
  // JasonTheWeen's Maybach interview series, "Stuck In A Maybach With …".
  "maybach-mondays": [
    yt("yC-ppJlHtqQ", "Stuck In A Maybach With Stable Ronaldo!", "JasonTheWeen", "2025-12-01"),
    yt("Ckk0Y1eHI9w", "Stuck In A Maybach With Tara Yummy!", "JasonTheWeen", "2025-12-09"),
    yt("rAv5y4DzT7w", "Stuck In A Maybach With MrBeast!", "JasonTheWeen", "2026-01-07"),
    yt("SDrtwp7QA18", "Stuck In A Maybach With FaZe Rug!", "JasonTheWeen", "2026-01-27"),
    yt("jnPDUxPssZ8", "Stuck In A Maybach With KSI!", "JasonTheWeen", "2026-02-02"),
    yt("aIZTNkYNIj4", "Stuck In A Maybach With Fanum!", "JasonTheWeen", "2026-03-23"),
    yt("z-ppLuisuq4", "Stuck In A Maybach With Ludwig!", "JasonTheWeen", "2026-07-29"),
    yt("9zd0Uqz6Z8Y", "Stuck In A Maybach With Valkyrae!", "JasonTheWeen", "2026-09-01"),
  ],
  // JasonTheWeen's NMS Boxing events, one edited episode per event (1–5).
  "nms-boxing": [
    yt("h0Z886s85aM", "I Hosted A Streamer Boxing Event!", "JasonTheWeen", "2025-01-15"),
    yt("n2uNIeONkww", "I Hosted A Streamer Boxing Event!", "JasonTheWeen", "2025-09-22"),
    yt("ZAJUIHxh_-g", "I Hosted A Streamer Boxing Event!", "JasonTheWeen", "2026-01-31"),
    yt("GDX7uYkVBzw", "I Hosted & Fought In A Streamer Boxing Event!", "JasonTheWeen", "2026-06-06"),
    yt("f-CMWn0qN58", "I Hosted A $100,000 Streamer Boxing Event!", "JasonTheWeen", "2026-10-25"),
  ],
  // The Jynxzi × Stable Ronaldo × LosPollosTV marathon, 28–31 Aug 2026.
  "stable-los-jynxzi-chained": [
    yt("OF1g02Sj_B8", "This Video Ends When We Beat Chained Together..", "Stable Ronaldo Live", "2026-08-30"),
    yt("yp2gS08hNX0", "Every Time Jynxzi, Stable Ronaldo & Los Fell In Chained Together!", "Stable Ronaldo Live", "2026-08-30"),
    yt("CpmdbcgMWiU", "The Chained Together Marathon..🥺", "Stable Ronaldo Live", "2026-09-01", "short"),
  ],
  // Maya Higa and Alveus Sanctuary with a CORE member, since the group launched.
  "core-environment": [
    yt("JtVQJRy1ZiI", "Adapt Gets A Tour Of Alveus Sanctuary!", "Adapt Live", "2026-06-26"),
  ],
  // Members' P.O. Box openings since the group launched.
  "core-po-box-openings": [
    yt("ESWjfU6Eauw", "First P.O. Box Opening At The CORE House!", "Adapt Live", "2026-05-12"),
    yt("7LP4SM-uj1s", "I Had The CRAZIEST P.O. Box Opening Ever At The Core House..", "Marlon", "2026-05-12"),
    yt("D5hTdbMBUGE", "My First P.O. Box Opening At The CORE House!", "Stable Ronaldo Live", "2026-05-20"),
    yt("nMVZouNNKoE", "My Strangest P.O. Box Opening..", "Lacy", "2026-06-04"),
    yt("gpNzvxEZ32E", "My WORST P.O. Box Opening Yet..", "Stable Ronaldo Live", "2026-06-19"),
    yt("W5VX1pdPzFo", "My Most INSANE P.O. Box Opening..", "Lacy", "2026-06-23"),
    yt("8RBFf9xk2bI", "My First P.O. Box Opening After Surgery..", "Lacy", "2026-08-10"),
    yt("-EsP1aanm_s", "My BEST P.O. Box Opening..", "Stable Ronaldo Live", "2026-08-27"),
    yt("c7g_WvzztjU", "My Biggest P.O. Box Opening!", "Lacy", "2026-09-20"),
    yt("kwWEu_Ksp48", "My Biggest P.O. Box Opening!", "Adapt Live", "2026-09-24"),
    yt("IIe_fvbGKdw", "My FIRST P.O. Box Opening Ever!", "JasonTheWeen Live", "2026-10-17"),
    yt("OI41kBy42gE", "I Did A P.O. Box Opening With CORE!", "Stable Ronaldo Live", "2026-10-22"),
    yt("fYId4lncgwk", "My SPICEST P.O. Box Opening..", "Lacy", "2026-11-07"),
  ],
};

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function episodeItem(original: Pick<CoreOriginal, "id" | "slug">, episode: CuratedEpisode, index: number): CoreOriginalItem {
  const sourceUrl = `https://www.youtube.com/watch?v=${episode.id}`;
  return {
    id: `curated:${original.slug}:${episode.platform}:${episode.id}`,
    originalId: original.id,
    sourceUrl,
    platform: episode.platform,
    title: episode.title,
    subtitle: `${episode.channel} · ${DATE.format(new Date(`${episode.publishedAt}T00:00:00Z`))}`,
    posterUrl: `https://i.ytimg.com/vi/${episode.id}/maxresdefault.jpg`,
    format: episode.format ?? "long",
    status: "approved",
    recommendationNote: null,
    sortOrder: index,
  };
}

/** Code-curated episodes for one collection, in episode order. */
export function curatedOriginalItems(original: Pick<CoreOriginal, "id" | "slug">): CoreOriginalItem[] {
  return (CURATED_ORIGINAL_EPISODES[original.slug] ?? []).map((episode, index) => episodeItem(original, episode, index));
}

/**
 * Public view: curated episodes plus approved database items. A database row
 * for the same source (approved or rejected) takes precedence over the
 * curated entry, and rejected rows are never returned.
 */
export function withCuratedOriginalItems(snapshot: CoreOriginalSnapshot): CoreOriginalSnapshot {
  const reviewed = new Set(snapshot.items.map((item) => `${item.originalId}|${originalSourceKey(item.sourceUrl)}`));
  const curated = snapshot.originals.flatMap((original) => curatedOriginalItems(original)
    .filter((item) => !reviewed.has(`${item.originalId}|${originalSourceKey(item.sourceUrl)}`)));
  return { originals: snapshot.originals, items: [...curated, ...snapshot.items.filter((item) => item.status === "approved")] };
}

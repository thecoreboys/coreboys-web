import type { LiveEntry } from "./twitch";
import { MEMBERS_BY_LOGIN } from "./members-helpers";
import { formatViewerCount } from "./utils";

/**
 * Deterministic one-line "what's happening" summary built from the live
 * payload. No AI call needed: we already have member, game, viewer count.
 *
 *   "Ron is playing Valorant with 12.4K viewers."
 *   "Marlon and Jason are live — 8.7K combined."
 *   "Marlon, Ron, and Adapt are streaming."
 *
 * Returns `null` when nobody's live so callers can suppress the row.
 */
export function buildLiveSummary(live: LiveEntry[]): string | null {
  const ones = live
    .filter((e) => e.isLive)
    .map((e) => ({
      entry: e,
      member: MEMBERS_BY_LOGIN.get(e.login.toLowerCase()) ?? null,
    }));

  if (ones.length === 0) return null;

  const names = ones.map(({ entry, member }) => member?.stageName ?? entry.login);

  if (ones.length === 1) {
    const a = ones[0]!;
    const game = a.entry.game ?? null;
    const viewers = a.entry.viewerCount ?? null;
    const subj = names[0];
    if (game && viewers != null) {
      return `${subj} is playing ${game} — ${formatViewerCount(viewers)} watching.`;
    }
    if (game) return `${subj} is playing ${game}.`;
    if (viewers != null) return `${subj} is live — ${formatViewerCount(viewers)} watching.`;
    return `${subj} is live.`;
  }

  if (ones.length === 2) {
    const total = ones.reduce((acc, o) => acc + (o.entry.viewerCount ?? 0), 0);
    if (total > 0) {
      return `${names[0]} and ${names[1]} are live — ${formatViewerCount(total)} combined.`;
    }
    return `${names[0]} and ${names[1]} are live.`;
  }

  const head = names.slice(0, -1).join(", ");
  const tail = names[names.length - 1];
  const total = ones.reduce((acc, o) => acc + (o.entry.viewerCount ?? 0), 0);
  if (total > 0) {
    return `${head}, and ${tail} are streaming — ${formatViewerCount(total)} combined.`;
  }
  return `${head}, and ${tail} are streaming.`;
}

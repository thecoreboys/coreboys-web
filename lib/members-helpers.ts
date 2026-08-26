import { MEMBERS, type Member } from "./members";

/**
 * Reverse index: lowercased twitch login → Member. Built once at module
 * load (members are static), used by lib/live-summary.ts and the live
 * bar to resolve LiveEntry rows back to canonical members.
 */
export const MEMBERS_BY_LOGIN: ReadonlyMap<string, Member> = new Map(
  MEMBERS.map((m) => [m.twitchLogin.toLowerCase(), m]),
);

/** On-air name for a comm — "NMS Network", "SLG Network". */
export function networkLabel(commName: string): string {
  const name = commName.trim();
  if (!name) return "Network";
  return /network$/i.test(name) ? name : `${name} Network`;
}

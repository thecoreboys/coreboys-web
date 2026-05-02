import { MEMBERS, type Member } from "./members";

/**
 * Reverse index: lowercased twitch login → Member. Built once at module
 * load (members are static), used by lib/live-summary.ts and the live
 * bar to resolve LiveEntry rows back to canonical members.
 */
export const MEMBERS_BY_LOGIN: ReadonlyMap<string, Member> = new Map(
  MEMBERS.map((m) => [m.twitchLogin.toLowerCase(), m]),
);

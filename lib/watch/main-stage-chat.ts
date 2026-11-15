import type { Playable } from "./playable";

type ChatSource = Pick<Playable, "kind" | "platform" | "memberSlug" | "twitchLogin">;
type ChatMember = { slug: string; twitchLogin: string };

export type MainStageChatChoice = { sourceKey: string | null; login: string };

function twitchLogin(value: string | null | undefined): string | null {
  const login = value?.trim().toLowerCase();
  return login && /^[a-z0-9_]{1,25}$/.test(login) ? login : null;
}

/** A creator's Twitch chat also follows their live YouTube simulcast. */
export function mainStageTwitchLogin(
  source: ChatSource | null | undefined,
  members: readonly ChatMember[],
): string | null {
  if (source?.kind !== "live") return null;
  return (source.platform === "twitch" ? twitchLogin(source.twitchLogin) : null)
    ?? twitchLogin(members.find((member) => member.slug === source.memberSlug)?.twitchLogin);
}

/** Browsing another chat lasts until the main source changes, including remotely. */
export function mainStageChatSelection(
  sourceKey: string | null,
  mainLogin: string | null,
  choice: MainStageChatChoice | null,
  availableLogins: readonly string[],
): { login: string | null; followsMain: boolean } {
  const manualLogin = choice?.sourceKey === sourceKey ? twitchLogin(choice.login) : null;
  if (manualLogin && availableLogins.includes(manualLogin)) {
    return { login: manualLogin, followsMain: manualLogin === mainLogin };
  }
  return { login: mainLogin, followsMain: true };
}

/** Always connect the displayed chat, even when a saved room exceeds its budget. */
export function prioritizeChatLogins(
  logins: readonly string[],
  displayedLogin: string | null,
  mainLogin: string | null,
  limit: number,
): string[] {
  const normalized = [displayedLogin, mainLogin, ...logins]
    .map(twitchLogin)
    .filter((login): login is string => login !== null);
  return [...new Set(normalized)].slice(0, Math.max(1, Math.min(8, Math.floor(limit) || 1)));
}

import type { WatchItem } from "./types";

const DISPLAY_ACRONYMS: Record<string, string> = {
  core: "CORE",
  irl: "IRL",
  slg: "SLG",
  stbl: "STBL",
  tv: "TV",
  vod: "VOD",
  vods: "VODs",
  x: "X",
};

/** Presentation only. Raw handles must still be used for URLs and API calls. */
export function formatHandleDisplay(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const at = trimmed.startsWith("@");
  const body = at ? trimmed.slice(1) : trimmed;
  const acronym = DISPLAY_ACRONYMS[body.toLowerCase()];
  const firstLetter = body.search(/[a-z]/);
  const polished = acronym
    ?? (/[A-Z]/.test(body) || firstLetter < 0
      ? body
      : `${body.slice(0, firstLetter)}${body[firstLetter]!.toUpperCase()}${body.slice(firstLetter + 1)}`);
  return `${at ? "@" : ""}${polished}`;
}

export function formatDisplayLabel(value: string) {
  return value
    .split(/(\s*[·|/]\s*|\s+)/)
    .map((part) => {
      if (!part.trim() || /^[\s·|/]+$/.test(part)) return part;
      return formatHandleDisplay(part);
    })
    .join("");
}

function normalizedIdentity(value: string | null | undefined) {
  return value?.replace(/^@/, "").replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
}

export function watchAttributionLabel(item: WatchItem) {
  const account = item.accountLabel?.trim();
  const member = item.memberLabel?.trim() || item.memberSlug?.trim() || "CORE";
  if (!account) return formatDisplayLabel(member);

  const simpleAccount = !/[·|/\s]/.test(account) && /^@?[a-z0-9_.-]+$/i.test(account);
  const accountIdentity = normalizedIdentity(account);
  const knownIdentities = [item.memberSlug, item.memberLabel, item.live?.login]
    .map(normalizedIdentity)
    .filter(Boolean);

  if (simpleAccount && knownIdentities.includes(accountIdentity)) {
    const canonicalMember = member.replace(/[^a-z0-9._-]/gi, "");
    return `${account.startsWith("@") ? "@" : ""}${formatHandleDisplay(canonicalMember)}`;
  }

  return formatDisplayLabel(account);
}

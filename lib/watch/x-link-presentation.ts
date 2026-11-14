import { MEMBERS } from "@/lib/members";

/** Display-only casing. Never change the original post or a link's destination. */
export function xLinkPresentation(href: string, sourceLabel?: string, sourceTitle?: string) {
  let label = sourceLabel?.trim() || undefined;
  let title = sourceTitle?.trim() || undefined;
  // X retains the capitalization typed into a shared URL. Only normalize
  // its domain here; paths, queries, and identifiers can be case-sensitive.
  const parts = label && /^((?:https?:\/\/)?(?:www\.)?[a-z\d.-]+\.[a-z]{2,})([/?#].*)?$/i.exec(label);
  if (parts) {
    const host = parts[1]!.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").toLowerCase();
    label = `${host}${parts[2] ?? ""}`;
  }
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "twitch.tv" || host === "m.twitch.tv") {
      const login = /^\/([a-z\d_]+)\/?$/i.exec(url.pathname)?.[1];
      const member = login ? MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === login.toLowerCase()) : undefined;
      if (member) {
        label = `twitch.tv/${member.stageName}`;
        title = title
          ? title.replace(new RegExp(`^${member.twitchLogin}(?=$|[^a-z0-9_])`, "i"), member.stageName)
          : `Watch ${member.stageName} on Twitch`;
      }
      title = title?.replace(/\btwitch\b/gi, "Twitch");
    }
  } catch { /* The caller retains its existing invalid-link fallback. */ }
  return { label, title };
}

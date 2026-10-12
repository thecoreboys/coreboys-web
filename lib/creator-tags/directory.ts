import { MEMBERS } from "@/lib/members";
import { CreatorInput, type CreatorProfile, verifiedSocialUrl } from "./model";

// External channel links checked against the creators' public provider pages.
// https://kick.com/adinross / https://www.twitch.tv/plaqueboymax / https://www.twitch.tv/yourragegaming
const guests: CreatorProfile[] = [
  { id: "adin-ross", name: "Adin Ross", aliases: ["adinross"], active: true, socials: [{ platform: "kick", url: "https://kick.com/adinross" }] },
  { id: "plaqueboymax", name: "PlaqueBoyMax", aliases: ["plaque boy max"], active: true, socials: [{ platform: "twitch", url: "https://www.twitch.tv/plaqueboymax" }] },
  { id: "yourrage", name: "YourRAGE", aliases: ["yourragegaming", "yourrage gaming"], active: true, socials: [{ platform: "twitch", url: "https://www.twitch.tv/yourragegaming" }] },
];
export function defaultCreatorDirectory(): CreatorProfile[] {
  return [...MEMBERS.map((member) => CreatorInput.parse({
    id: member.slug, name: member.stageName,
    aliases: [...new Set([member.twitchLogin, ...member.socials.map((link) => link.handle?.replace(/^@/, "") ?? "")].filter((alias) => alias.length >= 3))].slice(0, 20),
    socials: member.socials.filter((link) => verifiedSocialUrl(link.platform, link.url)).map((link) => ({ platform: link.platform, url: link.url })),
    active: true,
  })), ...guests];
}

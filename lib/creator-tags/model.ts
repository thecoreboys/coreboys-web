import { z } from "zod";

export const SocialPlatform = z.enum(["youtube", "twitch", "kick", "x", "instagram", "tiktok", "snapchat"]);
export type CreatorSocial = { platform: z.infer<typeof SocialPlatform>; url: string };
export function verifiedSocialUrl(platform: string, value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    if (platform === "youtube") return host === "youtube.com" && /^\/(?:@[\w.-]+|channel\/UC[\w-]+)$/.test(path);
    if (platform === "tiktok") return host === "tiktok.com" && /^\/@[\w.]+$/.test(path);
    if (platform === "snapchat") return host === "snapchat.com" && /^\/add\/[\w.-]+$/.test(path);
    const hosts: Record<string, string[]> = { twitch: ["twitch.tv"], kick: ["kick.com"], x: ["x.com", "twitter.com"], instagram: ["instagram.com"] };
    return Boolean(hosts[platform]?.includes(host) && /^\/[\w.-]+$/.test(path) && !/^\/(?:home|explore|search|login|accounts|directory|videos|settings)$/i.test(path));
  } catch { return false; }
}
const Social = z.object({ platform: SocialPlatform, url: z.string().max(500) }).refine((link) => verifiedSocialUrl(link.platform, link.url), "Use a direct HTTPS creator profile URL.");
export function verifiedCreatorAvatar(value: string): boolean {
  if (/^\/(?:members|group|crew|avatars|brand)\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp|svg)$/i.test(value)) return !/(?:^|\/)\.{1,2}(?:\/|$)/.test(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    return ["static-cdn.jtvnw.net", "files.kick.com", "media.thecoreboys.com", "pbs.twimg.com", "yt3.ggpht.com", "yt3.googleusercontent.com"].includes(url.hostname)
      || [".cdninstagram.com", ".tiktokcdn.com", ".tiktokcdn-us.com"].some((suffix) => url.hostname.endsWith(suffix));
  } catch { return false; }
}
export const CreatorInput = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  name: z.string().trim().min(2).max(100),
  aliases: z.array(z.string().trim().min(3).max(100)).max(20),
  socials: z.array(Social).min(1).max(14),
  active: z.boolean().default(true),
  avatarUrl: z.string().max(2000).refine(verifiedCreatorAvatar, "Use a provider profile image or an owned image path.").optional(),
  avatarSourceProfile: z.string().max(500).refine((url) => SocialPlatform.options.some((platform) => verifiedSocialUrl(platform, url)), "Use a direct provider profile URL.").optional(),
  avatarCheckedAt: z.string().datetime({ offset: true }).optional(),
});
export type CreatorProfile = z.infer<typeof CreatorInput>;
export const Box = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0.005).max(1), height: z.number().min(0.005).max(1) })
  .refine((b) => b.x + b.width <= 1.00001 && b.y + b.height <= 1.00001, "Keep the box inside the video.");
export type CreatorBox = z.infer<typeof Box>;
export const AssetKey = z.string().regex(/^(youtube|twitch|house):[A-Za-z0-9_.:@-]{1,240}$/);
export const AnnotationInput = z.object({
  assetKey: AssetKey, creatorId: CreatorInput.shape.id,
  liveStartedAt: z.string().datetime({ offset: true }).optional(),
  startSeconds: z.number().finite().min(0).max(10_000_000),
  endSeconds: z.number().finite().min(0).max(10_000_000),
  box: Box.nullable().default(null),
  evidenceKind: z.enum(["metadata", "caption", "visible-text", "manual"]),
  evidence: z.string().trim().min(3).max(1000),
}).refine((tag) => tag.endSeconds > tag.startSeconds && tag.endSeconds - tag.startSeconds <= 3600, "Choose a time range of up to one hour.");
export type CreatorAnnotation = {
  id: string; assetKey: string; creatorId: string; startSeconds: number; endSeconds: number;
  box: CreatorBox | null; evidenceKind: string; evidence: string; status: string; current: boolean;
};
export type CreatorTagPayload = { creators: CreatorProfile[]; tags: CreatorAnnotation[]; mentions: Array<{ creatorId: string; evidence: string; kind: string }> };

export function normalizeCreatorText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Text evidence only. Ambiguous aliases are excluded; names never prove appearance. */
export function createCreatorTextMatcher(creators: readonly CreatorProfile[]) {
  const owners = new Map<string, Set<string>>();
  for (const creator of creators.filter((c) => c.active)) {
    for (const alias of [creator.name, creator.id, ...creator.aliases]) {
      const key = normalizeCreatorText(alias);
      if (key.length < 3) continue;
      const ids = owners.get(key) ?? new Set<string>();
      ids.add(creator.id); owners.set(key, ids);
    }
  }
  const aliases = new Map<string, Array<{ phrase: string; id: string }>>();
  for (const [phrase, ids] of owners) {
    if (ids.size !== 1) continue;
    const first = phrase.split(" ")[0]!;
    const entries = aliases.get(first) ?? [];
    entries.push({ phrase: ` ${phrase} `, id: [...ids][0]! }); aliases.set(first, entries);
  }
  return (text: string): CreatorProfile[] => {
    const normalized = ` ${normalizeCreatorText(text)} `;
    const matched = new Set<string>();
    for (const token of new Set(normalized.trim().split(" "))) {
      for (const entry of aliases.get(token) ?? []) if (normalized.includes(entry.phrase)) matched.add(entry.id);
    }
    return matched.size ? creators.filter((creator) => creator.active && matched.has(creator.id)) : [];
  };
}
export function matchCreatorText(text: string, creators: readonly CreatorProfile[]): CreatorProfile[] {
  return createCreatorTextMatcher(creators)(text);
}

export function activeCreatorTags(tags: readonly CreatorAnnotation[], time: number | null): CreatorAnnotation[] {
  if (time == null || !Number.isFinite(time) || time < 0) return [];
  return tags.filter((tag) => tag.status === "published" && tag.current && time >= tag.startSeconds && time < tag.endSeconds);
}

/** Twitch live watch time measures this viewer, not a frame's position in the broadcast. */
export function creatorTimelineSeconds(input: { platform: string; kind: string; seconds: number; replay?: boolean }): number | null {
  if (input.platform === "twitch" && input.kind === "live" && !input.replay) return null;
  return Number.isFinite(input.seconds) && input.seconds >= 0 ? input.seconds : null;
}

/** Normalized boxes belong to the visible video rectangle, including letterboxing. */
export function videoRectangle(container: { width: number; height: number }, source: { width: number; height: number }, fit: "contain" | "cover" = "contain") {
  if (![container.width, container.height, source.width, source.height].every((v) => Number.isFinite(v) && v > 0)) return { x: 0, y: 0, width: 1, height: 1 };
  const scale = (fit === "contain" ? Math.min : Math.max)(container.width / source.width, container.height / source.height);
  const width = source.width * scale / container.width, height = source.height * scale / container.height;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

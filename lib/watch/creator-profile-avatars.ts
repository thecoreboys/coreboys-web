import "server-only";

import { query } from "@/lib/db";
import { GROUP } from "@/lib/group";
import type { Member } from "@/lib/members";
import {
  configuredYouTubeChannelId,
  resolveYouTubeChannelId,
} from "@/lib/social-feed";
import { extractPublicTikTokProfileAvatar } from "@/lib/tiktok-public";
import { fetchUsersByLogin } from "@/lib/twitch";
import { normalizeCreatorSocialHandle } from "@/lib/watch/social-account-ref";
import { socialCredentialFor } from "@/lib/watch/social-credentials";
import {
  profileImageUrlExpiry,
  publicInstagramProfileAvatarUrl,
  publicSnapchatProfileAvatarUrl,
  publicYouTubeChannelAvatarUrl,
  safeProfileImageUrl,
} from "@/lib/watch/social-profile-image";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";

type AvatarPlatform = Exclude<WatchPlatform, "house"> | "snapchat";
type RegistryAvatarPlatform = Exclude<AvatarPlatform, "snapchat">;

/** Image URLs are keyed by the exact official social URL rendered by the UI. */
export type CreatorSocialAvatarMap = Record<string, string>;

type AvatarSource = {
  platform: AvatarPlatform;
  /** Official outbound profile URL — also the public-map key. */
  url: string;
  /** Canonical provider identity used by the cache/source registry. */
  accountRef: string;
  /** Bare public handle where the provider exposes one. */
  handle: string;
  memberSlug: string | null;
  accountLabel: string;
};

type CachedProfileImage = {
  profileImageUrl: string;
  checkedAt: number;
  expiresAt: number | null;
};

type CachedAvatarMap = {
  expiresAt: number;
  value: CreatorSocialAvatarMap;
};

type ProfileCacheRow = {
  provider: RegistryAvatarPlatform;
  account_ref: string;
  profile_image_url: string | null;
  profile_image_checked_at: string | null;
  profile_image_updated_at: string | null;
};

const MEMORY_CACHE_TTL_MS = 30 * 60 * 1_000;
const EMPTY_MEMORY_CACHE_TTL_MS = 5 * 60 * 1_000;
const PERSISTED_FRESH_MS = 6 * 60 * 60 * 1_000;
const PERSISTED_STALE_MS = 30 * 24 * 60 * 60 * 1_000;
const PROVIDER_TIMEOUT_MS = 3_500;
const YOUTUBE_AVATAR_REVALIDATE_SECONDS = 6 * 60 * 60;
const TIKTOK_AVATAR_REVALIDATE_SECONDS = 6 * 60 * 60;
const INSTAGRAM_AVATAR_REVALIDATE_SECONDS = 6 * 60 * 60;
const SNAPCHAT_AVATAR_REVALIDATE_SECONDS = 6 * 60 * 60;
const SIGNED_IMAGE_SAFETY_MS = 2 * 60 * 1_000;
const avatarCache = new Map<string, CachedAvatarMap>();
const pendingAvatarLookups = new Map<string, Promise<CreatorSocialAvatarMap>>();

function withTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((resolve) => {
      timeout = setTimeout(() => resolve(fallback), PROVIDER_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function bareHandle(value: string | undefined): string {
  return value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
}

function urlHandle(value: string): string {
  try {
    const parsed = new URL(value);
    return bareHandle(parsed.pathname.split("/").filter(Boolean)[0]);
  } catch {
    return "";
  }
}

function isAvatarPlatform(value: string): value is AvatarPlatform {
  return value === "twitch"
    || value === "youtube"
    || value === "tiktok"
    || value === "instagram"
    || value === "x"
    || value === "snapchat";
}

function isRegistryAvatarPlatform(value: AvatarPlatform): value is RegistryAvatarPlatform {
  return value !== "snapchat";
}

function socialSourceHandle(platform: AvatarPlatform, handle: string | undefined, url: string): string {
  if (platform === "tiktok" || platform === "instagram") {
    return normalizeCreatorSocialHandle(platform, handle || url);
  }
  return bareHandle(handle) || urlHandle(url);
}

function socialSources(member: Member | null): AvatarSource[] {
  const ownerSlug = member?.slug ?? null;
  const ownerLabel = member?.stageName ?? GROUP.name;
  const socials = member
    ? member.socials
    : Object.entries(GROUP.socials).map(([platform, social]) => ({
        platform,
        url: social.url,
        handle: social.handle,
      }));

  return socials.flatMap((social): AvatarSource[] => {
    if (!isAvatarPlatform(social.platform)) return [];
    const platform = social.platform;
    const handle = socialSourceHandle(platform, social.handle, social.url);
    // Twitch account identity is the canonical stream login, rather than a
    // potentially display-cased social handle. CORE does not own a group
    // Twitch profile, so it has no source here.
    const rawAccountRef = platform === "twitch" && member
      ? member.twitchLogin
      : platform === "youtube"
        ? (!member ? GROUP.socials.youtube.channelId : undefined)
          ?? configuredYouTubeChannelId(social.url)
          ?? configuredYouTubeChannelId(social.handle ?? "")
          ?? handle
        : handle;
    if (!rawAccountRef) return [];
    return [{
      platform,
      url: social.url,
      // YouTube UC ids are case-sensitive. Other account identifiers are not.
      accountRef: platform === "youtube" ? rawAccountRef : rawAccountRef.toLowerCase(),
      handle,
      memberSlug: ownerSlug,
      accountLabel: ownerLabel,
    }];
  });
}

function sourceKey(source: Pick<AvatarSource, "platform" | "accountRef">): string {
  return source.platform + ":" + source.accountRef.toLowerCase();
}

function sourceCacheKey(member: Member | null): string {
  return member?.slug ?? "core";
}

function timeFrom(value: string | null): number {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function cachedProfileImage(row: ProfileCacheRow): CachedProfileImage | null {
  const profileImageUrl = safeProfileImageUrl(row.profile_image_url);
  const checkedAt = timeFrom(row.profile_image_checked_at) || timeFrom(row.profile_image_updated_at);
  return profileImageUrl && checkedAt
    ? { profileImageUrl, checkedAt, expiresAt: profileImageUrlExpiry(profileImageUrl) }
    : null;
}

function cacheDeadline(image: CachedProfileImage): number {
  const normalRefresh = image.checkedAt + PERSISTED_FRESH_MS;
  return image.expiresAt === null
    ? normalRefresh
    : Math.min(normalRefresh, image.expiresAt - SIGNED_IMAGE_SAFETY_MS);
}

function usableCachedImage(image: CachedProfileImage, now: number): boolean {
  return image.expiresAt === null || image.expiresAt > now + SIGNED_IMAGE_SAFETY_MS;
}

function avatarMapTtl(value: CreatorSocialAvatarMap): number {
  let ttl = MEMORY_CACHE_TTL_MS;
  const now = Date.now();
  for (const url of Object.values(value)) {
    const expiry = profileImageUrlExpiry(url);
    if (expiry !== null) ttl = Math.min(ttl, Math.max(0, expiry - now - SIGNED_IMAGE_SAFETY_MS));
  }
  // Avoid a tight retry loop if an upstream CDN hands us an imminently
  // expiring image; the durable resolver will refresh it on the next minute.
  return Math.max(60_000, ttl);
}

/**
 * Read the same durable account registry used by social event ingestion.
 * It is intentionally best-effort: a database outage must leave public
 * channel pages usable, and the in-process cache still coalesces requests.
 */
async function readPersistedProfileImages(
  sources: readonly AvatarSource[],
): Promise<Map<string, CachedProfileImage>> {
  if (!process.env.DATABASE_URL?.trim()) return new Map();
  const registrySources = sources.filter((source) => isRegistryAvatarPlatform(source.platform));
  if (!registrySources.length) return new Map();
  try {
    const providers = [...new Set(registrySources.map((source) => source.platform))];
    const accountRefs = [...new Set(registrySources.map((source) => source.accountRef.toLowerCase()))];
    const result = await withTimeout(
      query<ProfileCacheRow>(
        `SELECT provider::text, account_ref, profile_image_url,
                profile_image_checked_at::text, profile_image_updated_at::text
           FROM social_source_registry
          WHERE provider::text = ANY($1::text[])
            AND lower(account_ref) = ANY($2::text[])
            AND profile_image_url IS NOT NULL`,
        [providers, accountRefs],
      ),
      { rows: [] } as unknown as Awaited<ReturnType<typeof query<ProfileCacheRow>>>,
    );
    const entries = new Map<string, CachedProfileImage>();
    for (const row of result.rows) {
      if (!isRegistryAvatarPlatform(row.provider)) continue;
      const image = cachedProfileImage(row);
      if (image) entries.set(row.provider + ":" + row.account_ref.toLowerCase(), image);
    }
    return entries;
  } catch {
    return new Map();
  }
}

/** Persist only verified official provider URLs; tokens never leave this module. */
async function writePersistedProfileImages(
  sources: readonly AvatarSource[],
  images: ReadonlyMap<string, string>,
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim() || !images.size) return;
  await Promise.all(sources.flatMap((source) => {
    if (!isRegistryAvatarPlatform(source.platform)) return [];
    const profileImageUrl = images.get(sourceKey(source));
    if (!profileImageUrl) return [];
    return [query(
      `INSERT INTO social_source_registry
         (provider, account_ref, member_slug, account_label, profile_image_url, profile_image_updated_at, profile_image_checked_at)
       VALUES ($1,$2,$3,$4,$5,now(),now())
       ON CONFLICT (provider, account_ref) DO UPDATE SET
         member_slug=COALESCE(EXCLUDED.member_slug, social_source_registry.member_slug),
         account_label=COALESCE(EXCLUDED.account_label, social_source_registry.account_label),
         profile_image_url=EXCLUDED.profile_image_url,
         profile_image_updated_at=now(),
         profile_image_checked_at=now(),
         updated_at=now()`,
      [source.platform, source.accountRef, source.memberSlug, source.accountLabel, profileImageUrl],
    ).catch(() => undefined)];
  }));
}

function thumbnailUrl(thumbnails: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } | undefined): string | null {
  return safeProfileImageUrl(thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url);
}

async function publicYouTubeAvatar(channelId: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.youtube.com/channel/" + encodeURIComponent(channelId), {
      next: { revalidate: YOUTUBE_AVATAR_REVALIDATE_SECONDS },
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return null;
    return publicYouTubeChannelAvatarUrl(await response.text());
  } catch {
    return null;
  }
}

async function youtubeAvatars(sources: readonly AvatarSource[]): Promise<Map<string, string>> {
  const resolved = await Promise.all(sources.map(async (source) => ({
    source,
    channelId: configuredYouTubeChannelId(source.accountRef)
      ?? await resolveYouTubeChannelId(source.accountRef),
  })));
  const channelSources = resolved.filter((entry): entry is { source: AvatarSource; channelId: string } => Boolean(entry.channelId));
  if (!channelSources.length) return new Map();

  const result = new Map<string, string>();
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("id", [...new Set(channelSources.map((entry) => entry.channelId))].join(","));
      url.searchParams.set("key", apiKey);
      const response = await fetch(url, { next: { revalidate: YOUTUBE_AVATAR_REVALIDATE_SECONDS } });
      if (response.ok) {
        const payload = await response.json() as {
          items?: Array<{ id?: string; snippet?: { thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } } }>;
        };
        const byId = new Map((payload.items ?? []).flatMap((item) => {
          const avatar = item.id ? thumbnailUrl(item.snippet?.thumbnails) : null;
          return item.id && avatar ? [[item.id, avatar] as const] : [];
        }));
        for (const entry of channelSources) {
          const avatar = byId.get(entry.channelId);
          if (avatar) result.set(sourceKey(entry.source), avatar);
        }
      }
    } catch {
      // The public, cacheable channel metadata fallback below still handles a
      // deployment without a YouTube key.
    }
  }

  await Promise.all(channelSources.map(async (entry) => {
    if (result.has(sourceKey(entry.source))) return;
    const avatar = await publicYouTubeAvatar(entry.channelId);
    if (avatar) result.set(sourceKey(entry.source), avatar);
  }));
  return result;
}

function exactProviderHandle(expected: string, received: unknown): boolean {
  return typeof received === "string" && bareHandle(received) === expected;
}

async function tikTokAvatar(source: AvatarSource): Promise<string | null> {
  if (!source.handle) return null;
  const credential = await socialCredentialFor("tiktok", source.handle);
  if (credential) {
    try {
      const response = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=avatar_url,username",
        { headers: { Authorization: "Bearer " + credential.accessToken }, cache: "no-store" },
      );
      if (response.ok) {
        const payload = await response.json() as { data?: { user?: { avatar_url?: string; username?: string } } };
        const user = payload.data?.user;
        // Fail closed if the configured token is for a different account. A
        // platform mark is better than accidentally showing another creator.
        if (exactProviderHandle(source.handle, user?.username)) {
          const avatar = safeProfileImageUrl(user?.avatar_url);
          if (avatar) return avatar;
        }
      }
    } catch {
      // The public metadata fallback below is intentionally bounded and does
      // not use viewer/browser credentials.
    }
  }

  try {
    const response = await fetch("https://www.tiktok.com/@" + encodeURIComponent(source.handle), {
      next: { revalidate: TIKTOK_AVATAR_REVALIDATE_SECONDS },
      // Keep this aligned with the public TikTok feed request. The default
      // undici user agent commonly receives a client-only/anti-bot shell,
      // which contains no attributable profile metadata to cache.
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; COREMediaBot/1.0; +https://thecoreboys.com)",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    return extractPublicTikTokProfileAvatar(await response.text(), source.handle)?.avatarUrl ?? null;
  } catch {
    return null;
  }
}

type InstagramProfile = {
  username?: string;
  profile_picture_url?: string;
  instagram_business_account?: InstagramProfile;
};

function instagramApiVersion(): string {
  const requested = process.env.META_GRAPH_API_VERSION?.trim() ?? "v22.0";
  return /^v\d+\.\d+$/.test(requested) ? requested : "v22.0";
}

async function publicInstagramAvatar(handle: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.instagram.com/" + encodeURIComponent(handle) + "/", {
      next: { revalidate: INSTAGRAM_AVATAR_REVALIDATE_SECONDS },
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; COREMediaBot/1.0; +https://thecoreboys.com)",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    const landed = new URL(response.url);
    const landedHandle = bareHandle(landed.pathname.split("/").filter(Boolean)[0]);
    if (landedHandle !== bareHandle(handle)) return null;
    return publicInstagramProfileAvatarUrl(await response.text(), handle);
  } catch {
    return null;
  }
}

async function instagramAvatar(source: AvatarSource): Promise<string | null> {
  if (!source.handle) return null;
  const credential = await socialCredentialFor("instagram", source.handle);
  if (credential) {
    try {
      const version = instagramApiVersion();
      const facebookMode = credential.instagramApi === "facebook";
      const account = facebookMode && credential.providerUserId
        ? encodeURIComponent(credential.providerUserId)
        : "me";
      const url = new URL(
        facebookMode
          ? "https://graph.facebook.com/" + version + "/" + account
          : "https://graph.instagram.com/" + version + "/" + account,
      );
      url.searchParams.set(
        "fields",
        facebookMode && account === "me"
          ? "id,username,profile_picture_url,instagram_business_account{id,username,profile_picture_url}"
          : "id,username,profile_picture_url",
      );
      url.searchParams.set("access_token", credential.accessToken);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as InstagramProfile;
        const profile = payload.instagram_business_account ?? payload;
        if (exactProviderHandle(source.handle, profile.username)) {
          const avatar = safeProfileImageUrl(profile.profile_picture_url);
          if (avatar) return avatar;
        }
      }
    } catch {
      // Public profile metadata remains a bounded fallback when a creator
      // connection has expired or is temporarily unavailable.
    }
  }
  return publicInstagramAvatar(source.handle);
}

async function snapchatAvatar(source: AvatarSource): Promise<string | null> {
  if (!source.handle) return null;
  try {
    const response = await fetch("https://www.snapchat.com/@" + encodeURIComponent(source.handle), {
      next: { revalidate: SNAPCHAT_AVATAR_REVALIDATE_SECONDS },
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; COREMediaBot/1.0; +https://thecoreboys.com)",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    const landed = new URL(response.url);
    const landedHandle = bareHandle(landed.pathname.split("/").filter(Boolean)[0]);
    if (landed.hostname.toLowerCase() !== "www.snapchat.com" || landedHandle !== bareHandle(source.handle)) {
      return null;
    }
    return publicSnapchatProfileAvatarUrl(await response.text());
  } catch {
    return null;
  }
}

function xAvatars(sources: readonly AvatarSource[], items: readonly WatchItem[]): Map<string, string> {
  const sourceByHandle = new Map(
    sources.filter((source) => source.handle).map((source) => [source.handle, source]),
  );
  const avatars = new Map<string, string>();
  for (const item of items) {
    if (item.platform !== "x") continue;
    const handle = bareHandle(item.x?.authorHandle) || urlHandle(item.x?.authorProfileUrl ?? item.sourceUrl ?? "");
    const source = sourceByHandle.get(handle);
    const avatar = safeProfileImageUrl(item.x?.authorAvatarUrl);
    if (source && avatar && !avatars.has(sourceKey(source))) avatars.set(sourceKey(source), avatar);
  }
  return avatars;
}

function mapBySocialUrl(sources: readonly AvatarSource[], images: ReadonlyMap<string, string>): CreatorSocialAvatarMap {
  const result: CreatorSocialAvatarMap = {};
  for (const source of sources) {
    const profileImageUrl = images.get(sourceKey(source));
    if (profileImageUrl) result[source.url] = profileImageUrl;
  }
  return result;
}

async function resolveCreatorSocialAvatarMap(
  member: Member | null,
  items: readonly WatchItem[],
): Promise<CreatorSocialAvatarMap> {
  const sources = socialSources(member);
  if (!sources.length) return {};

  const persisted = await readPersistedProfileImages(sources);
  const now = Date.now();
  const fresh = new Map<string, string>();
  const stale = new Map<string, string>();
  for (const source of sources) {
    const cached = persisted.get(sourceKey(source));
    if (!cached || !usableCachedImage(cached, now) || now - cached.checkedAt > PERSISTED_STALE_MS) continue;
    if (now <= cacheDeadline(cached)) fresh.set(sourceKey(source), cached.profileImageUrl);
    else stale.set(sourceKey(source), cached.profileImageUrl);
  }

  const needsProvider = (platform: AvatarPlatform) => sources.filter((source) => (
    source.platform === platform && !fresh.has(sourceKey(source))
  ));
  const [twitchUsers, youtube, tiktok, instagram, snapchat] = await Promise.all([
    (() => {
      const twitch = needsProvider("twitch");
      if (!twitch.length) return Promise.resolve({} as Awaited<ReturnType<typeof fetchUsersByLogin>>);
      return withTimeout(
        fetchUsersByLogin(twitch.map((source) => source.accountRef)).catch(() => ({})),
        {} as Awaited<ReturnType<typeof fetchUsersByLogin>>,
      );
    })(),
    youtubeAvatars(needsProvider("youtube")),
    Promise.all(needsProvider("tiktok").map(async (source) => [sourceKey(source), await tikTokAvatar(source)] as const)),
    Promise.all(needsProvider("instagram").map(async (source) => [sourceKey(source), await instagramAvatar(source)] as const)),
    Promise.all(needsProvider("snapchat").map(async (source) => [sourceKey(source), await snapchatAvatar(source)] as const)),
  ]);

  const resolved = new Map(fresh);
  const newImages = new Map<string, string>();
  for (const source of needsProvider("twitch")) {
    const avatar = safeProfileImageUrl(
      (twitchUsers as Awaited<ReturnType<typeof fetchUsersByLogin>>)[source.accountRef]?.profile_image_url,
    );
    if (avatar) newImages.set(sourceKey(source), avatar);
  }
  for (const [key, avatar] of youtube) if (avatar) newImages.set(key, avatar);
  for (const [key, avatar] of tiktok) if (avatar) newImages.set(key, avatar);
  for (const [key, avatar] of instagram) if (avatar) newImages.set(key, avatar);
  for (const [key, avatar] of snapchat) if (avatar) newImages.set(key, avatar);
  // X's protected server snapshot already includes the authoritative user
  // profile image. It is a local read, so it can refresh an avatar without a
  // per-viewer X request.
  for (const [key, avatar] of xAvatars(sources.filter((source) => source.platform === "x"), items)) {
    newImages.set(key, avatar);
  }

  for (const [key, avatar] of newImages) resolved.set(key, avatar);
  // An old verified profile is still preferable to a generic creator photo
  // during a temporary provider/API outage. It remains bounded to 30 days.
  for (const [key, avatar] of stale) if (!resolved.has(key)) resolved.set(key, avatar);

  await writePersistedProfileImages(sources, newImages);
  return mapBySocialUrl(sources, resolved);
}

/**
 * Resolves every official profile image server-side, keyed by the outbound
 * social URL. This includes the CORE group account (member === null).
 * Tokens and provider identifiers stay server-side; unsupported public
 * providers (currently Snapchat) intentionally return no image so the UI can
 * show a platform mark instead of a misleading duplicate portrait.
 */
export async function getCreatorSocialAvatarMap(
  member: Member | null,
  items: readonly WatchItem[],
): Promise<CreatorSocialAvatarMap> {
  const key = sourceCacheKey(member);
  const cached = avatarCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingAvatarLookups.get(key);
  if (pending) return pending;

  const lookup = resolveCreatorSocialAvatarMap(member, items)
    .then((value) => {
      avatarCache.set(key, {
        value,
        expiresAt: Date.now() + (Object.keys(value).length ? avatarMapTtl(value) : EMPTY_MEMORY_CACHE_TTL_MS),
      });
      return value;
    })
    .catch(() => {
      const fallback = cached?.value ?? {};
      avatarCache.set(key, {
        value: fallback,
        expiresAt: Date.now() + EMPTY_MEMORY_CACHE_TTL_MS,
      });
      return fallback;
    })
    .finally(() => {
      pendingAvatarLookups.delete(key);
    });
  pendingAvatarLookups.set(key, lookup);
  return lookup;
}

import "server-only";
import { query, withTransaction } from "@/lib/db";
import {
  fetchInstagramFeed,
  fetchTikTokFeed,
  fetchXFeed,
  fetchYouTubeFeedByRef,
} from "@/lib/social-feed";
import { instagramEmbedUrl } from "@/lib/watch/playable";
import type { FeedItem } from "@/components/feed/types";
import type { NetworkChannelMode, NetworkChannelSlug } from "./channels";

export type ProgrammingPlatform = "youtube" | "tiktok" | "instagram" | "x";
/** Providers that can be curated as one public, playable post. */
/** Publicly curatable media works without a creator API grant. */
export type ProgrammingItemPlatform = "youtube" | "tiktok" | "instagram";
export type ProgrammingRouteMode = Extract<NetworkChannelMode, "videos" | "shorts" | "continuous">;

export type ProgrammingRoute = {
  networkSlug: NetworkChannelSlug;
  channelMode: ProgrammingRouteMode;
};

export type ProgrammingSource = {
  id: string;
  name: string;
  platform: ProgrammingPlatform;
  sourceRef: string;
  sourceUrl: string | null;
  enabled: boolean;
  routes: ProgrammingRoute[];
  sectionIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProgrammingItem = {
  id: string;
  sourceId: string | null;
  platform: ProgrammingItemPlatform;
  externalId: string;
  sourceUrl: string;
  title: string;
  subtitle: string | null;
  posterUrl: string | null;
  format: "auto" | "long" | "short";
  enabled: boolean;
  heroFeatured: boolean;
  heroPriority: number;
  publishedAt: string | null;
  sectionIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProgrammingSection = {
  id: string;
  slug: string;
  title: string;
  kicker: string | null;
  /** `auto` chooses a vertical rail when the attached mix is primarily short-form. */
  layout: "standard" | "vertical" | "auto";
  enabled: boolean;
  sortOrder: number;
  sourceIds: string[];
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WatchProgrammingSnapshot = {
  sources: ProgrammingSource[];
  items: ProgrammingItem[];
  sections: ProgrammingSection[];
};

export type ProgrammingFeedEntry = {
  feed: FeedItem;
  sourceId: string | null;
  curatedItemId: string | null;
};

export const EMPTY_WATCH_PROGRAMMING: WatchProgrammingSnapshot = {
  sources: [],
  items: [],
  sections: [],
};

function curatedFeedItem(item: ProgrammingItem): FeedItem {
  const isTikTok = item.platform === "tiktok";
  const isInstagram = item.platform === "instagram";
  const instagramPhoto = isInstagram && /instagram\.com\/(?:[^/?#]+\/)?p\//i.test(item.sourceUrl);
  const short = isTikTok || (isInstagram && !instagramPhoto) || item.format === "short" || /\/shorts\//i.test(item.sourceUrl);
  return {
    id: isTikTok ? `tt-${item.externalId}` : isInstagram ? `ig-${item.externalId}` : `yt-${item.externalId}`,
    platform: item.platform,
    url: item.sourceUrl,
    sourceUrl: item.sourceUrl,
    // TikTok and Instagram retain their provider-native public embeds. These
    // are intentionally distinct from the creator-authorized feed sync.
    embedUrl: isTikTok
      ? `https://www.tiktok.com/player/v1/${item.externalId}`
      : isInstagram
        ? instagramEmbedUrl(item.sourceUrl) ?? undefined
        : `https://www.youtube-nocookie.com/embed/${item.externalId}`,
    title: item.title,
    publishedAt: item.publishedAt ?? item.createdAt,
    authorSlug: null,
    authorLabel: item.subtitle ?? "Community pick",
    thumbnailUrl: item.posterUrl ?? (item.platform === "youtube" ? `https://i.ytimg.com/vi/${item.externalId}/maxresdefault.jpg` : undefined),
    mediaType: instagramPhoto ? "image" : "video",
    format: instagramPhoto ? "photo" : short ? "short" : item.format === "long" ? "long" : undefined,
    orientation: instagramPhoto ? "square" : short ? "portrait" : "landscape",
    previewStrategy: isTikTok || isInstagram ? "embed" : "animated",
    embeddable: true,
  };
}

/** Fetch the latest window for every enabled admin source plus explicit picks. */
export async function getProgrammingFeedEntries(
  snapshot: WatchProgrammingSnapshot,
  perSourceLimit = 24,
): Promise<ProgrammingFeedEntry[]> {
  const sourceEntries = await Promise.all(
    snapshot.sources.filter((source) => source.enabled).map(async (source) => {
      const items = source.platform === "youtube"
        ? await fetchYouTubeFeedByRef(source.sourceRef, null, source.name, perSourceLimit)
        : source.platform === "tiktok"
          ? await fetchTikTokFeed(source.sourceRef, null, source.name, perSourceLimit)
          : source.platform === "instagram"
            ? await fetchInstagramFeed(source.sourceRef, null, source.name, perSourceLimit)
            : await fetchXFeed(source.sourceRef, null, source.name, perSourceLimit);
      return items.map((feed): ProgrammingFeedEntry => ({
        feed,
        sourceId: source.id,
        curatedItemId: null,
      }));
    }),
  );
  const curated = snapshot.items.filter((item) => item.enabled).map((item): ProgrammingFeedEntry => ({
    feed: curatedFeedItem(item),
    sourceId: item.sourceId,
    curatedItemId: item.id,
  }));
  return [...sourceEntries.flat(), ...curated];
}

let schemaReady: Promise<void> | null = null;

/** Additive and idempotent; admin routes call this before editing. */
export function ensureWatchProgrammingSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = query(`
    CREATE TABLE IF NOT EXISTS watch_community_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      platform TEXT NOT NULL CHECK (platform IN ('youtube','tiktok','instagram','x')),
      source_ref TEXT NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 500),
      source_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (platform, source_ref)
    );
    CREATE TABLE IF NOT EXISTS watch_community_source_routes (
      source_id UUID NOT NULL REFERENCES watch_community_sources(id) ON DELETE CASCADE,
      network_slug TEXT NOT NULL CHECK (network_slug IN ('core','adapt','ron','lacy','marlon','jason','silky')),
      channel_mode TEXT NOT NULL CHECK (channel_mode IN ('videos','shorts','continuous')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_id, network_slug, channel_mode)
    );
    CREATE TABLE IF NOT EXISTS watch_curated_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID REFERENCES watch_community_sources(id) ON DELETE SET NULL,
      platform TEXT NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube','tiktok','instagram')),
      external_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      poster_url TEXT,
      format TEXT NOT NULL DEFAULT 'auto' CHECK (format IN ('auto','long','short')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      hero_featured BOOLEAN NOT NULL DEFAULT FALSE,
      hero_priority INTEGER NOT NULL DEFAULT 100,
      published_at TIMESTAMPTZ,
      created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (platform, external_id)
    );
    CREATE TABLE IF NOT EXISTS watch_home_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
      kicker TEXT,
      layout TEXT NOT NULL DEFAULT 'standard' CHECK (layout IN ('standard','vertical','auto')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS watch_home_section_sources (
      section_id UUID NOT NULL REFERENCES watch_home_sections(id) ON DELETE CASCADE,
      source_id UUID NOT NULL REFERENCES watch_community_sources(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      PRIMARY KEY (section_id, source_id)
    );
    CREATE TABLE IF NOT EXISTS watch_home_section_items (
      section_id UUID NOT NULL REFERENCES watch_home_sections(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES watch_curated_items(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      PRIMARY KEY (section_id, item_id)
    );
    -- Older installations created the section constraint before automatic
    -- layout was available. Rebuild that named, column-level constraint
    -- additively so existing programming stays intact.
    ALTER TABLE watch_home_sections DROP CONSTRAINT IF EXISTS watch_home_sections_layout_check;
    ALTER TABLE watch_home_sections
      ADD CONSTRAINT watch_home_sections_layout_check
      CHECK (layout IN ('standard','vertical','auto'));
    -- Public TikTok and Instagram post embeds do not require creator OAuth.
    -- This remains a deliberate manual-curation fallback; automatic source
    -- polling still requires each creator's authorization.
    ALTER TABLE watch_curated_items DROP CONSTRAINT IF EXISTS watch_curated_items_platform_check;
    ALTER TABLE watch_curated_items
      ADD CONSTRAINT watch_curated_items_platform_check
      CHECK (platform IN ('youtube','tiktok','instagram'));
  `).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

type SourceRow = {
  id: string; name: string; platform: ProgrammingPlatform; source_ref: string;
  source_url: string | null; enabled: boolean; routes: string[]; section_ids: string[];
  created_at: string; updated_at: string;
};
type ItemRow = {
  id: string; source_id: string | null; platform: ProgrammingItemPlatform; external_id: string;
  source_url: string; title: string; subtitle: string | null; poster_url: string | null;
  format: "auto" | "long" | "short"; enabled: boolean; hero_featured: boolean;
  hero_priority: number; published_at: string | null; section_ids: string[];
  created_at: string; updated_at: string;
};
type SectionRow = {
  id: string; slug: string; title: string; kicker: string | null;
  layout: "standard" | "vertical" | "auto"; enabled: boolean; sort_order: number;
  source_ids: string[]; item_ids: string[]; created_at: string; updated_at: string;
};

function parseRoutes(values: readonly string[]): ProgrammingRoute[] {
  return values.flatMap((value) => {
    const [networkSlug, channelMode] = value.split(":");
    if (!networkSlug || !channelMode) return [];
    return [{ networkSlug, channelMode } as ProgrammingRoute];
  });
}

export async function getWatchProgrammingSnapshot(options: { ensure?: boolean } = {}): Promise<WatchProgrammingSnapshot> {
  if (options.ensure) await ensureWatchProgrammingSchema();
  try {
    const [sources, items, sections] = await Promise.all([
      query<SourceRow>(`
        SELECT s.id::text, s.name, s.platform, s.source_ref, s.source_url, s.enabled,
          ARRAY(SELECT r.network_slug || ':' || r.channel_mode
                  FROM watch_community_source_routes r
                 WHERE r.source_id = s.id AND r.enabled
                 ORDER BY r.network_slug, r.channel_mode) AS routes,
          ARRAY(SELECT h.section_id::text FROM watch_home_section_sources h
                 WHERE h.source_id = s.id ORDER BY h.sort_order, h.section_id) AS section_ids,
          s.created_at::text, s.updated_at::text
        FROM watch_community_sources s ORDER BY s.created_at DESC`),
      query<ItemRow>(`
        SELECT i.id::text, i.source_id::text, i.platform, i.external_id, i.source_url,
          i.title, i.subtitle, i.poster_url, i.format, i.enabled, i.hero_featured,
          i.hero_priority, i.published_at::text,
          ARRAY(SELECT h.section_id::text FROM watch_home_section_items h
                 WHERE h.item_id = i.id ORDER BY h.sort_order, h.section_id) AS section_ids,
          i.created_at::text, i.updated_at::text
        FROM watch_curated_items i ORDER BY i.hero_priority, i.created_at DESC`),
      query<SectionRow>(`
        SELECT s.id::text, s.slug, s.title, s.kicker, s.layout, s.enabled, s.sort_order,
          ARRAY(SELECT h.source_id::text FROM watch_home_section_sources h
                 WHERE h.section_id = s.id ORDER BY h.sort_order, h.source_id) AS source_ids,
          ARRAY(SELECT h.item_id::text FROM watch_home_section_items h
                 WHERE h.section_id = s.id ORDER BY h.sort_order, h.item_id) AS item_ids,
          s.created_at::text, s.updated_at::text
        FROM watch_home_sections s ORDER BY s.sort_order, s.created_at`),
    ]);
    return {
      sources: sources.rows.map((row) => ({
        id: row.id, name: row.name, platform: row.platform, sourceRef: row.source_ref,
        sourceUrl: row.source_url, enabled: row.enabled, routes: parseRoutes(row.routes ?? []),
        sectionIds: row.section_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      items: items.rows.map((row) => ({
        id: row.id, sourceId: row.source_id, platform: row.platform, externalId: row.external_id,
        sourceUrl: row.source_url, title: row.title, subtitle: row.subtitle, posterUrl: row.poster_url,
        format: row.format, enabled: row.enabled, heroFeatured: row.hero_featured,
        heroPriority: row.hero_priority, publishedAt: row.published_at,
        sectionIds: row.section_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      sections: sections.rows.map((row) => ({
        id: row.id, slug: row.slug, title: row.title, kicker: row.kicker, layout: row.layout,
        enabled: row.enabled, sortOrder: row.sort_order, sourceIds: row.source_ids ?? [],
        itemIds: row.item_ids ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
      })),
    };
  } catch (error) {
    if (!options.ensure && typeof error === "object" && error && "code" in error && error.code === "42P01") {
      return EMPTY_WATCH_PROGRAMMING;
    }
    throw error;
  }
}

async function replaceSourceRelations(id: string, routes: readonly ProgrammingRoute[], sectionIds: readonly string[]) {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM watch_community_source_routes WHERE source_id = $1", [id]);
    for (const route of routes) {
      await client.query(
        `INSERT INTO watch_community_source_routes (source_id, network_slug, channel_mode)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [id, route.networkSlug, route.channelMode],
      );
    }
    await client.query("DELETE FROM watch_home_section_sources WHERE source_id = $1", [id]);
    for (const [index, sectionId] of sectionIds.entries()) {
      await client.query(
        `INSERT INTO watch_home_section_sources (section_id, source_id, sort_order)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [sectionId, id, index],
      );
    }
  });
}

export async function createProgrammingSource(input: {
  name: string; platform: ProgrammingPlatform; sourceRef: string; sourceUrl?: string | null;
  enabled: boolean; routes: ProgrammingRoute[]; sectionIds: string[]; createdBy: string;
}): Promise<string> {
  await ensureWatchProgrammingSchema();
  const result = await query<{ id: string }>(`
    INSERT INTO watch_community_sources (name, platform, source_ref, source_url, enabled, created_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
    [input.name, input.platform, input.sourceRef, input.sourceUrl ?? null, input.enabled, input.createdBy],
  );
  const id = result.rows[0]!.id;
  await replaceSourceRelations(id, input.routes, input.sectionIds);
  return id;
}

export async function updateProgrammingSource(id: string, input: {
  name: string; platform: ProgrammingPlatform; sourceRef: string; sourceUrl?: string | null;
  enabled: boolean; routes: ProgrammingRoute[]; sectionIds: string[];
}): Promise<void> {
  await ensureWatchProgrammingSchema();
  await query(`UPDATE watch_community_sources SET name=$2, platform=$3, source_ref=$4,
    source_url=$5, enabled=$6, updated_at=NOW() WHERE id=$1`,
  [id, input.name, input.platform, input.sourceRef, input.sourceUrl ?? null, input.enabled]);
  await replaceSourceRelations(id, input.routes, input.sectionIds);
}

export async function createProgrammingItem(input: {
  sourceId?: string | null; platform: ProgrammingItemPlatform; externalId: string; sourceUrl: string; title: string;
  subtitle?: string | null; posterUrl?: string | null; format: "auto" | "long" | "short";
  enabled: boolean; heroFeatured: boolean; heroPriority: number; sectionIds: string[]; createdBy: string;
}): Promise<string> {
  await ensureWatchProgrammingSchema();
  const result = await query<{ id: string }>(`
    INSERT INTO watch_curated_items
      (source_id, platform, external_id, source_url, title, subtitle, poster_url, format,
       enabled, hero_featured, hero_priority, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (platform, external_id) DO UPDATE SET
      source_id=EXCLUDED.source_id, source_url=EXCLUDED.source_url, title=EXCLUDED.title,
      subtitle=EXCLUDED.subtitle, poster_url=EXCLUDED.poster_url, format=EXCLUDED.format,
      enabled=EXCLUDED.enabled, hero_featured=EXCLUDED.hero_featured,
      hero_priority=EXCLUDED.hero_priority, updated_at=NOW()
    RETURNING id::text`,
    [input.sourceId ?? null, input.platform, input.externalId, input.sourceUrl, input.title, input.subtitle ?? null,
      input.posterUrl ?? null, input.format, input.enabled, input.heroFeatured,
      input.heroPriority, input.createdBy],
  );
  const id = result.rows[0]!.id;
  await replaceItemSections(id, input.sectionIds);
  return id;
}

async function replaceItemSections(id: string, sectionIds: readonly string[]) {
  await query("DELETE FROM watch_home_section_items WHERE item_id=$1", [id]);
  for (const [index, sectionId] of sectionIds.entries()) {
    await query(`INSERT INTO watch_home_section_items (section_id,item_id,sort_order)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [sectionId, id, index]);
  }
}

export async function updateProgrammingItem(id: string, input: {
  sourceId?: string | null; title: string; subtitle?: string | null; posterUrl?: string | null;
  format: "auto" | "long" | "short"; enabled: boolean; heroFeatured: boolean;
  heroPriority: number; sectionIds: string[];
}): Promise<void> {
  await ensureWatchProgrammingSchema();
  await query(`UPDATE watch_curated_items SET source_id=$2, title=$3, subtitle=$4,
    poster_url=$5, format=$6, enabled=$7, hero_featured=$8, hero_priority=$9,
    updated_at=NOW() WHERE id=$1`,
  [id, input.sourceId ?? null, input.title, input.subtitle ?? null, input.posterUrl ?? null,
    input.format, input.enabled, input.heroFeatured, input.heroPriority]);
  await replaceItemSections(id, input.sectionIds);
}

export async function createProgrammingSection(input: {
  slug: string; title: string; kicker?: string | null; layout: "standard" | "vertical" | "auto";
  enabled: boolean; sortOrder: number; createdBy: string;
}): Promise<string> {
  await ensureWatchProgrammingSchema();
  const result = await query<{ id: string }>(`
    INSERT INTO watch_home_sections (slug,title,kicker,layout,enabled,sort_order,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
    [input.slug, input.title, input.kicker ?? null, input.layout, input.enabled, input.sortOrder, input.createdBy],
  );
  return result.rows[0]!.id;
}

export async function updateProgrammingSection(id: string, input: {
  slug: string; title: string; kicker?: string | null; layout: "standard" | "vertical" | "auto";
  enabled: boolean; sortOrder: number;
}): Promise<void> {
  await ensureWatchProgrammingSchema();
  await query(`UPDATE watch_home_sections SET slug=$2,title=$3,kicker=$4,layout=$5,
    enabled=$6,sort_order=$7,updated_at=NOW() WHERE id=$1`,
  [id, input.slug, input.title, input.kicker ?? null, input.layout, input.enabled, input.sortOrder]);
}

export async function deleteProgrammingEntity(entity: "source" | "item" | "section", id: string) {
  await ensureWatchProgrammingSchema();
  const table = entity === "source" ? "watch_community_sources"
    : entity === "item" ? "watch_curated_items" : "watch_home_sections";
  await query(`DELETE FROM ${table} WHERE id=$1`, [id]);
}

export function youtubeVideoIdFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    return url.searchParams.get("v")
      ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/)?.[1]
      ?? null;
  } catch {
    return null;
  }
}

/** Public TikTok post ids are enough for the official player embed. */
export function tiktokVideoIdFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;
    return url.pathname.match(/^\/@[^/]+\/video\/(\d+)/i)?.[1]
      ?? url.pathname.match(/^\/(?:player\/v1|embed\/v2)\/(\d+)/i)?.[1]
      ?? null;
  } catch {
    return null;
  }
}

/** A canonical Instagram post or Reel shortcode, safe for the official embed. */
export function instagramPostIdFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return null;
    return url.pathname.match(/^\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

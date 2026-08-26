import "server-only";

import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import {
  normalizePassportPrivacy,
  publicSectionAllowed,
} from "@/lib/passport/policy";
import {
  passportIdentityAccent,
  type PassportChatIdentity,
} from "@/lib/passport/chat-identity";
import { resolveNetworkChannel } from "@/lib/watch/channels";

type BaseRow = {
  login: string;
  user_id: string;
  active_loadout_scope: string;
  showcase_card_ids: string[];
  showcase_achievement_codes: string[];
  privacy: Record<string, unknown>;
};

type LoadoutRow = {
  user_id: string;
  scope: string;
  title_code: string | null;
  nameplate_code: string | null;
  frame_code: string | null;
  theme_code: string | null;
  reaction_codes: string[];
  featured_card_id: string | null;
  badge_codes: string[];
};

type CosmeticRow = {
  user_id: string;
  code: string;
  kind: string;
  channel_slug: string | null;
  name: string;
  asset: Record<string, unknown>;
};

type BadgeRow = {
  user_id: string;
  code: string;
  name: string;
  tier: string;
  channel_slug: string | null;
};

type CardRow = {
  user_id: string;
  id: string;
  name: string;
  artwork_url: string | null;
  rarity: string;
  serial_number: number | null;
  channel_slug: string;
};

const key = (userId: string, value: string) => `${userId}:${value}`;

/** Resolve only privacy-safe, currently equipped Passport identity for Twitch chat. */
export async function getPassportChatIdentities(input: {
  logins: string[];
  viewerUserId: string | null;
  channelSlug?: string | null;
}): Promise<Record<string, PassportChatIdentity>> {
  const logins = [...new Set(input.logins.map((login) => login.trim().toLowerCase()))]
    .filter((login) => /^[a-z0-9_]{1,25}$/.test(login))
    .slice(0, 40);
  if (logins.length === 0) return {};
  await ensureFanOauthSchema();

  const base = await query<BaseRow>(
    `SELECT lower(c.provider_username) AS login,c.user_id,p.active_loadout_scope,
            p.showcase_card_ids::text[],p.showcase_achievement_codes,p.privacy
       FROM fan_oauth_connections c
       JOIN fan_users u ON u.id=c.user_id AND u.public_card=true
       JOIN passport_profiles p ON p.user_id=c.user_id
      WHERE c.provider='twitch' AND c.status='active'
        AND lower(c.provider_username)=ANY($1::text[])`,
    [logins],
  );
  const visible = base.rows.map((row) => {
    const privacy = normalizePassportPrivacy(row.privacy);
    const owner = input.viewerUserId === row.user_id;
    const signedIn = input.viewerUserId !== null;
    if (!publicSectionAllowed(privacy.profile, signedIn, owner)) return null;
    return {
      ...row,
      channelsAllowed: publicSectionAllowed(privacy.channelAffinity, signedIn, owner),
      inventoryAllowed: publicSectionAllowed(privacy.inventory, signedIn, owner),
      activityAllowed: publicSectionAllowed(privacy.activity, signedIn, owner),
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
  if (visible.length === 0) return {};
  const userIds = visible.map((row) => row.user_id);

  const loadouts = await query<LoadoutRow>(
    `SELECT user_id,scope,title_code,nameplate_code,frame_code,theme_code,
            reaction_codes,featured_card_id::text,badge_codes
       FROM passport_loadouts WHERE user_id=ANY($1::text[])`,
    [userIds],
  );
  const loadoutsByUser = new Map<string, LoadoutRow[]>();
  for (const loadout of loadouts.rows) {
    const values = loadoutsByUser.get(loadout.user_id) ?? [];
    values.push(loadout);
    loadoutsByUser.set(loadout.user_id, values);
  }
  const selected = new Map<string, LoadoutRow>();
  const selectedChannel = new Map<string, string | null>();
  const requestedChannel = input.channelSlug
    ? resolveNetworkChannel(input.channelSlug)?.slug ?? null
    : null;
  for (const row of visible) {
    const values = loadoutsByUser.get(row.user_id) ?? [];
    const channelScope = row.channelsAllowed && requestedChannel ? `channel:${requestedChannel}` : null;
    const loadout = (channelScope ? values.find((candidate) => candidate.scope === channelScope) : null)
      ?? values.find((candidate) => candidate.scope === "global");
    if (loadout) {
      selected.set(row.user_id, loadout);
      selectedChannel.set(row.user_id, loadout.scope.startsWith("channel:")
        ? loadout.scope.slice("channel:".length)
        : null);
    }
  }
  if (selected.size === 0) return {};

  const [cosmeticsResult, badgesResult] = await Promise.all([
    query<CosmeticRow>(
      `SELECT u.user_id,c.code,c.kind,c.channel_slug,c.name,c.asset
         FROM passport_cosmetic_unlocks u
         JOIN passport_cosmetics c ON c.code=u.cosmetic_code AND c.active=true
        WHERE u.user_id=ANY($1::text[]) AND u.state='active'`,
      [userIds],
    ),
    query<BadgeRow>(
      `SELECT g.user_id,d.code,d.name,d.tier,d.channel_slug
         FROM passport_achievement_grants g
         JOIN passport_achievement_definitions d ON d.code=g.achievement_code AND d.active=true
        WHERE g.user_id=ANY($1::text[]) AND g.state='active'`,
      [userIds],
    ),
  ]);
  const cosmetics = new Map(cosmeticsResult.rows.map((item) => [key(item.user_id, item.code), item]));
  const badges = new Map(badgesResult.rows.map((item) => [key(item.user_id, item.code), item]));

  const cardIds = visible.flatMap((row) => {
    const loadout = selected.get(row.user_id);
    return row.inventoryAllowed && loadout?.featured_card_id && row.showcase_card_ids.includes(loadout.featured_card_id)
      ? [loadout.featured_card_id]
      : [];
  });
  const cardsResult = cardIds.length > 0 ? await query<CardRow>(
    `SELECT c.owner_user_id AS user_id,c.id::text,e.name,e.artwork_url,e.rarity,c.serial_number,e.channel_slug
       FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id
      WHERE c.id=ANY($1::uuid[]) AND c.state IN('active','locked','escrowed')`,
    [cardIds],
  ) : { rows: [] as CardRow[] };
  const cards = new Map(cardsResult.rows.map((item) => [key(item.user_id, item.id), item]));

  const result: Record<string, PassportChatIdentity> = {};
  for (const row of visible) {
    const loadout = selected.get(row.user_id);
    if (!loadout) continue;
    const scopeChannel = selectedChannel.get(row.user_id) ?? null;
    const cosmetic = (code: string | null) => {
      if (!code) return null;
      const value = cosmetics.get(key(row.user_id, code)) ?? null;
      return value && (value.channel_slug === null || value.channel_slug === scopeChannel) ? value : null;
    };
    const title = cosmetic(loadout.title_code);
    const nameplate = cosmetic(loadout.nameplate_code);
    const frame = cosmetic(loadout.frame_code);
    const theme = cosmetic(loadout.theme_code);
    const reactionNames = loadout.reaction_codes
      .map((code) => cosmetic(code))
      .filter((value): value is CosmeticRow => value !== null && value.kind === "reaction")
      .map((value) => value.name);
    const allowedBadgeCodes = row.activityAllowed
      ? loadout.badge_codes.filter((code) => {
        if (!row.showcase_achievement_codes.includes(code)) return false;
        const badge = badges.get(key(row.user_id, code));
        return badge && (badge.channel_slug === null || badge.channel_slug === scopeChannel);
      })
      : [];
    const featured = loadout.featured_card_id
      ? cards.get(key(row.user_id, loadout.featured_card_id)) ?? null
      : null;
    result[row.login] = {
      siteUser: true,
      title: title?.kind === "title" ? title.name : null,
      nameplate: nameplate?.kind === "nameplate" ? nameplate.name : null,
      frame: frame?.kind === "frame" || frame?.kind === "avatar_frame" ? frame.name : null,
      theme: theme?.kind === "theme" ? theme.name : null,
      accent: passportIdentityAccent(frame?.asset, theme?.asset, nameplate?.asset),
      featuredCard: featured && featured.channel_slug === scopeChannel ? {
        name: featured.name,
        artworkUrl: featured.artwork_url,
        rarity: featured.rarity,
        serialNumber: featured.serial_number,
      } : null,
      badges: allowedBadgeCodes
        .map((code) => badges.get(key(row.user_id, code)) ?? null)
        .filter((value): value is BadgeRow => value !== null)
        .slice(0, 3)
        .map((value) => ({ code: value.code, name: value.name, tier: value.tier })),
      reactions: reactionNames,
    };
  }
  return result;
}

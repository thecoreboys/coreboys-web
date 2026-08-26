import type {
  PassportAchievement,
  PassportActiveEvent,
  PassportCard,
  PassportCosmetic,
  PassportQuest,
  PassportRarity,
  PassportTrade,
  PassportTradeCardSummary,
} from "@/lib/passport/types";
import { passportXpForLevel } from "@/lib/passport/policy";

export type AchievementTier = PassportAchievement["tier"];

export const RARITY_ORDER: Record<PassportRarity, number> = {
  legendary: 4,
  historic: 3,
  rare: 2,
  common: 1,
};

export const TIER_ORDER: Record<AchievementTier, number> = {
  icon: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

export type PassportTradeActions = {
  incoming: boolean;
  myConfirmed: boolean;
  canAccept: boolean;
  canDecline: boolean;
  canConfirm: boolean;
  canCancel: boolean;
};

/** Keep action visibility aligned with the server-side escrow state machine. */
export function passportTradeActions(trade: PassportTrade, userId: string): PassportTradeActions {
  const incoming = trade.recipientUserId === userId;
  const participant = incoming || trade.proposerUserId === userId;
  const myConfirmed = incoming ? trade.recipientConfirmed : trade.proposerConfirmed;
  return {
    incoming,
    myConfirmed,
    canAccept: incoming && trade.state === "pending",
    canDecline: incoming && (trade.state === "pending" || trade.state === "awaiting_confirmation"),
    canConfirm: participant && trade.state === "awaiting_confirmation" && !myConfirmed,
    canCancel: participant && (
      trade.state === "pending" ||
      trade.state === "awaiting_confirmation" ||
      trade.state === "cooling_off"
    ),
  };
}

export type PassportTradeCardDisplay = PassportTradeCardSummary & { legacyFallback: boolean };

export function passportTradeCardDisplays(
  ids: string[],
  summaries: PassportTradeCardSummary[] | undefined,
  inventory: PassportCard[],
): PassportTradeCardDisplay[] {
  const provided = new Map((summaries ?? []).map((card) => [card.id, card]));
  const owned = new Map(inventory.map((card) => [card.id, card]));
  return ids.map((id) => {
    const card = provided.get(id) ?? owned.get(id);
    return card
      ? { id, name: card.name, variant: card.variant, rarity: card.rarity, serialNumber: card.serialNumber, editionSize: card.editionSize, artworkUrl: card.artworkUrl, legacyFallback: false }
      : { id, name: "Legacy card reference", variant: `ID ${id.slice(0, 8)}`, rarity: "common", serialNumber: null, editionSize: null, artworkUrl: null, legacyFallback: true };
  });
}

/** Eligible extras for the seeded three-common-card crafting recipe. */
export function craftablePassportDuplicates(cards: PassportCard[]): PassportCard[] {
  const grouped = new Map<string, PassportCard[]>();
  for (const card of cards.filter((item) => item.state === "active")) {
    grouped.set(card.editionId, [...(grouped.get(card.editionId) ?? []), card]);
  }
  return Array.from(grouped.values()).flatMap((group) => {
    const ordered = [...group].sort((left, right) =>
      (left.serialNumber ?? Number.MAX_SAFE_INTEGER) - (right.serialNumber ?? Number.MAX_SAFE_INTEGER),
    );
    return ordered.slice(1).filter((card) => card.rarity === "common" && card.craftValue > 0);
  });
}

export function findUnlockedPassportCosmetic(cosmetics: PassportCosmetic[], code: string | null) {
  return code ? cosmetics.find((candidate) => candidate.code === code && candidate.unlocked) ?? null : null;
}

export function passportHeartbeatMarker(
  eventId: string,
  playbackKey: string,
  watchedSeconds: number,
  heartbeatIntervalSeconds: number,
) {
  const interval = Math.max(10, Math.trunc(heartbeatIntervalSeconds) || 10);
  const bucket = Math.floor(Math.max(0, watchedSeconds) / interval);
  return `${eventId}:${playbackKey}:${bucket}`;
}

export function passportQuestProgress(
  quest: Pick<PassportQuest, "objective" | "progress" | "state">,
): { current: number; target: number } {
  const progressSteps = Array.isArray(quest.progress.steps)
    ? new Set(quest.progress.steps.filter((step): step is string => typeof step === "string")).size
    : 0;
  const objectiveSteps = Array.isArray(quest.objective.steps)
    ? new Set(quest.objective.steps.filter((step): step is string => typeof step === "string")).size
    : 0;
  const rawCurrent = typeof quest.progress.count === "number" && Number.isFinite(quest.progress.count)
    ? quest.progress.count
    : progressSteps;
  const rawTarget = typeof quest.objective.required === "number" && Number.isFinite(quest.objective.required)
    ? quest.objective.required
    : objectiveSteps || 1;
  const target = Math.max(1, Math.trunc(rawTarget));
  const current = Math.max(0, Math.trunc(rawCurrent));
  return {
    current: quest.state === "completed" || quest.state === "claimed" ? Math.max(current, target) : current,
    target,
  };
}

export type PassportLiveScore = {
  title: string | null;
  teams: [{ name: string; score: number }, { name: string; score: number }];
};

function cleanPassportScoreText(value: unknown, fallback: string, maxLength = 32) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : fallback;
}

function cleanPassportScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(9_999, Math.max(0, Math.trunc(value)))
    : 0;
}

/** Parse the current teams-array score shape, with a safe legacy fallback. */
export function passportLiveScore(state: Record<string, unknown>): PassportLiveScore | null {
  const rawTeams = Array.isArray(state.teams)
    ? state.teams.filter((team): team is Record<string, unknown> => Boolean(team) && typeof team === "object")
    : [];
  if (rawTeams.length >= 2) {
    return {
      title: cleanPassportScoreText(state.title, "", 64) || null,
      teams: [
        { name: cleanPassportScoreText(rawTeams[0]?.name, "Team 1"), score: cleanPassportScore(rawTeams[0]?.score) },
        { name: cleanPassportScoreText(rawTeams[1]?.name, "Team 2"), score: cleanPassportScore(rawTeams[1]?.score) },
      ],
    };
  }
  const hasLegacyScore = [state.homeName, state.awayName, state.homeScore, state.awayScore]
    .some((value) => value !== undefined && value !== null);
  if (!hasLegacyScore) return null;
  return {
    title: cleanPassportScoreText(state.title, "", 64) || null,
    teams: [
      { name: cleanPassportScoreText(state.homeName, "Home"), score: cleanPassportScore(state.homeScore) },
      { name: cleanPassportScoreText(state.awayName, "Away"), score: cleanPassportScore(state.awayScore) },
    ],
  };
}

export type PassportPlaybackDescriptor = {
  key: string;
  kind: string;
  platform?: string | null;
  memberSlug?: string | null;
  url?: string | null;
  sourceUrl?: string | null;
  youtubeId?: string | null;
  vodId?: string | null;
  twitchLogin?: string | null;
};

export type PassportPlaybackEventMatch = {
  event: PassportActiveEvent;
  playbackRef: string;
};

/**
 * Canonical references accepted by the control room are added beside the raw
 * playable values, so a documented `youtube:id` or `twitch:vod:id` event can
 * still verify the exact media currently playing.
 */
export function passportPlaybackReferences(current: PassportPlaybackDescriptor): Set<string> {
  const references = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = value?.trim();
    if (normalized) references.add(normalized);
  };
  add(current.key);
  add(current.url);
  add(current.sourceUrl);
  add(current.youtubeId);
  add(current.vodId);
  add(current.twitchLogin);

  if (current.youtubeId) {
    add(`youtube:${current.youtubeId}`);
    add(`yt-${current.youtubeId}`);
  }
  if (current.vodId) {
    add(`twitch:vod:${current.vodId}`);
    add(`vod-${current.vodId}`);
  }
  if (current.twitchLogin) {
    const login = current.twitchLogin.toLocaleLowerCase();
    add(login);
    add(`twitch:${login}`);
    add(`twitch:stream:${login}`);
    add(`live-${login}`);
  }

  if (current.platform === "youtube" && current.key) {
    const key = current.key.replace(/^yt-/, "");
    add(`youtube:${key}`);
    add(`yt-${key}`);
  }
  if (current.platform === "twitch" && current.key) {
    add(`twitch:${current.key.replace(/^(?:live-|vod-)/, "")}`);
  }
  return references;
}

export function matchPassportEventForPlayback(
  events: PassportActiveEvent[],
  current: PassportPlaybackDescriptor | null,
): PassportPlaybackEventMatch | null {
  if (!current) return null;
  const liveEvents = events.filter((event) => event.state === "live");
  const references = passportPlaybackReferences(current);
  const exact = liveEvents.find((event) => event.externalRef && references.has(event.externalRef));
  if (exact?.externalRef) return { event: exact, playbackRef: exact.externalRef };
  return null;
}

export function boundedPercent(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / target) * 100)));
}

export function passportChannelLevelPercent(xp: number, level: number, nextLevelXp: number) {
  const floor = passportXpForLevel(level);
  return boundedPercent(xp - floor, Math.max(1, nextLevelXp - floor));
}

export function safePassportInternalHref(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  try {
    const url = new URL(value, "https://core.local");
    if (url.origin !== "https://core.local") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export type PassportScoreStatus = "unofficial" | "verified" | "final" | "frozen" | "disputed";

export function passportScoreStatus(status: string): PassportScoreStatus {
  if (status === "certified" || status === "verified") return "verified";
  if (status === "final") return "final";
  if (status === "frozen") return "frozen";
  if (status === "disputed") return "disputed";
  return "unofficial";
}

export type PassportWitnessKind = "live" | "replay" | "grant";

export function passportWitnessKind(acquiredVia: string): PassportWitnessKind {
  const value = acquiredVia.toLocaleLowerCase();
  if (value.includes("replay")) return "replay";
  if (value === "attendance" || value === "moment" || value.includes("live") || value.includes("presence")) return "live";
  return "grant";
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, value),
  );
}

export function formatPassportDate(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatPassportDateTime(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function filterCards(
  cards: PassportCard[],
  options: { query?: string; channel?: string; rarity?: PassportRarity | "all"; duplicatesOnly?: boolean },
): PassportCard[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const copies = new Map<string, number>();
  for (const card of cards) {
    const key = `${card.editionId}:${card.variant}`;
    copies.set(key, (copies.get(key) ?? 0) + 1);
  }
  return cards
    .filter((card) => !options.channel || options.channel === "all" || card.channelSlug === options.channel)
    .filter((card) => !options.rarity || options.rarity === "all" || card.rarity === options.rarity)
    .filter((card) => !options.duplicatesOnly || (copies.get(`${card.editionId}:${card.variant}`) ?? 0) > 1)
    .filter((card) => {
      if (!query) return true;
      return [card.name, card.description, card.eventTitle, card.channelSlug, card.variant, card.editionCode, JSON.stringify(card.provenance)]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query));
    })
    .sort((left, right) => {
      const earned = Date.parse(right.acquiredAt) - Date.parse(left.acquiredAt);
      return Number.isFinite(earned) && earned !== 0
        ? earned
        : RARITY_ORDER[right.rarity] - RARITY_ORDER[left.rarity];
    });
}

export function sortAchievements(achievements: PassportAchievement[]): PassportAchievement[] {
  return [...achievements].sort((left, right) => {
    const earnedDelta = Number(right.earned) - Number(left.earned);
    if (earnedDelta) return earnedDelta;
    const tierDelta = TIER_ORDER[right.tier] - TIER_ORDER[left.tier];
    if (tierDelta) return tierDelta;
    return boundedPercent(right.progress, right.threshold) - boundedPercent(left.progress, left.threshold);
  });
}

export function provenanceString(card: Pick<PassportCard, "provenance">, key: string): string | null {
  const value = card.provenance[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function safeReplayHref(card: Pick<PassportCard, "provenance" | "momentOffsetSeconds" | "eventExternalRef" | "name" | "channelSlug">): string | null {
  const replayHref = provenanceString(card, "replayHref") ?? provenanceString(card, "playbackHref");
  const external = replayHref ?? card.eventExternalRef;
  if (!external) return null;
  try {
    let href = external;
    if (!href.startsWith("/")) {
      const youtubeId = /^(?:yt-|youtube:)([A-Za-z0-9_-]{6,})$/.exec(href)?.[1];
      const vodId = /^(?:vod-|twitch:vod:)([A-Za-z0-9]+)$/.exec(href)?.[1];
      if (!youtubeId && !vodId) return null;
      const params = new URLSearchParams({
        kind: youtubeId ? "youtube" : "vod",
        id: youtubeId ?? vodId!,
        ref: href,
        src: youtubeId ? "youtube" : "twitch",
        title: card.name,
        slug: card.channelSlug,
      });
      href = `/theater?${params.toString()}`;
    }
    const url = new URL(href, "https://core.local");
    const seconds = Math.max(0, Math.trunc(card.momentOffsetSeconds ?? 0));
    if (seconds) url.searchParams.set("t", String(seconds));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function cardSerial(card: Pick<PassportCard, "serialNumber" | "editionSize">): string {
  if (card.serialNumber && card.editionSize) {
    return `#${card.serialNumber.toLocaleString("en-US")} / ${card.editionSize.toLocaleString("en-US")}`;
  }
  if (card.serialNumber) return `#${card.serialNumber.toLocaleString("en-US")} · Open edition`;
  return "Open edition";
}

export function channelLabel(slug: string): string {
  if (!slug) return "CORE Network";
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function channelAccent(slug: string): string {
  const palette = ["#db0368", "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#ef4444"];
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}

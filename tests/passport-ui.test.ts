import assert from "node:assert/strict";
import test from "node:test";
import type { PassportAchievement, PassportActiveEvent, PassportCard, PassportCosmetic, PassportQuest, PassportTrade } from "../lib/passport/types";
import {
  boundedPercent,
  cardSerial,
  channelLabel,
  craftablePassportDuplicates,
  filterCards,
  findUnlockedPassportCosmetic,
  matchPassportEventForPlayback,
  passportHeartbeatMarker,
  passportChannelLevelPercent,
  passportLiveScore,
  passportQuestProgress,
  passportScoreStatus,
  passportTradeCardDisplays,
  passportTradeActions,
  passportWitnessKind,
  safePassportInternalHref,
  safeReplayHref,
  sortAchievements,
} from "../components/passport/passport-utils";
import { collectPassportInventoryPages, mergePassportCards } from "../hooks/passport/usePassportInventory";
import { passportIdentityAccent } from "../lib/passport/chat-identity";
import { multiviewPassportCreditTileId } from "../lib/watch/workspace";

function card(input: Partial<PassportCard> & Pick<PassportCard, "id" | "editionId" | "name">): PassportCard {
  return {
    id: input.id,
    editionId: input.editionId,
    editionCode: input.editionCode ?? input.editionId,
    name: input.name,
    description: input.description ?? "A verified CORE moment",
    artworkUrl: input.artworkUrl ?? null,
    rarity: input.rarity ?? "common",
    variant: input.variant ?? "base",
    channelSlug: input.channelSlug ?? "core-house",
    serialNumber: input.serialNumber ?? 1,
    editionSize: input.editionSize ?? 100,
    accountBound: input.accountBound ?? false,
    giftable: input.giftable ?? true,
    tradeable: input.tradeable ?? true,
    state: input.state ?? "active",
    craftValue: input.craftValue ?? 0,
    acquiredVia: input.acquiredVia ?? "attendance",
    acquiredAt: input.acquiredAt ?? "2026-08-20T20:00:00.000Z",
    eventId: input.eventId ?? "event-1",
    eventTitle: input.eventTitle ?? "Opening Night",
    eventExternalRef: input.eventExternalRef ?? null,
    momentId: input.momentId ?? null,
    momentOffsetSeconds: input.momentOffsetSeconds ?? null,
    provenance: input.provenance ?? {},
  };
}

function trade(input: Partial<PassportTrade> & Pick<PassportTrade, "state">): PassportTrade {
  return {
    id: input.id ?? "trade-1",
    proposerUserId: input.proposerUserId ?? "proposer",
    proposerName: input.proposerName ?? "Proposer",
    recipientUserId: input.recipientUserId ?? "recipient",
    recipientName: input.recipientName ?? "Recipient",
    message: input.message ?? null,
    state: input.state,
    offeredCardIds: input.offeredCardIds ?? ["one"],
    requestedCardIds: input.requestedCardIds ?? ["two"],
    offeredCards: input.offeredCards ?? [],
    requestedCards: input.requestedCards ?? [],
    proposerConfirmed: input.proposerConfirmed ?? false,
    recipientConfirmed: input.recipientConfirmed ?? false,
    executesAt: input.executesAt ?? null,
    expiresAt: input.expiresAt ?? "2026-08-21T20:00:00.000Z",
    createdAt: input.createdAt ?? "2026-08-20T20:00:00.000Z",
  };
}

function activeEvent(input: Partial<PassportActiveEvent> = {}): PassportActiveEvent {
  return {
    id: input.id ?? "event-1",
    code: input.code ?? "opening-night",
    networkSlug: input.networkSlug ?? "core",
    channelSlug: input.channelSlug ?? "core",
    title: input.title ?? "Opening Night",
    startsAt: input.startsAt ?? "2026-08-20T20:00:00.000Z",
    endsAt: input.endsAt ?? null,
    state: input.state ?? "live",
    externalRef: input.externalRef ?? null,
    heartbeatIntervalSeconds: input.heartbeatIntervalSeconds ?? 30,
    minimumWatchSeconds: input.minimumWatchSeconds ?? 120,
    attendanceGraceSeconds: input.attendanceGraceSeconds ?? 30,
    presenceState: input.presenceState ?? null,
    watchSeconds: input.watchSeconds ?? 0,
    heartbeatCount: input.heartbeatCount ?? 0,
    claimedAt: input.claimedAt ?? null,
    claimState: input.claimState ?? "not_eligible",
    canClaim: input.canClaim ?? false,
    scoreboard: input.scoreboard ?? null,
  };
}

test("boundedPercent clamps invalid and over-complete progress", () => {
  assert.equal(boundedPercent(5, 10), 50);
  assert.equal(boundedPercent(15, 10), 100);
  assert.equal(boundedPercent(-5, 10), 0);
  assert.equal(boundedPercent(5, 0), 0);
});

test("Memory Book filters channels, rarities, queries, and real duplicate editions", () => {
  const cards = [
    card({ id: "one", editionId: "opening", name: "Buzzer Beater", rarity: "historic" }),
    card({ id: "two", editionId: "opening", name: "Buzzer Beater", rarity: "historic", serialNumber: 2 }),
    card({ id: "three", editionId: "trivia", name: "Lore Keeper", channelSlug: "slg", rarity: "rare" }),
  ];
  assert.deepEqual(filterCards(cards, { duplicatesOnly: true }).map((item) => item.id), ["one", "two"]);
  assert.deepEqual(filterCards(cards, { channel: "slg" }).map((item) => item.id), ["three"]);
  assert.deepEqual(filterCards(cards, { query: "buzzer", rarity: "historic" }).map((item) => item.id), ["one", "two"]);
});

test("crafting exposes exactly eligible common extras, including account-bound copies", () => {
  const cards = [
    card({ id: "keep", editionId: "common", name: "Common", craftValue: 5, serialNumber: 1 }),
    card({ id: "extra-a", editionId: "common", name: "Common", craftValue: 5, serialNumber: 2, accountBound: true }),
    card({ id: "extra-b", editionId: "common", name: "Common", craftValue: 5, serialNumber: 3 }),
    card({ id: "extra-c", editionId: "common", name: "Common", craftValue: 5, serialNumber: 4 }),
    card({ id: "rare-keep", editionId: "rare", name: "Rare", craftValue: 20, rarity: "rare", serialNumber: 1 }),
    card({ id: "rare-extra", editionId: "rare", name: "Rare", craftValue: 20, rarity: "rare", serialNumber: 2 }),
    card({ id: "zero-keep", editionId: "zero", name: "Zero", craftValue: 0, serialNumber: 1 }),
    card({ id: "zero-extra", editionId: "zero", name: "Zero", craftValue: 0, serialNumber: 2 }),
  ];
  assert.deepEqual(craftablePassportDuplicates(cards).map((item) => item.id), ["extra-a", "extra-b", "extra-c"]);
});

test("paginated inventory merges fresh rows without duplicate cards or reordering", () => {
  const first = card({ id: "one", editionId: "opening", name: "Opening" });
  const second = card({ id: "two", editionId: "finale", name: "Finale" });
  const refreshed = { ...second, state: "locked" as const };
  const third = card({ id: "three", editionId: "crossover", name: "Crossover" });
  const merged = mergePassportCards([first, second], [refreshed, third, third]);
  assert.deepEqual(merged.map((item) => item.id), ["one", "two", "three"]);
  assert.equal(merged[1]?.state, "locked");
});

test("full inventory follows opaque cursors across bounded pages", async () => {
  const first = card({ id: "one", editionId: "opening", name: "Opening" });
  const second = card({ id: "two", editionId: "finale", name: "Finale" });
  const third = card({ id: "three", editionId: "crossover", name: "Crossover" });
  const calls: Array<string | undefined> = [];
  const pages = new Map<string | undefined, { items: PassportCard[]; nextCursor: string | null }>([
    [undefined, { items: [first, second], nextCursor: "cursor-1" }],
    ["cursor-1", { items: [{ ...second, state: "locked" }, third], nextCursor: "cursor-2" }],
    ["cursor-2", { items: [], nextCursor: null }],
  ]);
  const result = await collectPassportInventoryPages([], async (cursor) => {
    calls.push(cursor);
    return pages.get(cursor)!;
  }, { maxPages: 10 });
  assert.deepEqual(calls, [undefined, "cursor-1", "cursor-2"]);
  assert.deepEqual(result.cards.map((item) => item.id), ["one", "two", "three"]);
  assert.equal(result.cards[1]?.state, "locked");
  assert.equal(result.nextCursor, null);

  const bounded = await collectPassportInventoryPages([], async (cursor) => pages.get(cursor)!, { maxPages: 2 });
  assert.equal(bounded.pagesLoaded, 2);
  assert.equal(bounded.nextCursor, "cursor-2");
});

test("replay links only allow internal paths or recognized provider references", () => {
  const direct = card({ id: "one", editionId: "a", name: "Direct", provenance: { replayHref: "/theater?kind=vod&id=12" }, momentOffsetSeconds: 42 });
  assert.equal(safeReplayHref(direct), "/theater?kind=vod&id=12&t=42");

  const youtube = card({ id: "two", editionId: "b", name: "YouTube Moment", eventExternalRef: "yt-AbCdEf12345", momentOffsetSeconds: 90 });
  assert.match(safeReplayHref(youtube) ?? "", /^\/theater\?.*kind=youtube.*t=90/);

  const unsafe = card({ id: "three", editionId: "c", name: "Unsafe", provenance: { replayHref: "https://evil.example/video" } });
  assert.equal(safeReplayHref(unsafe), null);
});

test("earned achievements sort ahead of locked progress", () => {
  const base: Omit<PassportAchievement, "code" | "name" | "earned" | "earnedAt" | "tier"> = {
    channelSlug: null,
    family: "attendance",
    description: "test",
    icon: null,
    threshold: 10,
    progress: 5,
    secret: false,
    reward: {},
  };
  const achievements: PassportAchievement[] = [
    { ...base, code: "locked", name: "Locked", earned: false, earnedAt: null, tier: "icon" },
    { ...base, code: "earned", name: "Earned", earned: true, earnedAt: "2026-08-20T20:00:00Z", tier: "bronze" },
  ];
  assert.equal(sortAchievements(achievements)[0]?.code, "earned");
  assert.equal(channelLabel("core-house"), "Core House");
});

test("trade controls follow pending, confirmation, and cooling-off server states", () => {
  const pendingIncoming = passportTradeActions(trade({ state: "pending" }), "recipient");
  assert.equal(pendingIncoming.canAccept, true);
  assert.equal(pendingIncoming.canDecline, true);
  assert.equal(pendingIncoming.canConfirm, false);

  const pendingOutgoing = passportTradeActions(trade({ state: "pending" }), "proposer");
  assert.equal(pendingOutgoing.canAccept, false);
  assert.equal(pendingOutgoing.canCancel, true);

  const awaiting = passportTradeActions(trade({ state: "awaiting_confirmation" }), "recipient");
  assert.equal(awaiting.canConfirm, true);
  assert.equal(awaiting.canDecline, true);

  const alreadyConfirmed = passportTradeActions(
    trade({ state: "awaiting_confirmation", proposerConfirmed: true }),
    "proposer",
  );
  assert.equal(alreadyConfirmed.canConfirm, false);
  assert.equal(alreadyConfirmed.canCancel, true);

  const cooling = passportTradeActions(trade({ state: "cooling_off" }), "recipient");
  assert.equal(cooling.canConfirm, false);
  assert.equal(cooling.canDecline, false);
  assert.equal(cooling.canCancel, true);

  const settled = passportTradeActions(trade({ state: "completed" }), "recipient");
  assert.equal(settled.canAccept || settled.canConfirm || settled.canDecline || settled.canCancel, false);
});

test("trade review uses participant-safe card summaries with a labeled legacy fallback", () => {
  const owned = card({ id: "owned", editionId: "owned-edition", name: "Owned Memory", variant: "base", serialNumber: 4 });
  const rows = passportTradeCardDisplays(
    ["counterparty", "owned", "legacy-deadbeef"],
    [{ id: "counterparty", name: "Counterparty Memory", variant: "signed", rarity: "rare", serialNumber: 8, editionSize: 50, artworkUrl: null }],
    [owned],
  );
  assert.deepEqual(rows.map((row) => [row.name, row.variant, row.serialNumber, row.legacyFallback]), [
    ["Counterparty Memory", "signed", 8, false],
    ["Owned Memory", "base", 4, false],
    ["Legacy card reference", "ID legacy-d", null, true],
  ]);
});

test("presence matching accepts canonical media aliases without weakening exact matching", () => {
  const youtube = activeEvent({ id: "youtube", externalRef: "youtube:AbCdEf12345", channelSlug: "adapt" });
  const youtubeMatch = matchPassportEventForPlayback([youtube], {
    key: "catalog-item",
    kind: "youtube",
    platform: "youtube",
    memberSlug: "adapt",
    youtubeId: "AbCdEf12345",
  });
  assert.equal(youtubeMatch?.event.id, "youtube");
  assert.equal(youtubeMatch?.playbackRef, "youtube:AbCdEf12345");

  const vod = activeEvent({ id: "vod", externalRef: "twitch:vod:987654", channelSlug: "ron" });
  assert.equal(matchPassportEventForPlayback([vod], {
    key: "vod-987654",
    kind: "vod",
    platform: "twitch",
    memberSlug: "ron",
    vodId: "987654",
  })?.event.id, "vod");

  const house = activeEvent({ id: "house", channelSlug: "core", externalRef: null });
  assert.equal(matchPassportEventForPlayback([house], {
    key: "live-adapt",
    kind: "live",
    platform: "twitch",
    memberSlug: "adapt",
    twitchLogin: "adapt",
  }), null);

  const wrongExact = activeEvent({ id: "wrong", channelSlug: "adapt", externalRef: "youtube:different" });
  assert.equal(matchPassportEventForPlayback([wrongExact], {
    key: "live-adapt",
    kind: "live",
    platform: "twitch",
    memberSlug: "adapt",
    twitchLogin: "adapt",
  }), null);
});

test("quest progress reads count/required and step-based objectives", () => {
  const base: PassportQuest = {
    code: "watch-three",
    campaignCode: null,
    channelSlug: null,
    name: "Watch three",
    description: "Keep watching",
    objective: { metric: "watch", required: 3 },
    reward: {},
    progress: { count: 2 },
    state: "active",
    startsAt: null,
    endsAt: null,
  };
  assert.deepEqual(passportQuestProgress(base), { current: 2, target: 3 });
  assert.deepEqual(passportQuestProgress({
    ...base,
    objective: { steps: ["watch", "poll", "attend"] },
    progress: { steps: ["watch", "poll", "poll"] },
  }), { current: 2, target: 3 });
  assert.deepEqual(passportQuestProgress({ ...base, progress: {}, state: "completed" }), { current: 3, target: 3 });
});

test("live scores parse the teams payload and sanitize unsafe values", () => {
  const score = passportLiveScore({
    title: "House Cup\u0000 Final",
    teams: [
      { name: "CORE", score: 12 },
      { name: "Guests", score: 10_500 },
    ],
  });
  assert.equal(score?.title, "House Cup Final");
  assert.deepEqual(score?.teams, [
    { name: "CORE", score: 12 },
    { name: "Guests", score: 9_999 },
  ]);
  assert.deepEqual(passportLiveScore({ homeName: "Home", homeScore: 2, awayName: "Away", awayScore: 1 })?.teams, [
    { name: "Home", score: 2 },
    { name: "Away", score: 1 },
  ]);
  assert.equal(passportLiveScore({ title: "No teams" }), null);
});

test("identity ignores revoked cosmetics and presence markers stay interval-bounded", () => {
  const cosmetic = (code: string, unlocked: boolean): PassportCosmetic => ({
    code,
    kind: "nameplate",
    channelSlug: null,
    name: code,
    description: code,
    rarity: "common",
    asset: { accent: "#e31b36" },
    unlocked,
  });
  const catalog = [cosmetic("revoked", false), cosmetic("active", true)];
  assert.equal(findUnlockedPassportCosmetic(catalog, "revoked"), null);
  assert.equal(findUnlockedPassportCosmetic(catalog, "active")?.code, "active");
  assert.equal(passportHeartbeatMarker("event", "live-core", 0, 30), passportHeartbeatMarker("event", "live-core", 29, 30));
  assert.notEqual(passportHeartbeatMarker("event", "live-core", 29, 30), passportHeartbeatMarker("event", "live-core", 30, 30));
});

test("chat identity accepts only a safe equipped accent", () => {
  assert.equal(passportIdentityAccent({ accent: "#A1b2C3" }), "#A1b2C3");
  assert.equal(passportIdentityAccent({ accent: "red; background:url(//evil)" }), "#e31b36");
  assert.equal(passportIdentityAccent({ color: "#112233" }), "#112233");
});

test("Multiview gives Passport credit to only the focused or primary audio tile", () => {
  const tiles = [
    { id: "focus-muted", muted: true, standby: false },
    { id: "audio", muted: false, standby: false },
    { id: "other-audio", muted: false, standby: false },
    { id: "standby", muted: false, standby: true },
  ];
  assert.equal(multiviewPassportCreditTileId(tiles, new Set(tiles.map((tile) => tile.id)), "focus-muted"), "audio");
  assert.equal(multiviewPassportCreditTileId(tiles, new Set(["focus-muted", "standby"]), "focus-muted"), null);
  assert.equal(multiviewPassportCreditTileId(tiles, new Set(["audio", "other-audio"]), "other-audio"), "other-audio");
});

test("presentation helpers preserve safe links, current-level XP, score truth, and witness provenance", () => {
  assert.equal(safePassportInternalHref("/watch/live/core?from=passport"), "/watch/live/core?from=passport");
  assert.equal(safePassportInternalHref("//evil.example/watch"), null);
  assert.equal(safePassportInternalHref("/\\evil.example/watch"), null);
  assert.equal(safePassportInternalHref("https://evil.example/watch"), null);

  assert.equal(passportChannelLevelPercent(650, 3, 900), 50);
  assert.equal(passportScoreStatus("certified"), "verified");
  assert.equal(passportScoreStatus("pending_verification"), "unofficial");
  assert.equal(passportScoreStatus("frozen"), "frozen");
  assert.equal(passportScoreStatus("disputed"), "disputed");

  assert.equal(passportWitnessKind("attendance"), "live");
  assert.equal(passportWitnessKind("moment"), "live");
  assert.equal(passportWitnessKind("replay"), "replay");
  assert.equal(passportWitnessKind("grant"), "grant");
  assert.equal(cardSerial({ serialNumber: 7, editionSize: 100 }), "#7 / 100");
  assert.equal(cardSerial({ serialNumber: 7, editionSize: null }), "#7 · Open edition");
  assert.equal(cardSerial({ serialNumber: null, editionSize: null }), "Open edition");
});

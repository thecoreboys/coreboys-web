import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping runner requires an explicit TypeScript suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { TwitchTrackerHttpError, TwitchTrackerInputError, TwitchTrackerSchemaError, buildTwitchTrackerChannelSummaryUrl, buildTwitchTrackerGameSummaryUrl, fetchTwitchTrackerChannelSummary, normalizeTwitchTrackerChannelSummary, normalizeTwitchTrackerGameSummary } from "../lib/twitchtracker.ts";

const channelPayload = {
  rank: 11,
  minutes_streamed: 6541,
  avg_viewers: 47225,
  max_viewers: 75126,
  hours_watched: 5148355,
  followers: 105977,
  followers_total: 5191896,
  future_field: "retained",
};

test("normalizes a channel summary and retains unknown raw fields", () => {
  const summary = normalizeTwitchTrackerChannelSummary(channelPayload);
  assert.ok(summary);
  assert.equal(summary.minutesStreamed, 6541);
  assert.equal(summary.followersGained, 105977);
  assert.equal(summary.rawPayload.future_field, "retained");
});

test("treats HTTP-200 empty objects as unavailable, not zeroes", () => {
  assert.equal(normalizeTwitchTrackerChannelSummary({}), null);
  assert.equal(normalizeTwitchTrackerGameSummary({}), null);
});

test("rejects missing and string-coerced channel metrics", () => {
  assert.throws(
    () => normalizeTwitchTrackerChannelSummary({ ...channelPayload, avg_viewers: "47225" }),
    TwitchTrackerSchemaError,
  );
  const { hours_watched: _omitted, ...missing } = channelPayload;
  assert.throws(() => normalizeTwitchTrackerChannelSummary(missing), TwitchTrackerSchemaError);
});

test("normalizes Twitch-wide game/category summaries", () => {
  const summary = normalizeTwitchTrackerGameSummary({
    avg_viewers: 286567,
    avg_channels: 4450.5,
    rank: 1,
    hours_watched: 48238710,
  });
  assert.deepEqual(
    summary && {
      avgViewers: summary.avgViewers,
      avgChannels: summary.avgChannels,
      rank: summary.rank,
      hoursWatched: summary.hoursWatched,
    },
    { avgViewers: 286567, avgChannels: 4450.5, rank: 1, hoursWatched: 48238710 },
  );
});

test("builds normalized channel URLs and encoded game URLs", () => {
  assert.equal(
    buildTwitchTrackerChannelSummaryUrl(" StableRonaldo "),
    "https://twitchtracker.com/api/channels/summary/stableronaldo",
  );
  assert.equal(
    buildTwitchTrackerGameSummaryUrl("Just Chatting / IRL"),
    "https://twitchtracker.com/api/games/summary/Just%20Chatting%20%2F%20IRL",
  );
  assert.throws(() => buildTwitchTrackerChannelSummaryUrl("bad/login"), TwitchTrackerInputError);
});

test("fetcher validates payloads and preserves HTTP failures", async () => {
  let requested = "";
  const fetchImpl = (async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify(channelPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const result = await fetchTwitchTrackerChannelSummary("Lacy", { fetchImpl });
  assert.equal(requested, "https://twitchtracker.com/api/channels/summary/lacy");
  assert.equal(result?.maxViewers, 75126);

  const unavailableFetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  assert.equal(
    await fetchTwitchTrackerChannelSummary("lacy", { fetchImpl: unavailableFetch }),
    null,
  );

  const failedFetch = (async () => new Response("upstream down", { status: 503 })) as typeof fetch;
  await assert.rejects(
    fetchTwitchTrackerChannelSummary("lacy", { fetchImpl: failedFetch }),
    (error: unknown) => error instanceof TwitchTrackerHttpError && error.status === 503,
  );
});

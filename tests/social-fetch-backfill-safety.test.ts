import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  fetchSocialFetchInstagramPostsPage,
  fetchSocialFetchInstagramReelsPage,
  fetchSocialFetchTikTokVideosPage,
  fetchSocialFetchTwitterTweetsPage,
  setSocialFetchBudgetAdapterForTests,
} from "../lib/social-fetch-media";
import {
  isInSocialFetchBackfillWindow,
  persistSocialFetchBackfillPage,
  socialFetchBackfillBounds,
  socialFetchBackfillPageDecision,
  socialFetchBackfillPageReservationCredits,
  socialFetchBackfillTargets,
  type SocialFetchBackfillTarget,
} from "../lib/social-fetch-backfill";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("paused and capped history pages make no provider request", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json({ data: {} });
  }) as typeof fetch;

  try {
    for (const [reason, suffix] of [
      ["paused", "paused"],
      ["monthly_cap_reached", "capped"],
    ] as const) {
      setSocialFetchBudgetAdapterForTests({
        reserve: async () => ({ ok: false, reason }),
        settle: async () => undefined,
      });
      const results = await Promise.all([
        fetchSocialFetchTikTokVideosPage(`tiktok${suffix}`, "saved-cursor"),
        fetchSocialFetchInstagramPostsPage(`igposts${suffix}`, "saved-cursor"),
        fetchSocialFetchInstagramReelsPage(`igreels${suffix}`, "saved-cursor"),
        fetchSocialFetchTwitterTweetsPage(`x${suffix}`, "saved-cursor"),
      ]);
      for (const result of results) {
        assert.equal(result.status, "ok");
        assert.deepEqual(result.items, []);
        assert.equal(result.lookupStatus, null);
        assert.deepEqual(result.page, { nextCursor: null, hasMore: false });
        assert.equal(result.rawItemCount, 0);
        assert.equal(result.providerRequestMade, false);
        assert.equal(result.committedCredits, 0);
        assert.equal(result.budgetDenied, true);
      }
    }
    assert.equal(providerCalls, 0);
  } finally {
    setSocialFetchBudgetAdapterForTests(null);
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("each private history page reserves its documented cost and uses only the saved cursor", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  const reservations: Array<{ feature: string; requestKey: string; estimatedCredits?: number }> = [];
  const settled: string[] = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  setSocialFetchBudgetAdapterForTests({
    reserve: async (input) => {
      reservations.push(input);
      return {
        ok: true,
        reservationId: `history-${reservations.length}`,
        reservedCredits: input.estimatedCredits ?? 1,
        monthCreditsAfterReservation: reservations.length,
        monthlyCreditCap: 10_000,
      };
    },
    settle: async (reservationId) => {
      settled.push(reservationId);
    },
  });
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    const isTwitter = url.includes("/twitter/");
    const collection = url.includes("/videos")
      ? "videos"
      : url.includes("/reels")
        ? "reels"
        : isTwitter
          ? "tweets"
          : "posts";
    return Response.json({
      data: {
        lookupStatus: "found",
        [collection]: [],
        page: { nextCursor: "next-page", hasMore: true },
      },
      meta: { creditsCharged: isTwitter ? 2 : 1 },
    });
  }) as typeof fetch;

  try {
    const results = await Promise.all([
      fetchSocialFetchTikTokVideosPage("cursorchecktt", "cursor token/1"),
      fetchSocialFetchInstagramPostsPage("cursorcheckigp", "cursor token/1"),
      fetchSocialFetchInstagramReelsPage("cursorcheckigr", "cursor token/1"),
      fetchSocialFetchTwitterTweetsPage("FaZeAdapt", "cursor token/1"),
    ]);

    assert.equal(requests.length, 4);
    const requestUrls = requests.map((request) => new URL(request.url));
    assert.ok(requestUrls.every((url) => url.searchParams.get("cursor") === "cursor token/1"));
    assert.ok(requestUrls.every((url) => !url.searchParams.has("hostMedia")));
    assert.equal(
      requestUrls.find((url) => url.pathname.endsWith("/videos"))?.searchParams.get("sortBy"),
      "latest",
    );
    const twitterUrl = requestUrls.find((url) => url.pathname.endsWith("/twitter/profiles/FaZeAdapt/tweets"));
    assert.equal(twitterUrl?.searchParams.get("limit"), "100");
    assert.equal(twitterUrl?.searchParams.get("includeReplies"), "false");
    assert.equal(twitterUrl?.searchParams.get("includePinned"), "false");
    assert.ok(requests.every((request) => request.init?.cache === "no-store"));
    assert.deepEqual(
      reservations.map(({ feature, estimatedCredits }) => ({ feature, estimatedCredits })),
      [
        ...Array.from({ length: 3 }, () => ({ feature: "six_month_backfill", estimatedCredits: 1 })),
        { feature: "six_month_backfill", estimatedCredits: 2 },
      ],
    );
    assert.deepEqual(settled.sort(), ["history-1", "history-2", "history-3", "history-4"]);
    assert.ok(results.every((result) => result.providerRequestMade
      && result.page.hasMore
      && result.page.nextCursor === "next-page"));
    assert.deepEqual(results.map((result) => result.committedCredits), [1, 1, 1, 2]);
  } finally {
    setSocialFetchBudgetAdapterForTests(null);
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("paid history pages retain actual charges and fail closed on provider or partial parse errors", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.SOCIAL_FETCH_API_KEY = "test-social-fetch-key";
  setSocialFetchBudgetAdapterForTests({
    reserve: async (input) => ({
      ok: true,
      reservationId: "history-failure-check",
      reservedCredits: input.estimatedCredits ?? 1,
      monthCreditsAfterReservation: 1,
      monthlyCreditCap: 10_000,
    }),
    settle: async () => undefined,
  });
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/videos")) {
      return Response.json({
        data: {
          lookupStatus: "rate_limited",
          videos: [],
          page: { nextCursor: null, hasMore: false },
        },
        meta: { creditsCharged: 3 },
      });
    }
    if (url.includes("/twitter/profiles/httpfailure/")) {
      return new Response(null, { status: 503 });
    }
    if (url.includes("/twitter/profiles/ownershipcheck/")) {
      return Response.json({
        data: {
          lookupStatus: "found",
          tweets: [{
            id: "2012345678901234568",
            url: "https://x.com/someoneelse/status/2012345678901234568",
            text: "Wrong profile",
            createdAt: "2026-06-01T00:00:00Z",
            inReplyToStatusId: null,
            isRetweet: false,
            author: { handle: "someoneelse" },
            media: [],
          }],
          page: { nextCursor: null, hasMore: false },
        },
        meta: { creditsCharged: 2 },
      });
    }
    if (url.includes("/tweets")) {
      return Response.json({
        data: {
          lookupStatus: "found",
          tweets: [{
            id: "2012345678901234567",
            url: "https://x.com/FaZeAdapt/status/2012345678901234567",
            text: "Archived X post",
            createdAt: "2026-06-01T00:00:00Z",
            inReplyToStatusId: null,
            isRetweet: false,
            author: { handle: "FaZeAdapt" },
            media: [],
          }, {}],
          page: { nextCursor: "next", hasMore: true },
        },
        meta: { creditsCharged: 2 },
      });
    }
    return Response.json({
      data: {
        lookupStatus: "found",
        posts: [{
          id: "18001234567890123",
          shortcode: "CorePhoto1",
          mediaType: "image",
          createdAt: "2026-06-01T00:00:00Z",
        }, {}],
        page: { nextCursor: "next", hasMore: true },
      },
      meta: { creditsCharged: 1 },
    });
  }) as typeof fetch;

  try {
    const lookupFailure = await fetchSocialFetchTikTokVideosPage("lookupfailure");
    assert.equal(lookupFailure.status, "rate_limited");
    assert.equal(lookupFailure.providerRequestMade, true);
    assert.equal(lookupFailure.committedCredits, 3);

    const partialPage = await fetchSocialFetchInstagramPostsPage("partialpage");
    assert.equal(partialPage.status, "invalid_response");
    assert.equal(partialPage.providerRequestMade, true);
    assert.equal(partialPage.rawItemCount, 2);

    const partialTwitterPage = await fetchSocialFetchTwitterTweetsPage("FaZeAdapt");
    assert.equal(partialTwitterPage.status, "invalid_response");
    assert.equal(partialTwitterPage.providerRequestMade, true);
    assert.equal(partialTwitterPage.committedCredits, 2);
    assert.equal(partialTwitterPage.rawItemCount, 2);

    const failedTwitterPage = await fetchSocialFetchTwitterTweetsPage("httpfailure");
    assert.equal(failedTwitterPage.status, "upstream_error");
    assert.equal(failedTwitterPage.providerRequestMade, true);
    assert.equal(failedTwitterPage.committedCredits, 2);

    const ownershipMismatch = await fetchSocialFetchTwitterTweetsPage("ownershipcheck");
    assert.equal(ownershipMismatch.status, "invalid_response");
    assert.equal(ownershipMismatch.rawItemCount, 1);
  } finally {
    setSocialFetchBudgetAdapterForTests(null);
    globalThis.fetch = originalFetch;
    restoreEnv("SOCIAL_FETCH_API_KEY", previousKey);
  }
});

test("six-month bounds use clamped UTC calendar months and a fixed recent-content exclusion", () => {
  assert.deepEqual(
    socialFetchBackfillBounds("2026-08-31T15:45:30.250Z", 6, 3 * 60 * 60 * 1_000),
    {
      cutoffAt: "2026-02-28T15:45:30.250Z",
      backfillBeforeAt: "2026-08-31T12:45:30.250Z",
    },
  );
  assert.deepEqual(
    socialFetchBackfillBounds("2024-08-31T15:45:30.250Z", 6, 3 * 60 * 60 * 1_000),
    {
      cutoffAt: "2024-02-29T15:45:30.250Z",
      backfillBeforeAt: "2024-08-31T12:45:30.250Z",
    },
  );

  const cutoffAt = "2026-02-28T15:45:30.250Z";
  const backfillBeforeAt = "2026-08-31T12:45:30.250Z";
  assert.equal(isInSocialFetchBackfillWindow(cutoffAt, cutoffAt, backfillBeforeAt), true);
  assert.equal(isInSocialFetchBackfillWindow("2026-02-28T15:45:30.249Z", cutoffAt, backfillBeforeAt), false);
  assert.equal(isInSocialFetchBackfillWindow("2026-08-31T12:45:30.249Z", cutoffAt, backfillBeforeAt), true);
  assert.equal(isInSocialFetchBackfillWindow(backfillBeforeAt, cutoffAt, backfillBeforeAt), false);
});

test("backfill scope is exactly six members plus CORE across all four paid surfaces", () => {
  const targets = socialFetchBackfillTargets().map((target) => [
    target.memberSlug ?? "core",
    target.provider,
    target.surface,
    target.handle,
  ].join(":"));
  assert.equal(targets.length, 28);
  assert.deepEqual(targets.sort(), [
    "core:tiktok:videos:officialcoreboys",
    "core:instagram:posts:createownruneverything",
    "core:instagram:reels:createownruneverything",
    "core:twitter:tweets:thecoreboys",
    "adapt:tiktok:videos:fazeadapt",
    "adapt:instagram:posts:thefazeadapt",
    "adapt:instagram:reels:thefazeadapt",
    "adapt:twitter:tweets:fazeadapt",
    "ron:tiktok:videos:realstableronaldo",
    "ron:instagram:posts:stableronaldo",
    "ron:instagram:reels:stableronaldo",
    "ron:twitter:tweets:stableronaldo",
    "lacy:tiktok:videos:lacy",
    "lacy:instagram:posts:lacy.himself",
    "lacy:instagram:reels:lacy.himself",
    "lacy:twitter:tweets:lacyhimself",
    "marlon:tiktok:videos:marlon3lg",
    "marlon:instagram:posts:marlon3lg",
    "marlon:instagram:reels:marlon3lg",
    "marlon:twitter:tweets:mar3lg",
    "jason:tiktok:videos:jasontheween",
    "jason:instagram:posts:jasontheween",
    "jason:instagram:reels:jasontheween",
    "jason:twitter:tweets:jasontheween",
    "silky:tiktok:videos:yungsilk",
    "silky:instagram:posts:silky.durag",
    "silky:instagram:reels:silky.durag",
    "silky:twitter:tweets:silkyszn",
  ].sort());
  assert.equal(socialFetchBackfillPageReservationCredits("tiktok"), 1);
  assert.equal(socialFetchBackfillPageReservationCredits("instagram"), 1);
  assert.equal(socialFetchBackfillPageReservationCredits("twitter"), 2);
});

test("page decisions require a whole old page and resume through valid empty pages", () => {
  const base = {
    cutoffAt: "2026-02-28T12:00:00.000Z",
    hasMore: true,
    currentCursor: "page-1",
    nextCursor: "page-2",
  } as const;

  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    // A pinned old post must not hide a newer item on the same page.
    createdAts: ["2025-12-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
    rawItemCount: 2,
  }), { action: "continue", nextCursor: "page-2" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    createdAts: ["2025-12-01T00:00:00.000Z", "2026-02-27T23:59:59.999Z"],
    rawItemCount: 2,
  }), { action: "complete", reason: "cutoff_reached" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    // The exact lower boundary belongs to the six-month window.
    createdAts: ["2026-02-28T12:00:00.000Z"],
    rawItemCount: 1,
  }), { action: "continue", nextCursor: "page-2" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    // Invalid rows cannot prove the provider crossed the cutoff.
    createdAts: ["2026-02-27T00:00:00.000Z"],
    rawItemCount: 2,
  }), { action: "continue", nextCursor: "page-2" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    createdAts: [],
    rawItemCount: 0,
  }), { action: "continue", nextCursor: "page-2" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    createdAts: [],
    rawItemCount: 0,
    hasMore: false,
  }), { action: "complete", reason: "provider_exhausted" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    createdAts: [],
    rawItemCount: 0,
    nextCursor: null,
  }), { action: "blocked", reason: "missing_cursor" });
  assert.deepEqual(socialFetchBackfillPageDecision({
    ...base,
    createdAts: [],
    rawItemCount: 0,
    nextCursor: "page-1",
  }), { action: "blocked", reason: "repeated_cursor" });
});

test("persistence includes the exact lower bound, skips current posts, and forces notify false", async () => {
  const target: SocialFetchBackfillTarget = {
    provider: "tiktok",
    surface: "videos",
    handle: "fazeadapt",
    memberSlug: "adapt",
    accountLabel: "Adapt",
  };
  const recorded: Array<{ canonicalId: string; notify?: boolean; publishedAt: string }> = [];
  const itemRows: ReadonlyArray<readonly [string, string]> = [
    ["before-cutoff", "2026-02-28T11:59:59.999Z"],
    ["at-cutoff", "2026-02-28T12:00:00.000Z"],
    ["inside-window", "2026-06-01T12:00:00.000Z"],
    ["last-history-ms", "2026-08-28T08:59:59.999Z"],
    ["current-window", "2026-08-28T09:00:00.000Z"],
  ];
  const items = itemRows.map(([id, createdAt], index) => ({
    id: `76101234567890123${index}`,
    caption: id,
    createdAt,
    sourceUrl: `https://www.tiktok.com/@fazeadapt/video/76101234567890123${index}`,
  }));

  const result = await persistSocialFetchBackfillPage({
    target,
    items,
    cutoffAt: "2026-02-28T12:00:00.000Z",
    backfillBeforeAt: "2026-08-28T09:00:00.000Z",
  }, {
    recordEvent: async (event) => {
      recorded.push({
        canonicalId: event.canonicalId,
        notify: event.notify,
        publishedAt: event.publishedAt,
      });
      return { id: event.canonicalId, created: true };
    },
  });

  assert.deepEqual(result, { considered: 3, created: 3 });
  assert.deepEqual(
    recorded.map(({ publishedAt }) => publishedAt),
    [
      "2026-02-28T12:00:00.000Z",
      "2026-06-01T12:00:00.000Z",
      "2026-08-28T08:59:59.999Z",
    ],
  );
  assert.ok(recorded.every((event) => event.notify === false));
  assert.ok(recorded.every((event) => event.canonicalId.startsWith("tiktok:")));
});

test("X history stores authored posts silently and excludes replies, retweets, and current content", async () => {
  const target: SocialFetchBackfillTarget = {
    provider: "twitter",
    surface: "tweets",
    handle: "fazeadapt",
    memberSlug: "adapt",
    accountLabel: "Adapt · @fazeadapt",
  };
  const recorded: Array<{
    provider: string;
    contentType: string;
    canonicalId: string;
    notify?: boolean;
  }> = [];
  const tweet = (id: string, createdAt: string, flags: { isReply?: boolean; isRetweet?: boolean } = {}) => ({
    id,
    text: `Post ${id}`,
    createdAt,
    sourceUrl: `https://x.com/FaZeAdapt/status/${id}`,
    mediaType: "text" as const,
    isReply: flags.isReply ?? false,
    isRetweet: flags.isRetweet ?? false,
  });

  const result = await persistSocialFetchBackfillPage({
    target,
    items: [
      tweet("2012345678901234501", "2026-06-01T12:00:00.000Z"),
      tweet("2012345678901234502", "2026-06-02T12:00:00.000Z", { isReply: true }),
      tweet("2012345678901234503", "2026-06-03T12:00:00.000Z", { isRetweet: true }),
      tweet("2012345678901234504", "2026-08-28T09:00:00.000Z"),
    ],
    cutoffAt: "2026-02-28T12:00:00.000Z",
    backfillBeforeAt: "2026-08-28T09:00:00.000Z",
  }, {
    recordEvent: async (event) => {
      recorded.push({
        provider: event.provider,
        contentType: event.contentType,
        canonicalId: event.canonicalId,
        notify: event.notify,
      });
      return { id: event.canonicalId, created: true };
    },
  });

  assert.deepEqual(result, { considered: 1, created: 1 });
  assert.deepEqual(recorded, [{
    provider: "x",
    contentType: "post",
    canonicalId: "x:2012345678901234501",
    notify: false,
  }]);
});

test("backfill state is resumable and has independent hard job limits", () => {
  const migration = source("scripts/migrations/044_social_fetch_backfill.sql");
  const backfill = source("lib/social-fetch-backfill.ts");
  const runner = source("scripts/apply-web-migrations.mjs");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_fetch_backfill_jobs/);
  assert.match(migration, /cutoff_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /backfill_before_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /max_credits INTEGER NOT NULL/);
  assert.match(migration, /credits_committed INTEGER NOT NULL/);
  assert.match(migration, /lease_token UUID/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_fetch_backfill_tasks/);
  assert.match(migration, /cursor TEXT/);
  assert.match(migration, /attempt_token UUID/);
  assert.match(migration, /attempt_started_at TIMESTAMPTZ/);
  assert.match(migration, /pages_processed INTEGER NOT NULL/);
  assert.match(migration, /provider IN \('tiktok', 'instagram', 'twitter'\)/);
  assert.match(migration, /provider = 'twitter' AND surface = 'tweets'/);
  assert.match(migration, /UNIQUE \(job_id, provider, surface, handle\)/);
  assert.match(runner, /044_social_fetch_backfill\.sql/);

  const resume = backfill.slice(
    backfill.indexOf("export async function resumeSocialFetchBackfill("),
    backfill.indexOf("async function acquireJobLease("),
  );
  assert.doesNotMatch(resume, /cursor\s*=|DELETE FROM social_fetch_backfill_tasks/);
  assert.match(resume, /SET attempt_token=NULL,attempt_started_at=NULL/);
  assert.match(backfill, /input\.maxPages \?\? DEFAULT_MAX_PAGES_PER_RUN[\s\S]{0,180}MAX_PAGES_PER_RUN/);
  assert.match(backfill, /while \(pagesProcessed < maxPages\)/);
  const capCheck = backfill.indexOf("job.credits_committed + reservedCredits > job.max_credits");
  const providerFetch = backfill.indexOf("page = await fetchTaskPage(task)");
  assert.ok(capCheck >= 0 && providerFetch > capCheck);
  const attemptReservation = backfill.indexOf("SET attempt_token=$3,attempt_started_at=now()");
  assert.ok(attemptReservation >= 0 && attemptReservation < providerFetch);
  assert.match(backfill, /pause_reason='uncertain_paid_page'/);
  assert.match(backfill, /attempt_token=\$[0-9]+/);
  assert.match(backfill, /reportedCredits: page\.committedCredits/);
  // PostgreSQL cannot infer an arithmetic operator when both prepared-statement
  // operands are untyped parameters. Keep both the success and failure credit
  // reconciliation deltas explicitly integer-cast so a charged page can never
  // be stranded as an uncertain attempt after persistence.
  assert.match(backfill, /credits_committed=credits_committed\+\(\$4::int-\$7::int\)/);
  assert.match(backfill, /credits_committed=credits_committed\+\(\$4::int-\$5::int\)/);
  assert.doesNotMatch(backfill, /\(\$[0-9]+-\$[0-9]+\)/);
  assert.match(backfill, /provider === "twitter" \? 2 : 1/);

  const persist = backfill.indexOf("persisted = await persistSocialFetchBackfillPage(");
  const decide = backfill.indexOf("const decision = socialFetchBackfillPageDecision(", persist);
  const advance = backfill.indexOf("await applyPageSuccess(", decide);
  assert.ok(persist >= 0 && decide > persist && advance > decide);
});

test("historical persistence is explicitly silent even on existing fresh canonical rows", () => {
  const events = source("lib/social-events.ts");
  const backfill = source("lib/social-fetch-backfill.ts");

  assert.match(backfill, /notify:\s*false/);
  assert.match(
    events,
    /const eligibleNow = input\.notify !== false\s*&&\s*event\.notification_eligible/,
  );
});

test("the small history batch runs only after current social posts are persisted", () => {
  const reconcile = source("app/api/social/reconcile/route.ts");
  const currentLoop = reconcile.indexOf("for (const item of normalizedEvents)");
  const currentRecord = reconcile.indexOf("await recordSocialEvent(event)", currentLoop);
  const backfill = reconcile.indexOf("await processSocialFetchBackfill({ maxPages: 3 })");
  assert.ok(currentLoop >= 0 && currentRecord > currentLoop && backfill > currentRecord);
});

test("only an administrator can start, cap, pause, or resume the six-month job", () => {
  const route = source("app/api/admin/social-fetch/backfill/route.ts");
  const controlRoom = source("components/admin/SocialFetchControlRoom.tsx");

  assert.match(route, /requireAdmin/);
  assert.match(route, /requestHasSameOrigin/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(route, /const MaxCredits = z\.number\(\)\.int\(\)\.min\(1\)\.max\(100_000\)/);
  assert.match(route, /startSocialFetchBackfill\(\{[\s\S]{0,160}months: 6/);
  assert.match(route, /pauseSocialFetchBackfill/);
  assert.match(route, /resumeSocialFetchBackfill/);
  assert.match(controlRoom, /Confirm the private import credit limit before starting/);
  assert.match(controlRoom, /Six-month history import/);
  assert.match(controlRoom, /max="100000"/);
});

test("backfill operational state never changes public saved-feed or official-embed fallbacks", () => {
  const publicSources = [
    source("app/channels/[slug]/page.tsx"),
    source("components/watch/NetworkChannelPage.tsx"),
    source("components/watch/CreatorPlatformRails.tsx"),
    source("components/watch/OfficialSocialEmbedFallback.tsx"),
  ].join("\n");
  const feed = source("lib/social-feed.ts");
  const rails = source("components/watch/CreatorPlatformRails.tsx");
  const embeds = source("components/watch/OfficialSocialEmbedFallback.tsx");

  assert.doesNotMatch(
    publicSources,
    /social_fetch_backfill|six_month_backfill|history import|backfill (?:paused|capped|failed)|backfill credit/i,
  );
  assert.match(feed, /getPersistedPublicSocialFeed\(\s*"house"/);
  assert.match(feed, /getPersistedPublicSocialFeed\(\s*"core"/);
  assert.match(rails, /return rail\.items\.length === 0/);
  assert.match(embeds, /tiktokCreatorEmbed\(rail\.handle\)/);
  assert.match(embeds, /instagramPublicEmbeds\(/);
  assert.match(embeds, /TIKTOK_EMBED_SCRIPT_SRC/);
  assert.match(embeds, /INSTAGRAM_EMBED_SCRIPT_SRC/);
});

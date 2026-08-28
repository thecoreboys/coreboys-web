import assert from "node:assert/strict";
import test from "node:test";
import {
  applyXQuoteLookup,
  XFeedUpstreamError,
  buildXRecentSearchUrl,
  buildXQuoteLookupUrl,
  collectPendingXQuoteReferences,
  fetchXRecentSearchOnce,
  fetchXQuoteLookupOnce,
  newestXSnapshotStatusId,
  parseXRecentSearchResponse,
  type XFeedAccount,
  type XFeedFetch,
} from "../lib/x-feed-request";

const ACCOUNTS: readonly XFeedAccount[] = [
  { handle: "@Mar3lg", authorSlug: "marlon", authorLabel: "Marlon · @Mar3lg" },
  { handle: "@LacyHimself", authorSlug: "lacy", authorLabel: "Lacy · @LacyHimself" },
  { handle: "@SilkySzn", authorSlug: "silky", authorLabel: "Silky · @SilkySzn" },
  { handle: "@FaZeAdapt", authorSlug: "adapt", authorLabel: "Adapt · @FaZeAdapt" },
  { handle: "@StableRonaldo", authorSlug: "ron", authorLabel: "StableRonaldo · @StableRonaldo" },
  { handle: "@jasontheween", authorSlug: "jason", authorLabel: "JasonTheWeen · @jasontheween" },
  { handle: "@thecoreboys", authorSlug: null, authorLabel: "CORE · @thecoreboys" },
];

function searchPayload() {
  return {
    data: [
      {
        id: "90001",
        author_id: "u-marlon",
        community_id: "1926380245063520455",
        text: "Truncated fallback",
        note_tweet: {
          text: "Full  note text\nkept exactly",
          entities: {
            urls: [{ start: 5, end: 10, url: "https://t.co/note" }],
          },
        },
        entities: {
          hashtags: [{ start: 0, end: 5, tag: "CORE" }],
        },
        created_at: "2026-08-21T14:00:00.000Z",
        attachments: { media_keys: ["photo-1", "video-1"] },
      },
      {
        id: "80001",
        author_id: "u-adapt",
        text: "Adapt update",
        created_at: "2026-08-21T13:00:00.000Z",
      },
    ],
    includes: {
      users: [
        {
          id: "u-marlon",
          username: "Mar3lg",
          name: "Marlon",
          profile_image_url: "https://pbs.twimg.com/profile_images/marlon_normal.jpg",
          description: "Creator",
          url: "https://t.co/marlon",
          verified: true,
          verified_type: "blue",
        },
        { id: "u-adapt", username: "FaZeAdapt", name: "Adapt" },
      ],
      media: [
        {
          media_key: "photo-1",
          type: "photo",
          url: "https://pbs.twimg.com/media/photo.jpg",
          width: 1200,
          height: 1200,
        },
        {
          media_key: "video-1",
          type: "video",
          preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/video.jpg",
          width: 1080,
          height: 1920,
          duration_ms: 95_000,
          variants: [
            { bit_rate: 256_000, content_type: "video/mp4", url: "https://video.twimg.com/low.mp4" },
            { bit_rate: 2_000_000, content_type: "video/mp4", url: "https://video.twimg.com/high.mp4" },
          ],
        },
      ],
    },
    meta: { result_count: 2 },
  };
}

test("one recent-search request covers all six members plus CORE and coalesces concurrency", async () => {
  let calls = 0;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchImpl: XFeedFetch = async (input, init) => {
    calls += 1;
    capturedUrl = String(input);
    capturedInit = init;
    await gate;
    return new Response(JSON.stringify(searchPayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const first = fetchXRecentSearchOnce(ACCOUNTS, {
    bearerToken: "test-token",
    sinceId: "79999",
    fetchImpl,
  });
  const second = fetchXRecentSearchOnce(ACCOUNTS, {
    bearerToken: "test-token",
    sinceId: "79999",
    fetchImpl,
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  const [firstItems, secondItems] = await Promise.all([first, second]);

  assert.deepEqual(secondItems, firstItems);
  assert.equal(firstItems.length, 3);
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.origin + requestUrl.pathname, "https://api.x.com/2/tweets/search/recent");
  const query = requestUrl.searchParams.get("query") ?? "";
  for (const account of ACCOUNTS) {
    assert.match(query.toLowerCase(), new RegExp(`from:${account.handle.slice(1).toLowerCase()}`));
  }
  assert.match(query, /-is:reply/);
  assert.match(query, /-is:retweet/);
  assert.equal(requestUrl.searchParams.get("max_results"), "100");
  assert.equal(requestUrl.searchParams.get("since_id"), "79999");
  assert.match(requestUrl.searchParams.get("tweet.fields") ?? "", /note_tweet/);
  assert.match(requestUrl.searchParams.get("tweet.fields") ?? "", /entities/);
  assert.match(requestUrl.searchParams.get("tweet.fields") ?? "", /community_id/);
  assert.equal(
    requestUrl.searchParams.get("expansions"),
    "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
  );
  assert.equal(capturedInit?.method, "GET");
  assert.equal(capturedInit?.cache, "no-store");
  assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer test-token");
});

test("parser preserves full note text, media, author metadata, and canonical permalinks", () => {
  const items = parseXRecentSearchResponse(searchPayload(), ACCOUNTS);
  const [photo, video, text] = items;

  assert.ok(photo);
  assert.ok(video);
  assert.ok(text);
  assert.equal(photo.title, "Full  note text\nkept exactly");
  assert.equal(video.title, "Full  note text\nkept exactly");
  assert.equal(photo.sourceUrl, "https://x.com/Mar3lg/status/90001/photo/1");
  assert.equal(video.sourceUrl, "https://x.com/Mar3lg/status/90001/video/2");
  assert.equal(photo.x?.statusUrl, "https://x.com/Mar3lg/status/90001");
  assert.equal(photo.x?.communityId, "1926380245063520455");
  assert.equal(photo.x?.authorHandle, "@Mar3lg");
  assert.equal(photo.x?.authorName, "Marlon");
  assert.equal(photo.x?.authorAvatarUrl, "https://pbs.twimg.com/profile_images/marlon_normal.jpg");
  assert.equal(photo.x?.noteText, "Full  note text\nkept exactly");
  assert.deepEqual(photo.x?.entities?.hashtags, [
    { start: 0, end: 5, tag: "CORE" },
  ]);
  assert.equal(photo.mediaType, "image");
  assert.equal(photo.format, "photo");
  assert.equal(video.mediaUrl, "https://video.twimg.com/high.mp4");
  assert.equal(video.thumbnailUrl, "https://pbs.twimg.com/ext_tw_video_thumb/video.jpg");
  assert.equal(video.duration, "1:35");
  assert.equal(video.format, "short");
  assert.equal(text.sourceUrl, "https://x.com/FaZeAdapt/status/80001");
  assert.equal(text.mediaType, "text");
});

test("recent-search cursor comes from the newest validated durable snapshot status", () => {
  const items = parseXRecentSearchResponse(searchPayload(), ACCOUNTS);
  assert.equal(newestXSnapshotStatusId(items), "90001");

  const poisoned = {
    ...items[0]!,
    publishedAt: "2026-08-22T14:00:00.000Z",
    x: {
      ...items[0]!.x!,
      statusId: "99999",
      statusUrl: "https://x.com/Mar3lg/status/88888",
    },
  };
  assert.equal(newestXSnapshotStatusId([...items, poisoned]), "90001");

  const invalidCursorUrl = buildXRecentSearchUrl(ACCOUNTS, "bad OR since_id:99999");
  assert.ok(invalidCursorUrl);
  assert.equal(new URL(invalidCursorUrl).searchParams.has("since_id"), false);
});

test("parser keeps every returned post without a second per-account clip", () => {
  const payload = {
    data: [
      { id: "3", author_id: "a", text: "A newest", created_at: "2026-08-21T15:00:00Z" },
      { id: "2", author_id: "a", text: "A older", created_at: "2026-08-21T14:00:00Z" },
      { id: "1", author_id: "b", text: "B post", created_at: "2026-08-21T13:00:00Z" },
    ],
    includes: {
      users: [
        { id: "a", username: "Mar3lg" },
        { id: "b", username: "FaZeAdapt" },
      ],
    },
    meta: { result_count: 3 },
  };

  const items = parseXRecentSearchResponse(payload, ACCOUNTS);
  assert.deepEqual(items.map((item) => item.x?.statusId), ["3", "2", "1"]);
  assert.deepEqual(new Set(items.map((item) => item.authorSlug)), new Set(["marlon", "adapt"]));
});

test("parser retains quoted posts from the same roster response", () => {
  const items = parseXRecentSearchResponse({
    data: [{
      id: "91001",
      author_id: "a",
      text: "Adding context",
      created_at: "2026-08-21T15:00:00Z",
      referenced_tweets: [{ type: "quoted", id: "81001" }],
    }],
    includes: {
      users: [
        { id: "a", username: "Mar3lg", name: "Marlon" },
        { id: "q", username: "QuotedCreator", name: "Quoted Creator", profile_image_url: "https://pbs.twimg.com/quoted.jpg" },
      ],
      tweets: [{
        id: "81001",
        author_id: "q",
        text: "The actual post viewers should be able to preview first.",
        created_at: "2026-08-21T14:30:00Z",
        attachments: { media_keys: ["quote-photo"] },
        entities: {
          urls: [{
            start: 0,
            end: 21,
            url: "https://t.co/video",
            unwound_url: "https://www.youtube.com/watch?v=quote-video",
            title: "Quoted video",
          }],
        },
      }],
      media: [{
        media_key: "quote-photo",
        type: "photo",
        url: "https://pbs.twimg.com/media/quoted-photo.jpg",
        width: 1200,
        height: 800,
      }],
    },
    meta: { result_count: 1 },
  }, ACCOUNTS);

  assert.deepEqual(items[0]?.x?.quote, {
    statusId: "81001",
    statusUrl: "https://x.com/QuotedCreator/status/81001",
    text: "The actual post viewers should be able to preview first.",
    authorName: "Quoted Creator",
    authorHandle: "@QuotedCreator",
    authorProfileUrl: "https://x.com/QuotedCreator",
    authorAvatarUrl: "https://pbs.twimg.com/quoted.jpg",
    imageUrl: "https://pbs.twimg.com/media/quoted-photo.jpg",
    media: [{
      mediaKey: "quote-photo",
      kind: "image",
      thumbnailUrl: "https://pbs.twimg.com/media/quoted-photo.jpg",
      width: 1200,
      height: 800,
    }],
    entities: {
      urls: [{
        start: 0,
        end: 21,
        url: "https://t.co/video",
        unwound_url: "https://www.youtube.com/watch?v=quote-video",
        title: "Quoted video",
      }],
    },
  });
});

test("bounded central quote lookup enriches a legacy snapshot without a visitor request", async () => {
  const [legacy] = parseXRecentSearchResponse({
    data: [{
      id: "92001",
      author_id: "a",
      text: "Context https://t.co/quoted",
      created_at: "2026-08-21T15:00:00Z",
      referenced_tweets: [{ type: "quoted", id: "82001" }],
      entities: {
        urls: [{
          start: 8,
          end: 28,
          url: "https://t.co/quoted",
          expanded_url: "https://x.com/QuoteAuthor/status/82001",
        }],
      },
    }],
    includes: { users: [{ id: "a", username: "Mar3lg", name: "Marlon" }] },
    meta: { result_count: 1 },
  }, ACCOUNTS);
  assert.ok(legacy);
  const references = collectPendingXQuoteReferences([legacy]);
  assert.deepEqual(references, [{ statusId: "82001", statusUrl: "https://x.com/QuoteAuthor/status/82001" }]);

  let requestedUrl = "";
  const result = await fetchXQuoteLookupOnce(references, {
    bearerToken: "test-token",
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        data: [{
          id: "82001",
          author_id: "q",
          text: "The full quoted post is now stored in the shared snapshot.",
          created_at: "2026-08-21T14:30:00Z",
          attachments: { media_keys: ["quote-video"] },
        }],
        includes: {
          users: [{ id: "q", username: "QuoteAuthor", name: "Quote Author" }],
          media: [{
            media_key: "quote-video",
            type: "video",
            preview_image_url: "https://pbs.twimg.com/ext/quoted-video.jpg",
            width: 1920,
            height: 1080,
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const lookupUrl = new URL(requestedUrl);
  assert.equal(lookupUrl.origin + lookupUrl.pathname, "https://api.x.com/2/tweets");
  assert.equal(lookupUrl.searchParams.get("ids"), "82001");
  assert.equal(lookupUrl.searchParams.get("expansions"), "attachments.media_keys,author_id");
  assert.equal(result.quotes.get("82001")?.authorName, "Quote Author");
  assert.deepEqual(result.quotes.get("82001")?.media, [{
    mediaKey: "quote-video",
    kind: "video",
    thumbnailUrl: "https://pbs.twimg.com/ext/quoted-video.jpg",
    width: 1920,
    height: 1080,
  }]);

  const [enriched] = applyXQuoteLookup([legacy], result);
  assert.equal(enriched?.x?.quote?.text, "The full quoted post is now stored in the shared snapshot.");
  assert.equal(enriched?.x?.quoteReference, undefined);
});

test("quote lookup marks an absent protected or deleted ID unavailable so it is not retried", async () => {
  const references = [{ statusId: "83001", statusUrl: "https://x.com/QuoteAuthor/status/83001" }];
  const result = await fetchXQuoteLookupOnce(references, {
    bearerToken: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  assert.equal(result.unavailableIds.has("83001"), true);
  const [legacy] = parseXRecentSearchResponse({
    data: [{
      id: "93001",
      author_id: "a",
      text: "A quote that is no longer available.",
      created_at: "2026-08-21T15:00:00Z",
      referenced_tweets: [{ type: "quoted", id: "83001" }],
    }],
    includes: { users: [{ id: "a", username: "Mar3lg", name: "Marlon" }] },
    meta: { result_count: 1 },
  }, ACCOUNTS);
  assert.ok(legacy);
  const [markedUnavailable] = applyXQuoteLookup([legacy], result);
  assert.equal(markedUnavailable?.x?.quoteReference?.unavailable, true);
  assert.deepEqual(collectPendingXQuoteReferences(markedUnavailable ? [markedUnavailable] : []), []);
  assert.equal(buildXQuoteLookupUrl(Array.from({ length: 30 }, (_, index) => String(90_000 + index)))
    ?.split("?")[0], "https://api.x.com/2/tweets");
});

test("valid empty searches return [] while credential, HTTP, and payload failures throw", async () => {
  const emptyFetch: XFeedFetch = async () => new Response(
    JSON.stringify({ meta: { result_count: 0 } }),
    { status: 200 },
  );
  assert.deepEqual(await fetchXRecentSearchOnce(ACCOUNTS, {
    bearerToken: "test-token",
    fetchImpl: emptyFetch,
  }), []);

  await assert.rejects(
    fetchXRecentSearchOnce(ACCOUNTS, { bearerToken: "", fetchImpl: emptyFetch }),
    /X_BEARER_TOKEN is not configured/,
  );
  await assert.rejects(
    fetchXRecentSearchOnce(ACCOUNTS, {
      bearerToken: "test-token",
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    }),
    /HTTP 403/,
  );
  assert.throws(
    () => parseXRecentSearchResponse({}, ACCOUNTS),
    XFeedUpstreamError,
  );
  const malformedCommunity = searchPayload();
  malformedCommunity.data[0]!.community_id = "not-a-community-id";
  assert.throws(
    () => parseXRecentSearchResponse(malformedCommunity, ACCOUNTS),
    /malformed Community id/,
  );
});

test("query builder rejects invalid handles instead of allowing query injection", () => {
  const url = buildXRecentSearchUrl([
    { handle: "good_handle", authorSlug: "good", authorLabel: "Good" },
    { handle: "bad OR from:attacker", authorSlug: "bad", authorLabel: "Bad" },
  ]);
  assert.ok(url);
  const query = new URL(url).searchParams.get("query") ?? "";
  assert.match(query, /from:good_handle/);
  assert.doesNotMatch(query, /attacker/);
});

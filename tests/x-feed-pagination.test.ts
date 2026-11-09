import assert from "node:assert/strict";
import test from "node:test";
import { advanceXSearchPage, type XSearchContinuation } from "../lib/x-feed-pagination";
import { fetchXRecentSearchPageOnce, type XFeedFetch, type XRecentSearchPage } from "../lib/x-feed-request";

const accounts = [{ handle: "drewwall_", authorSlug: "crew:drew-wall", authorLabel: "Drew Wall" }];

function payload(newest: number, count: number, nextToken?: string) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: String(newest - index), author_id: "drew", text: `Post ${newest - index}`,
      created_at: new Date(Date.UTC(2026, 10, 8) + (newest - index) * 1000).toISOString(),
    })),
    includes: { users: [{ id: "drew", username: "drewwall_" }] },
    meta: { result_count: count, ...(nextToken ? { next_token: nextToken } : {}) },
  };
}

test("250 backlog posts are retained across three budgeted polls without advancing the cursor early", async () => {
  let calls = 0;
  const requests: URL[] = [];
  const responses = [payload(30250, 100, "PAGE2"), payload(30150, 100, "PAGE3"), payload(30050, 50)];
  const fetchImpl: XFeedFetch = async (input) => {
    requests.push(new URL(String(input)));
    return Response.json(responses[calls++]);
  };
  let searchCursor = "30000";
  let continuation: XSearchContinuation | null = null;
  const retained = new Set<string>();
  for (let run = 0; run < 3; run += 1) {
    const sinceId: string | undefined = continuation ? continuation.sinceId : searchCursor;
    const page: XRecentSearchPage = await fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", sinceId, nextToken: continuation?.nextToken, fetchImpl });
    for (const item of page.items) retained.add(item.x!.statusId);
    const progress: ReturnType<typeof advanceXSearchPage> = advanceXSearchPage(page, { sinceId, highWatermark: continuation?.highWatermark });
    if (progress.searchCursor) searchCursor = progress.searchCursor;
    continuation = progress.continuation;
    assert.equal(searchCursor, run < 2 ? "30000" : "30250");
    assert.equal(calls, run + 1, "each scheduled run makes one provider request");
  }
  assert.equal(retained.size, 250);
  assert.equal(continuation, null);
  assert.deepEqual(requests.map((url) => url.searchParams.get("since_id")), ["30000", "30000", "30000"]);
  assert.deepEqual(requests.map((url) => url.searchParams.get("next_token")), [null, "PAGE2", "PAGE3"]);
});

test("a failed continuation can retry the same boundary and token without dropping pending posts", async () => {
  const first = await fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", fetchImpl: async () => Response.json(payload(30200, 100, "RETRY")) });
  const pending = advanceXSearchPage(first, {}).continuation!;
  assert.equal(pending.sinceId, undefined, "initial crew coverage has no old account's lower boundary");
  assert.equal(pending.highWatermark, "30200");
  await assert.rejects(fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", nextToken: pending.nextToken, fetchImpl: async () => new Response(null, { status: 503 }) }));
  const retry = await fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", nextToken: pending.nextToken, fetchImpl: async (input) => {
    assert.equal(new URL(String(input)).searchParams.get("next_token"), "RETRY");
    return Response.json(payload(30100, 100));
  } });
  const completed = advanceXSearchPage(retry, pending);
  assert.equal(completed.searchCursor, "30200", "older last-page posts cannot lower the completed watermark");
  assert.equal(completed.continuation, null);
});

test("invalid/repeated pagination metadata fails closed instead of declaring a truncated window complete", async () => {
  for (const nextToken of ["", 123, "x".repeat(4097)]) {
    await assert.rejects(fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", fetchImpl: async () => Response.json({ ...payload(30100, 1), meta: { next_token: nextToken } }) }));
  }
  await assert.rejects(fetchXRecentSearchPageOnce(accounts, { bearerToken: "test", nextToken: "REPEATED", fetchImpl: async () => Response.json(payload(30100, 1, "REPEATED")) }));
});

test("an empty final page still commits the accumulated high-water mark", () => {
  assert.deepEqual(advanceXSearchPage({ items: [], nextToken: null }, { sinceId: "30000", highWatermark: "30250" }), {
    searchCursor: "30250", continuation: null,
  });
});

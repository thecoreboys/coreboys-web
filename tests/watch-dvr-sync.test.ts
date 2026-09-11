import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { MY_LIST_REQUEST_TIMEOUT_MS, readMyList, readMyListStatus, selectMyListAccount, syncMyList, toggleMyList } from "../lib/watch/mylist";
import { listAccountMatches } from "../lib/watch/list-account";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
let account = 0;
beforeEach(() => { selectMyListAccount(`dvr-test-${++account}`); });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("a page of DVR cards shares one account request and a short fresh result", async (t) => {
  let respond!: (response: Response) => void;
  const fetchMock = t.mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { respond = resolve; }));
  const requests = Array.from({ length: 40 }, () => syncMyList(`dvr-test-${account}`));
  await settle();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(readMyListStatus().syncing, true);
  respond(Response.json({ accountId: `dvr-test-${account}`, ids: ["saved-video"] }));
  await Promise.all(requests);
  await syncMyList(`dvr-test-${account}`);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(readMyList(), ["saved-video"]);
  assert.equal(readMyListStatus().syncing, false);
});

test("a late account read cannot erase a new save", async (t) => {
  let respond!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => options.method === "GET"
    ? new Promise<Response>((resolve) => { respond = resolve; })
    : Promise.resolve(Response.json({ ok: true })));
  const request = syncMyList(`dvr-test-${account}`);
  await settle();
  toggleMyList("new-video");
  respond(Response.json({ accountId: `dvr-test-${account}`, ids: [] }));
  await request;
  await settle();
  assert.deepEqual(readMyList(), ["new-video"]);
});

test("rapid save and remove writes arrive in viewer order", async (t) => {
  const writes: Array<{ accountId: string; id: string; saved: boolean }> = [];
  let finishFirst!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    writes.push(JSON.parse(options.body as string));
    return writes.length === 1 ? new Promise<Response>((resolve) => { finishFirst = resolve; }) : Promise.resolve(Response.json({ ok: true }));
  });
  toggleMyList("same-video");
  toggleMyList("same-video");
  await settle();
  assert.deepEqual(writes, [{ accountId: `dvr-test-${account}`, id: "same-video", saved: true }]);
  finishFirst(Response.json({ ok: true }));
  await settle();
  assert.deepEqual(writes, [{ accountId: `dvr-test-${account}`, id: "same-video", saved: true }, { accountId: `dvr-test-${account}`, id: "same-video", saved: false }]);
  assert.deepEqual(readMyList(), []);
});

test("a rejected save rolls back and exposes an actionable error", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json({ error: "unavailable" }, { status: 503 })));
  toggleMyList("unsaved-video");
  assert.deepEqual(readMyList(), ["unsaved-video"]);
  await settle();
  assert.deepEqual(readMyList(), []);
  assert.match(readMyListStatus().error ?? "", /could not be saved/);
});

test("a response from a signed-out account cannot populate the next account", async (t) => {
  let respond!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { respond = resolve; }));
  const request = syncMyList(`dvr-test-${account}`);
  await settle();
  selectMyListAccount("different-account");
  respond(Response.json({ accountId: `dvr-test-${account}`, ids: ["private-video"] }));
  await request;
  assert.deepEqual(readMyList(), []);
  assert.equal(storage.has("coreboys-watch-list:v1:different-account"), false);
});

test("a stale tab cannot save into the account selected by another tab's cookie", async (t) => {
  const cookieAccountId = "new-cookie-account";
  const savedForCookieAccount: string[] = [];
  let submittedAccountId = "";
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as { accountId: string; id: string };
    submittedAccountId = body.accountId;
    if (!listAccountMatches(body.accountId, cookieAccountId)) return Promise.resolve(Response.json({ error: "account_changed" }, { status: 409 }));
    savedForCookieAccount.push(body.id);
    return Promise.resolve(Response.json({ accountId: cookieAccountId, ok: true }));
  });
  toggleMyList("old-account-video");
  await settle();
  assert.equal(submittedAccountId, `dvr-test-${account}`);
  assert.deepEqual(savedForCookieAccount, []);
  assert.deepEqual(readMyList(), []);
  assert.match(readMyListStatus().error ?? "", /could not be saved/);
});

test("a stale tab never imports a list returned for another cookie account", async (t) => {
  let expectedAccountHeader = "";
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    expectedAccountHeader = new Headers(options.headers).get("x-core-account-id") ?? "";
    return Promise.resolve(Response.json({ accountId: "new-cookie-account", ids: ["private-other-account-video"] }));
  });
  await syncMyList(`dvr-test-${account}`);
  assert.equal(expectedAccountHeader, `dvr-test-${account}`);
  assert.deepEqual(readMyList(), []);
  assert.equal(storage.has(`coreboys-watch-list:v1:dvr-test-${account}`), false);
  assert.match(readMyListStatus().error ?? "", /could not sync/);
});

test("a stalled read times out, aborts, and releases the sync request for retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  let requests = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    requests += 1;
    signal = options.signal;
    return requests === 1 ? new Promise<Response>(() => {}) : Promise.resolve(Response.json({ accountId: `dvr-test-${account}`, ids: ["recovered"] }));
  });
  const request = syncMyList(`dvr-test-${account}`);
  await settle();
  const stalledSignal = signal;
  t.mock.timers.tick(MY_LIST_REQUEST_TIMEOUT_MS);
  await request;
  assert.equal(stalledSignal?.aborted, true);
  assert.equal(readMyListStatus().syncing, false);
  await syncMyList(`dvr-test-${account}`, true);
  assert.deepEqual(readMyList(), ["recovered"]);
});

test("a stalled write cannot hold later saves forever", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved: string[] = [];
  let writes = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    writes += 1;
    if (writes === 1) return new Promise<Response>(() => {});
    saved.push(JSON.parse(options.body as string).id);
    return Promise.resolve(Response.json({ ok: true }));
  });
  toggleMyList("stalled-save");
  toggleMyList("next-save");
  await settle();
  assert.equal(writes, 1);
  t.mock.timers.tick(MY_LIST_REQUEST_TIMEOUT_MS);
  await settle();
  assert.equal(writes, 2);
  assert.deepEqual(saved, ["next-save"]);
  assert.deepEqual(readMyList(), ["next-save"]);
});

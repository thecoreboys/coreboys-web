import assert from "node:assert/strict";
import test from "node:test";
import { createNativeNavigationGuard, navigationTarget, nativeNavigationAction } from "../lib/navigation-policy";
import { createNavigationHandler, type ExternalBrowserBridge, type NavigationRuntime } from "../lib/external-navigation";

const site = "https://thecoreboys.com/guide";
const campaign = "https://contentrewards.com/c/campaigns/432f45b8-ed16-4cc6-95d7-1655e6c7806a?utm_source=core";

test("CORE pages and its exact www alias stay internal", () => {
  for (const url of ["/guide?member=lacy", "#timeline", "https://thecoreboys.com/channels/adapt", "https://www.thecoreboys.com/special-message"]) {
    assert.equal(navigationTarget(url, site).kind, "internal", url);
  }
  assert.equal(navigationTarget("/guide", "http://127.0.0.1:3008/").kind, "internal");
});

test("Content Rewards, social sites and lookalike hosts are external", () => {
  for (const url of [campaign, "//contentrewards.com/c/discover", "https://youtube.com/watch?v=123", "https://thecoreboys.com.evil.example/", "https://other.thecoreboys.com/", "https://evil.example/thecoreboys.com", "https://thecoreboys.com:8443/"]) {
    assert.equal(navigationTarget(url, site).kind, "external", url);
  }
  assert.deepEqual(navigationTarget(campaign, site), { kind: "external", url: campaign });
});

test("unsafe navigation and URLs containing credentials never reach a native opener", () => {
  for (const url of ["", " ", "javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "intent://anything", "https://user:secret@contentrewards.com/c/discover", "http://["]) {
    assert.equal(navigationTarget(url, site).kind, "blocked", url);
  }
  assert.equal(navigationTarget("mailto:hello@example.com", site).kind, "system");
  assert.equal(navigationTarget("tel:+15551234567", site).kind, "system");
});

function harness(nativeBrowser?: ExternalBrowserBridge) {
  const calls: Array<[string, string?]> = [];
  const runtime: NavigationRuntime = {
    currentUrl: site, nativeBrowser,
    openNewTab: (url) => { calls.push(["new-tab", url]); },
    assign: (url) => { calls.push(["assign", url]); },
    reportError: () => { calls.push(["error"]); },
  };
  return { calls, open: createNavigationHandler(runtime) };
}

test("ordinary browser actions preserve new-tab and billing redirect behavior", () => {
  const { calls, open } = harness();
  open(campaign);
  open("https://billing.stripe.com/session/test", { fallback: "same-tab" });
  open("/guide", { fallback: "same-tab" });
  assert.deepEqual(calls, [["new-tab", campaign], ["assign", "https://billing.stripe.com/session/test"], ["assign", "https://thecoreboys.com/guide"]]);
});

test("native outbound buttons and API-returned URLs use the system bridge", () => {
  const opened: string[] = [];
  const { calls, open } = harness({ version: 1, openExternalUrl: ({ url }) => { opened.push(url); } });
  open(campaign);
  open("https://billing.stripe.com/session/test", { fallback: "same-tab" });
  assert.deepEqual(opened, [campaign, "https://billing.stripe.com/session/test"]);
  assert.deepEqual(calls, []);
});

test("native internal navigation stays in the app without opening another window", () => {
  const { calls, open } = harness({ version: 1, openExternalUrl: () => { assert.fail("Internal pages must not leave the app"); } });
  open("/channels/lacy");
  assert.deepEqual(calls, [["assign", "https://thecoreboys.com/channels/lacy"]]);
});

test("a failed native open never falls back to loading the external site in the app", async () => {
  const { calls, open } = harness({ version: 1, openExternalUrl: async () => { throw new Error("OS open failed"); } });
  open(campaign, { fallback: "same-tab" });
  await Promise.resolve();
  assert.deepEqual(calls, [["error"]]);
  const sync = harness({ version: 1, openExternalUrl: () => { throw new Error("Unavailable"); } });
  sync.open(campaign);
  assert.deepEqual(sync.calls, [["error"]]);
});

test("unsupported bridge versions and unsafe links fail closed", () => {
  const { calls, open } = harness({ version: 2, openExternalUrl: () => {} } as unknown as ExternalBrowserBridge);
  open(campaign);
  open("javascript:alert(1)");
  assert.deepEqual(calls, [["error"], ["error"]]);
});

test("the native navigation rule handles redirects and new windows outside CORE", () => {
  assert.equal(nativeNavigationAction(campaign), "open-system");
  assert.equal(nativeNavigationAction(campaign, { isMainFrame: false, isNewWindow: true }), "open-system");
  assert.equal(nativeNavigationAction("https://thecoreboys.com/guide", { isNewWindow: true }), "allow-in-app");
  assert.equal(nativeNavigationAction("https://www.thecoreboys.com/guide"), "allow-in-app");
  assert.equal(nativeNavigationAction("https://thecoreboys.com.evil.example/"), "open-system");
  assert.equal(nativeNavigationAction("javascript:alert(1)"), "block");
  assert.equal(nativeNavigationAction("https://user:secret@thecoreboys.com/"), "block");
});

test("embedded players keep loading inside their frames", () => {
  assert.equal(nativeNavigationAction("https://player.twitch.tv/?channel=lacy", { isMainFrame: false }), "allow-embedded");
  assert.equal(nativeNavigationAction("https://www.youtube.com/embed/example", { isMainFrame: false }), "allow-embedded");
  assert.equal(nativeNavigationAction("about:blank"), "allow-in-app");
});

test("a native host cancels external redirects and popups before opening the system browser", () => {
  const opened: string[] = [];
  const guard = createNativeNavigationGuard((url) => { opened.push(url); }, () => { assert.fail("Unexpected open error"); });
  assert.equal(guard({ url: campaign, isMainFrame: true }), false);
  assert.equal(guard({ url: "https://youtube.com/watch?v=123", isMainFrame: false, isNewWindow: true }), false);
  assert.equal(guard({ url: "https://thecoreboys.com/guide" }), true);
  assert.equal(guard({ url: "https://player.twitch.tv/?channel=lacy", isMainFrame: false }), true);
  assert.equal(guard({ url: "javascript:alert(1)" }), false);
  assert.deepEqual(opened, [campaign, "https://youtube.com/watch?v=123"]);
});

test("native redirect-open failures leave the external navigation canceled", async () => {
  let errors = 0;
  const guard = createNativeNavigationGuard(async () => { throw new Error("Browser unavailable"); }, () => { errors += 1; });
  assert.equal(guard({ url: campaign }), false);
  await Promise.resolve();
  assert.equal(errors, 1);
});

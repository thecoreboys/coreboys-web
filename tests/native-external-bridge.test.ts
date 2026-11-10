import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { isTrustedAppDocument, nativeExternalBridgeResult, nativeExternalBridgeScript, parseNativeBrowserRequest } from "../lib/native-external-bridge";

const nonce = "unit-test-bridge-token-1234567890";
const campaign = "https://contentrewards.com/c/campaigns/example?src=core";
const message = (overrides = {}) => JSON.stringify({ type: "core:open-external", version: 1, id: "core-test-1", nonce, url: campaign, ...overrides });

test("native messages require a trusted document, correct nonce and safe external URL", () => {
  assert.deepEqual(parseNativeBrowserRequest(message(), "https://thecoreboys.com/guide", nonce), { id: "core-test-1", url: campaign });
  for (const url of ["https://evil.example/", "https://thecoreboys.com.evil.example/", "https://user:secret@thecoreboys.com/", "about:blank"]) {
    assert.equal(isTrustedAppDocument(url), false);
    assert.equal(parseNativeBrowserRequest(message(), url, nonce), null);
  }
  for (const overrides of [{ nonce: "wrong" }, { id: "');alert(1);//" }, { url: "javascript:alert(1)" }, { url: "/account" }, { url: "https://thecoreboys.com/guide" }, { version: 2 }]) {
    assert.equal(parseNativeBrowserRequest(message(overrides), "https://thecoreboys.com/", nonce), null);
  }
  assert.equal(parseNativeBrowserRequest("x".repeat(9000), "https://thecoreboys.com/", nonce), null);
  assert.equal(parseNativeBrowserRequest("not json", "https://thecoreboys.com/", nonce), null);
});

function injectedBridge(origin = "https://thecoreboys.com", embedded = false) {
  const posted: string[] = [];
  const window: Record<string, any> = {
    location: { origin },
    ReactNativeWebView: { postMessage: (value: string) => posted.push(value) },
  };
  window.top = embedded ? {} : window;
  const context = vm.createContext({ window, Map, Promise, Date, Error, JSON, setTimeout, clearTimeout });
  vm.runInContext(nativeExternalBridgeScript(nonce), context);
  return { window, context, posted };
}

test("the injected bridge waits for the native OS-open acknowledgment", async () => {
  const { window, context, posted } = injectedBridge();
  const pending = window.CoreExternalBrowser.openExternalUrl({ url: campaign });
  const request = parseNativeBrowserRequest(posted[0]!, "https://thecoreboys.com/", nonce);
  assert.ok(request);
  vm.runInContext(nativeExternalBridgeResult(request.id, true), context);
  await pending;
  assert.equal(posted.length, 1);
});

test("native rejection propagates back to the website without navigation", async () => {
  const { window, context, posted } = injectedBridge();
  const pending = window.CoreExternalBrowser.openExternalUrl({ url: campaign });
  const id = JSON.parse(posted[0]!).id as string;
  vm.runInContext(nativeExternalBridgeResult(id, false), context);
  await assert.rejects(pending, /browser could not be opened/);
});

test("the bridge is absent from foreign pages and embedded frames", () => {
  assert.equal(injectedBridge("https://contentrewards.com").window.CoreExternalBrowser, undefined);
  assert.equal(injectedBridge("https://thecoreboys.com", true).window.CoreExternalBrowser, undefined);
});

test("repeating Android injection preserves pending requests", async () => {
  const { window, context, posted } = injectedBridge();
  const bridge = window.CoreExternalBrowser;
  const pending = bridge.openExternalUrl({ url: campaign });
  vm.runInContext(nativeExternalBridgeScript(nonce), context);
  assert.equal(window.CoreExternalBrowser, bridge);
  const id = JSON.parse(posted[0]!).id as string;
  vm.runInContext(nativeExternalBridgeResult(id, true), context);
  await pending;
});

test("response scripts reject injected code in request identifiers", () => {
  assert.equal(nativeExternalBridgeResult("');alert(1);//", true), "true;");
  assert.throws(() => nativeExternalBridgeScript("</script>"), /Invalid bridge nonce/);
});

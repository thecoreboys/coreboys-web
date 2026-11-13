import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import { isNativeAppRuntime } from "../lib/native-app";
import type { NativeAppRuntime } from "../lib/native-app";

function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const filename = resolve(path);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module, exports: module.exports, ...globals,
    require(name: string) {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith("@/") || name.endsWith(".module.css")) return {};
      return nativeRequire(name);
    },
  }, { filename });
  return module.exports as T;
}

test("installed apps are detected by their bridge rather than phone screen size", () => {
  assert.equal(isNativeAppRuntime({}), false);
  assert.equal(isNativeAppRuntime({ ReactNativeWebView: { postMessage: "not a bridge" } }), false);
  assert.equal(isNativeAppRuntime({ ReactNativeWebView: { postMessage() {} } }), true);
  assert.equal(isNativeAppRuntime({ CoreExternalBrowser: { version: 1, openExternalUrl() {} } }), true);
  assert.equal(isNativeAppRuntime({ CoreExternalBrowser: { version: 2, openExternalUrl() {} } }), false);
});

test("app detection withholds web surfaces during hydration and refreshes on document lifecycle events", () => {
  const window: EventTarget & NativeAppRuntime = Object.assign(new EventTarget(), {
    ReactNativeWebView: { postMessage() {} },
  });
  let serverSnapshot: boolean | null = false;
  let current: boolean | null = null;
  let cleanup = () => {};
  let changes = 0;
  const hook = load<{ useNativeApp: () => boolean | null }>("hooks/useNativeApp.ts", {
    "@/lib/native-app": { isNativeAppRuntime },
    react: { useSyncExternalStore: (subscribe: (change: () => void) => () => void, snapshot: () => boolean, server: () => null) => {
      serverSnapshot = server();
      current = snapshot();
      cleanup = subscribe(() => { current = snapshot(); changes++; });
      return current;
    } },
  }, { window });
  assert.equal(hook.useNativeApp(), true);
  assert.equal(serverSnapshot, null);
  delete window.ReactNativeWebView;
  window.dispatchEvent(new Event("pageshow"));
  assert.equal(current, false);
  assert.equal(changes, 1);
  cleanup();
  window.dispatchEvent(new Event("load"));
  assert.equal(changes, 1);
});

function elementTypes(node: React.ReactNode): unknown[] {
  if (Array.isArray(node)) return node.flatMap(elementTypes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node.type, ...elementTypes(node.props.children)];
}

test("the app keeps players and room controls without mounting DJ Cora or its audio effects", () => {
  for (const nativeApp of [true, null, false]) {
    const component = load<{ GlobalWatchEnhancements: () => React.ReactNode }>("components/watch/GlobalWatchEnhancements.tsx", {
      react: { ...React, useState: (value: unknown) => [typeof value === "function" ? value() : value, () => {}], useEffect() {} },
      "next/navigation": { usePathname: () => "/multiview" },
      "next/dynamic": { __esModule: true, default: (factory: () => unknown) => factory.toString().match(/require\("([^"]+)"\)/)![1]!.split("/").at(-1) },
      "@/hooks/useNativeApp": { useNativeApp: () => nativeApp },
      "@/components/providers/AuthProvider": { useAuth: () => ({ user: null }) },
      "@/components/providers/PlayerProvider": { usePlayer: () => ({ current: { id: "playing-video" } }) },
    });
    const types = elementTypes(component.GlobalWatchEnhancements());
    assert.equal(types.includes("RadioAudioSystem"), nativeApp === false);
    assert.ok(types.includes("PersistentPlayer"));
    assert.ok(types.includes("WatchTogetherBridge"));
    assert.ok(types.includes("PlayerChatCompanion"));
  }
});

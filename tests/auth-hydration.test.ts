import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { FanUser } from "../components/providers/AuthProvider";
import type * as AuthModule from "../components/providers/AuthProvider";

const requireModule = createRequire(resolve(process.cwd(), "package.json"));

test("account consumers keep the server placeholder when account data resolves before hydration", () => {
  const resolvedUser: FanUser = {
    id: "viewer", email: "viewer@example.test", displayName: "Viewer",
    emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z",
  };
  let user: FanUser | null = null;
  const modulePath = requireModule.resolve("./components/providers/AuthProvider");
  const dependencies = {
    "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
    swr: { __esModule: true, default: () => ({ data: user, isLoading: false, mutate: async () => {} }) },
  };
  const saved = new Map<string, NodeJS.Module | undefined>();
  for (const [name, exports] of Object.entries(dependencies)) {
    const key = requireModule.resolve(name);
    saved.set(key, requireModule.cache[key]);
    requireModule.cache[key] = { id: key, filename: key, loaded: true, exports } as NodeJS.Module;
  }
  saved.set(modulePath, requireModule.cache[modulePath]);
  delete requireModule.cache[modulePath];
  // Next supplies the JSX runtime; the standalone tsx test runner uses classic JSX.
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  try {
    const { AuthProvider, useAuth } = requireModule(modulePath) as typeof AuthModule;
    function Account() {
      const auth = useAuth();
      assert.equal(typeof auth.refresh, "function");
      assert.equal(typeof auth.logout, "function");
      return auth.loading
        ? createElement("span", { "aria-label": "Loading account" })
        : createElement("button", null, auth.user?.displayName ?? "Sign in");
    }
    for (const resolved of [null, resolvedUser]) {
      user = resolved;
      const markup = renderToString(createElement(AuthProvider, null, createElement(Account)));
      assert.equal(markup, '<span aria-label="Loading account"></span>',
        "the hydration snapshot must stay identical whether the request already resolved as guest or member");
    }
  } finally {
    if (previousReact) runtime.React = previousReact;
    else Reflect.deleteProperty(runtime, "React");
    for (const [key, previous] of saved) {
      if (previous) requireModule.cache[key] = previous;
      else delete requireModule.cache[key];
    }
  }
});

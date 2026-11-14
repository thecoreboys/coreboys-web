import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { THEME_BOOTSTRAP_SCRIPT, themePreference, accentPreference } from "../lib/theme";

function boot(theme: string | null, light = false, blocked = false, accent: string | null = "core") {
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" }, classList: { toggle: (_key: string, enabled: boolean) => { dark = enabled; } } };
  let dark = true;
  runInNewContext(THEME_BOOTSTRAP_SCRIPT, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: light }) },
    localStorage: { getItem: (key: string) => { if (blocked) throw new Error("blocked"); return key === "coreboys-theme" ? theme : accent; } },
  });
  return { theme: root.dataset.theme, themePreference: root.dataset.themePreference, accent: root.dataset.accent, colorScheme: root.style.colorScheme, dark };
}

test("saved preferences apply before hydration, including the system color scheme", () => {
  assert.deepEqual(boot("light", false, false, "nms"), { theme: "light", themePreference: "light", accent: "nms", colorScheme: "light", dark: false });
  assert.equal(boot("dark", true).theme, "dark");
  assert.equal(boot("system", true).theme, "light");
  assert.equal(boot("system", false).theme, "dark");
});

test("invalid and blocked preferences use the same defaults as the provider", () => {
  for (const value of [null, "invalid", "LIGHT", "<script>"]) {
    assert.equal(boot(value).theme, themePreference(value));
    assert.equal(boot("dark", false, false, value).accent, accentPreference(value));
  }
  assert.equal(boot("light", true, true).theme, "dark");
});

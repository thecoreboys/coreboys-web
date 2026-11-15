"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY, ACCENT_STORAGE_KEY, themePreference, accentPreference, type Theme, type Accent } from "@/lib/theme";
export type { Theme, Accent } from "@/lib/theme";

type Ctx = {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  accent: Accent;
  setTheme: (t: Theme) => void;
  setAccent: (accent: Accent) => void;
  toggle: () => void;
};
const ThemeCtx = createContext<Ctx>({
  theme: "dark",
  resolvedTheme: "dark",
  accent: "core",
  setTheme: () => {},
  setAccent: () => {},
  toggle: () => {},
});

function resolvedTheme(preference: Theme): "dark" | "light" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(preference: Theme, accent: Accent): "dark" | "light" {
  const resolved = resolvedTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.accent = accent;
  // Keep Untitled UI's dark tokens (.dark-mode) in sync with the resolved mode.
  document.documentElement.classList.toggle("dark-mode", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

/**
 * Theme provider — reads/writes a `data-theme` attribute on `<html>`. The
 * actual color tokens for both modes live in app/globals.css; this just
 * flips the attribute and persists the choice.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedThemeState, setResolvedThemeState] = useState<"dark" | "light">("dark");
  const [accent, setAccentState] = useState<Accent>("core");

  useEffect(() => {
    const sync = () => {
      let saved = themePreference(document.documentElement.dataset.themePreference ?? null);
      let savedAccent = accentPreference(document.documentElement.dataset.accent ?? null);
      try { saved = themePreference(localStorage.getItem(STORAGE_KEY)); } catch { /* storage can be blocked */ }
      try { savedAccent = accentPreference(localStorage.getItem(ACCENT_STORAGE_KEY)); } catch { /* storage can be blocked */ }
      setThemeState(saved);
      setAccentState(savedAccent);
      setResolvedThemeState(applyTheme(saved, savedAccent));
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY || event.key === ACCENT_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setResolvedThemeState(applyTheme("system", accent));
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [accent, theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setResolvedThemeState(applyTheme(t, accent));
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, [accent]);

  const setAccent = useCallback((nextAccent: Accent) => {
    setAccentState(nextAccent);
    setResolvedThemeState(applyTheme(theme, nextAccent));
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, nextAccent);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(resolvedThemeState === "dark" ? "light" : "dark");
  }, [resolvedThemeState, setTheme]);

  return <ThemeCtx.Provider value={{ theme, resolvedTheme: resolvedThemeState, accent, setTheme, setAccent, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

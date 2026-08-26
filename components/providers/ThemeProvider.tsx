"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type Accent = "core" | "stable" | "thugs" | "flock" | "nms" | "m3";
const STORAGE_KEY = "coreboys-theme";
const ACCENT_STORAGE_KEY = "coreboys-accent";

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

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function isAccent(value: string | null): value is Accent {
  return value === "core" || value === "stable" || value === "thugs" || value === "flock" || value === "nms" || value === "m3";
}

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
    try {
      const storedTheme = localStorage.getItem(STORAGE_KEY);
      const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
      const saved = isTheme(storedTheme) ? storedTheme : "dark";
      const savedAccent = isAccent(storedAccent) ? storedAccent : "core";
      setThemeState(saved);
      setAccentState(savedAccent);
      setResolvedThemeState(applyTheme(saved, savedAccent));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setResolvedThemeState(applyTheme("system", accent));
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
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return <ThemeCtx.Provider value={{ theme, resolvedTheme: resolvedThemeState, accent, setTheme, setAccent, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

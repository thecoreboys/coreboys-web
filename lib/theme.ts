export const THEME_STORAGE_KEY = "coreboys-theme";
export const ACCENT_STORAGE_KEY = "coreboys-accent";
export const THEMES = ["dark", "light", "system"] as const;
export const ACCENTS = ["core", "stable", "thugs", "flock", "nms", "m3"] as const;
export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];

export function themePreference(value: string | null): Theme {
  return THEMES.includes(value as Theme) ? value as Theme : "dark";
}

export function accentPreference(value: string | null): Accent {
  return ACCENTS.includes(value as Accent) ? value as Accent : "core";
}

// Runs in <head>, before any page content can paint. Keep the same defaults
// as the provider, including when storage is disabled by the browser.
export const THEME_BOOTSTRAP_SCRIPT = `(function(){
  var theme="dark",accent="core",root=document.documentElement;
  try { var saved=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); if(${JSON.stringify(THEMES)}.indexOf(saved)!==-1) theme=saved; } catch(e) {}
  try { var saved=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)}); if(${JSON.stringify(ACCENTS)}.indexOf(saved)!==-1) accent=saved; } catch(e) {}
  var resolved=theme==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;
  root.dataset.theme=resolved; root.dataset.themePreference=theme; root.dataset.accent=accent;
  root.classList.toggle("dark-mode",resolved==="dark"); root.style.colorScheme=resolved;
})();`;

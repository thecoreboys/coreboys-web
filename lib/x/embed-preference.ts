export const X_EMBED_PREFERENCE_KEY = "coreboys-x-embeds";
export const X_EMBED_PREFERENCE_EVENT = "coreboys:x-embed-preference";
export type XEmbedPreference = "ask" | "always";

export function parseXEmbedPreference(value: unknown): XEmbedPreference {
  return value === "always" ? "always" : "ask";
}

/** GPC/Data Saver keeps every embed click-to-load even after an always choice. */
export function shouldAutoLoadXEmbed(preference: XEmbedPreference, privacySignal: boolean): boolean {
  return preference === "always" && !privacySignal;
}

export function setXEmbedPreference(preference: XEmbedPreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(X_EMBED_PREFERENCE_KEY, preference);
  window.dispatchEvent(new CustomEvent(X_EMBED_PREFERENCE_EVENT, { detail: { preference } }));
}

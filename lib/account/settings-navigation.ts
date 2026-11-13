export const SETTINGS_PATH = "/account/settings";

/** Nested anchors that live inside a section; links to them open that section. */
const NESTED_SECTION_ANCHORS: Record<string, string> = {
  "account-deletion": "privacy",
  "data-export": "privacy",
  connections: "connected-accounts",
  "public-profile": "profile",
  email: "profile",
  password: "security",
  sessions: "security",
  "go-live-notifications": "notifications",
};

/** Map legacy and nested links to the settings section that owns them. */
export function settingsSectionFromLocation(hash: string, hasOAuthResult: boolean): string {
  const target = hash.replace(/^#/, "");
  if (NESTED_SECTION_ANCHORS[target]) return NESTED_SECTION_ANCHORS[target];
  if (!target && hasOAuthResult) return "connected-accounts";
  return target || "profile";
}

/**
 * Resolve an in-page settings link (for example `/account/settings#security`
 * or `#notifications`) to the hash it targets. Returns null for links that
 * leave the settings page, so normal navigation continues for those.
 *
 * Next.js `<Link>` performs same-page hash navigation with `history.pushState`,
 * which fires neither `hashchange` nor `popstate`. The settings page resolves
 * clicks with this helper instead of relying on those events.
 */
export function settingsHashFromHref(href: string, currentUrl: string): string | null {
  let target: URL;
  let current: URL;
  try {
    current = new URL(currentUrl);
    target = new URL(href, current);
  } catch {
    return null;
  }
  if (target.origin !== current.origin) return null;
  if (target.pathname.replace(/\/+$/, "") !== SETTINGS_PATH) return null;
  if (!target.hash || target.hash === "#") return null;
  // A link that changes the query (for example an OAuth result) is a real navigation.
  if (target.search !== current.search && target.search !== "") return null;
  return target.hash.slice(1);
}

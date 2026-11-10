/** Map legacy and nested links to the settings section that owns them. */
export function settingsSectionFromLocation(hash: string, hasOAuthResult: boolean): string {
  const target = hash.replace(/^#/, "");
  if (target === "account-deletion") return "privacy";
  if (target === "connections" || (!target && hasOAuthResult)) return "connected-accounts";
  return target || "profile";
}

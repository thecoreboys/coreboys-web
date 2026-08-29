const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "account", "accounts", "login", "logout", "settings",
  "support", "help", "about", "passport", "u", "www", "core", "thecoreboys",
]);
const BLOCKED_TERMS = ["nazi", "nigger", "faggot", "rape", "terrorist", "killall"];

export function normalizePublicHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function validatePublicHandle(value: string): { ok: true; handle: string } | { ok: false; error: string } {
  const handle = normalizePublicHandle(value);
  if (!handle) return { ok: false, error: "Enter a public handle." };
  if (handle.length < 3 || handle.length > 32 || !HANDLE_PATTERN.test(handle)) {
    return { ok: false, error: "Use 3–32 lowercase letters, numbers, or single dashes." };
  }
  if (RESERVED_HANDLES.has(handle) || BLOCKED_TERMS.some((term) => handle.includes(term))) {
    return { ok: false, error: "That handle is not available." };
  }
  return { ok: true, handle };
}

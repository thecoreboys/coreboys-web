export type AuthModalMode = "login" | "signup";

export type AuthModalRequest = {
  mode?: AuthModalMode;
  next?: string | null;
};

export const AUTH_MODAL_EVENT = "core:auth-open";

/** Opens the shared, route-free account dialog from any client interaction. */
export function openAuthModal(request: AuthModalRequest = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthModalRequest>(AUTH_MODAL_EVENT, { detail: request }));
}

import type { catalogForClient } from "./catalog";
import type { AccountSubscriptionState } from "./entitlements";

/** Shared response contract for the read-only account subscription endpoint. */
export type AccountSubscriptionApiResponse = AccountSubscriptionState & {
  catalog: ReturnType<typeof catalogForClient>;
};

export type AccountSubscriptionApiError = {
  error: "unauthorized";
};

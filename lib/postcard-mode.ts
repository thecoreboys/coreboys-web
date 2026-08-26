/**
 * Server-side provider mode gate for paid postcards.
 *
 * Physical mail is irreversible, so Stripe and Lob must always be in the
 * same environment. The only keyless mode is a fully local sandbox; partial
 * or mixed configuration is deliberately invalid.
 */
export type PostcardProviderMode = "sandbox" | "test" | "live";

export type PostcardProviderConfiguration =
  | { ok: true; mode: PostcardProviderMode }
  | { ok: false; mode: "invalid"; reason: string };

type ProviderEnvironment = {
  STRIPE_SECRET_KEY?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  LOB_API_KEY?: string;
  NODE_ENV?: string;
};

type KeyMode = "absent" | "test" | "live" | "unknown";

function stripeKeyMode(key: string | undefined): KeyMode {
  if (!key) return "absent";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

function lobKeyMode(key: string | undefined): KeyMode {
  if (!key) return "absent";
  if (key.startsWith("test_")) return "test";
  if (key.startsWith("live_")) return "live";
  return "unknown";
}

function stripePublishableKeyMode(key: string | undefined): KeyMode {
  if (!key) return "absent";
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return "unknown";
}

function webhookSecretReady(secret: string | undefined): boolean {
  return Boolean(secret?.startsWith("whsec_") && secret.length > "whsec_".length);
}

export function resolvePostcardProviderMode(
  environment: ProviderEnvironment = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    LOB_API_KEY: process.env.LOB_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  },
): PostcardProviderConfiguration {
  const stripe = stripeKeyMode(environment.STRIPE_SECRET_KEY?.trim());
  const publishable = stripePublishableKeyMode(
    environment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
  const webhook = environment.STRIPE_WEBHOOK_SECRET?.trim();
  const lob = lobKeyMode(environment.LOB_API_KEY?.trim());

  if (stripe === "absent" && publishable === "absent" && !webhook && lob === "absent") {
    if (environment.NODE_ENV === "production") {
      return {
        ok: false,
        mode: "invalid",
        reason: "Keyless postcard sandbox is disabled in production.",
      };
    }
    return { ok: true, mode: "sandbox" };
  }
  if (stripe === "test" && publishable === "test" && webhookSecretReady(webhook) && lob === "test") {
    return { ok: true, mode: "test" };
  }
  if (stripe === "live" && publishable === "live" && webhookSecretReady(webhook) && lob === "live") {
    return { ok: true, mode: "live" };
  }

  return {
    ok: false,
    mode: "invalid",
    reason: `Postcard providers must be paired and complete (Stripe: ${stripe}; publishable: ${publishable}; webhook: ${webhookSecretReady(webhook) ? "ready" : "missing"}; Lob: ${lob}).`,
  };
}

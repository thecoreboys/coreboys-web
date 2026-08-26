/**
 * Read-only Stripe/payment readiness audit. It never prints credentials and
 * makes no changes to Stripe, Lob, the database, or customer billing.
 *
 * Usage:
 *   pnpm billing:check
 *   pnpm billing:check --strict
 */

const strict = process.argv.includes("--strict");

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function stripeMode(key) {
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  return key ? "invalid" : "missing";
}

function webhookReady(secret) {
  return /^whsec_.+/.test(secret);
}

async function stripeGet(secret, path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`stripe_${response.status}`);
  return response.json();
}

const secret = value("STRIPE_SECRET_KEY");
const publishable = value("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
const postcardWebhookSecret = value("STRIPE_WEBHOOK_SECRET");
const membershipWebhookSecret = value("STRIPE_MEMBERSHIP_WEBHOOK_SECRET");
const membershipEnabled = value("STRIPE_MEMBERSHIP_ENABLED") === "true";
const lob = value("LOB_API_KEY");
const origin = value("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");

const secretMode = stripeMode(secret);
const publishableMode = stripeMode(publishable);
const matchingStripeKeys =
  (secretMode === "test" || secretMode === "live") && secretMode === publishableMode;
const postcardReady = matchingStripeKeys && webhookReady(postcardWebhookSecret) && Boolean(lob);
const membershipReady = matchingStripeKeys && membershipEnabled && webhookReady(membershipWebhookSecret);

const report = {
  stripe: {
    secretKey: secretMode,
    publishableKey: publishableMode,
    matchingKeyMode: matchingStripeKeys,
    account: "not_checked",
    endpoints: [],
  },
  postcards: {
    ready: postcardReady,
    webhookSecret: webhookReady(postcardWebhookSecret),
    printProviderKey: Boolean(lob),
  },
  membership: {
    enabled: membershipEnabled,
    ready: membershipReady,
    webhookSecret: webhookReady(membershipWebhookSecret),
  },
};

if (matchingStripeKeys) {
  try {
    const [account, endpointResponse] = await Promise.all([
      stripeGet(secret, "/account"),
      stripeGet(secret, "/webhook_endpoints?limit=100"),
    ]);
    report.stripe.account = account?.id ? "verified" : "invalid_response";
    const expected = [
      postcardReady && origin ? `${origin}/api/postcard/webhook` : null,
      membershipEnabled && origin ? `${origin}/api/account/billing/webhook` : null,
    ].filter(Boolean);
    const endpoints = Array.isArray(endpointResponse?.data) ? endpointResponse.data : [];
    report.stripe.endpoints = expected.map((url) => {
      const endpoint = endpoints.find((candidate) => candidate?.url === url);
      return {
        url,
        configured: Boolean(endpoint),
        enabledEvents: Array.isArray(endpoint?.enabled_events) ? endpoint.enabled_events : [],
      };
    });
  } catch (error) {
    report.stripe.account = error instanceof Error ? error.message : "check_failed";
  }
}

console.log("CORE billing readiness (no secrets shown)");
console.log(`Stripe keys: ${matchingStripeKeys ? `${secretMode} pair` : "missing, invalid, or mixed"}`);
console.log(`Stripe account: ${report.stripe.account}`);
console.log(`Postcards: ${postcardReady ? "ready" : "not configured"}`);
console.log(`Supporter membership: ${membershipReady ? "ready" : membershipEnabled ? "incomplete" : "disabled"}`);
for (const endpoint of report.stripe.endpoints) {
  console.log(`  ${endpoint.configured ? "✓" : "✗"} ${endpoint.url}`);
}

const endpointsReady = report.stripe.endpoints.length === 0 || report.stripe.endpoints.every((endpoint) => endpoint.configured);
const complete = matchingStripeKeys && report.stripe.account === "verified" && endpointsReady && postcardReady;
if (strict && !complete) process.exitCode = 1;

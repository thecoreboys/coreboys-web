/**
 * Read-only Stripe/payment readiness audit. It never prints credentials and
 * makes no changes to Stripe, Lob, the database, or customer billing.
 *
 * Usage:
 *   pnpm billing:check
 *   pnpm billing:check --strict
 *   node scripts/check-billing-setup.mjs --membership-only --operations-only --strict
 */

const strict = process.argv.includes("--strict");
const membershipOnly = process.argv.includes("--membership-only");
const operationsOnly = process.argv.includes("--operations-only");

function rawValue(name) {
  return process.env[name] ?? "";
}

function value(name) {
  return rawValue(name).trim();
}

function stripeSecretMode(key) {
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return key ? "invalid" : "missing";
}

function stripePublishableMode(key) {
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return key ? "invalid" : "missing";
}

function webhookReady(secret) {
  return /^whsec_.+/.test(secret);
}

function publicHttpsOrigin(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const privateHost = host === "localhost"
      || host === "0.0.0.0"
      || host === "::1"
      || host === "[::1]"
      || host.endsWith(".local")
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return url.protocol === "https:" && !privateHost ? url.origin : "";
  } catch {
    return "";
  }
}

function normalizedHttpsUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
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
const origin = publicHttpsOrigin(value("NEXT_PUBLIC_SITE_URL"));
const whitespaceFields = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_MEMBERSHIP_WEBHOOK_SECRET",
  "STRIPE_MEMBERSHIP_ENABLED",
  "LOB_API_KEY",
  "NEXT_PUBLIC_SITE_URL",
].filter((name) => rawValue(name) !== rawValue(name).trim());

const secretMode = stripeSecretMode(secret);
const publishableMode = stripePublishableMode(publishable);
const serverStripeKeyReady = secretMode === "test" || secretMode === "live";
const matchingStripeKeys =
  serverStripeKeyReady && secretMode === publishableMode;
const operationsPublishableSafe = publishableMode === "missing" || matchingStripeKeys;
const postcardReady = matchingStripeKeys && webhookReady(postcardWebhookSecret) && Boolean(lob);
const membershipBaseReady = matchingStripeKeys && membershipEnabled && webhookReady(membershipWebhookSecret) && Boolean(origin);
const membershipOperationsBaseReady = serverStripeKeyReady && webhookReady(membershipWebhookSecret) && Boolean(origin);
const membershipRequired = membershipEnabled || operationsOnly;

const report = {
  stripe: {
    secretKey: secretMode,
    publishableKey: publishableMode,
    matchingKeyMode: matchingStripeKeys,
    account: "not_checked",
    chargesEnabled: false,
    endpoints: [],
  },
  postcards: {
    ready: postcardReady,
    webhookSecret: webhookReady(postcardWebhookSecret),
    printProviderKey: Boolean(lob),
  },
  membership: {
    enabled: membershipEnabled,
    operationsReady: false,
    ready: false,
    webhookSecret: webhookReady(membershipWebhookSecret),
    publicHttpsOrigin: Boolean(origin),
    termsOfServiceUrl: false,
    termsOfServiceUrlMatches: false,
    portal: {
      defaultActive: false,
      cancellationEnabled: false,
      cancellationAtPeriodEnd: false,
      paymentMethodUpdateEnabled: false,
      subscriptionUpdateDisabled: false,
    },
  },
};

if (serverStripeKeyReady) {
  try {
    const [account, endpointResponse, portalResponse] = await Promise.all([
      stripeGet(secret, "/account"),
      stripeGet(secret, "/webhook_endpoints?limit=100"),
      stripeGet(secret, "/billing_portal/configurations?active=true&is_default=true&limit=1"),
    ]);
    report.stripe.account = account?.id ? "verified" : "invalid_response";
    report.stripe.chargesEnabled = account?.charges_enabled === true;
    const termsOfServiceUrl = normalizedHttpsUrl(account?.business_profile?.terms_of_service_url ?? "");
    const expectedTermsOfServiceUrl = origin ? `${origin}/legal/terms` : "";
    report.membership.termsOfServiceUrl = Boolean(termsOfServiceUrl);
    report.membership.termsOfServiceUrlMatches = Boolean(expectedTermsOfServiceUrl) && termsOfServiceUrl === expectedTermsOfServiceUrl;
    const portal = Array.isArray(portalResponse?.data) ? portalResponse.data.find((candidate) => candidate?.active && candidate?.is_default) : null;
    report.membership.portal.defaultActive = Boolean(portal);
    report.membership.portal.cancellationEnabled = portal?.features?.subscription_cancel?.enabled === true;
    report.membership.portal.cancellationAtPeriodEnd = portal?.features?.subscription_cancel?.mode === "at_period_end";
    report.membership.portal.paymentMethodUpdateEnabled = portal?.features?.payment_method_update?.enabled === true;
    report.membership.portal.subscriptionUpdateDisabled = portal?.features?.subscription_update?.enabled === false;
    const portalReady = report.membership.portal.defaultActive
      && report.membership.portal.cancellationEnabled
      && report.membership.portal.cancellationAtPeriodEnd
      && report.membership.portal.paymentMethodUpdateEnabled
      && report.membership.portal.subscriptionUpdateDisabled;
    report.membership.operationsReady = membershipOperationsBaseReady && portalReady;
    // Test-mode Checkout uses the site's required consent checkbox because
    // Stripe test accounts cannot update account-level Terms settings.
    const termsReady = secretMode === "test" || report.membership.termsOfServiceUrlMatches;
    report.membership.ready = membershipBaseReady
      && report.stripe.chargesEnabled
      && termsReady
      && portalReady;
    const expected = [
      !membershipOnly && postcardReady && origin ? {
        url: `${origin}/api/postcard/webhook`,
        requiredEvents: ["payment_intent.succeeded"],
      } : null,
      membershipRequired && origin ? {
        url: `${origin}/api/account/billing/webhook`,
        requiredEvents: [
          "checkout.session.completed",
          "checkout.session.expired",
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ],
      } : null,
    ].filter(Boolean);
    const endpoints = Array.isArray(endpointResponse?.data) ? endpointResponse.data : [];
    report.stripe.endpoints = expected.map(({ url, requiredEvents }) => {
      const endpoint = endpoints.find((candidate) => candidate?.url === url);
      const enabledEvents = Array.isArray(endpoint?.enabled_events) ? endpoint.enabled_events : [];
      return {
        url,
        configured: Boolean(endpoint),
        enabled: endpoint?.status === "enabled",
        enabledEvents,
        requiredEvents,
        missingEvents: endpoint?.enabled_events?.includes("*") ? [] : requiredEvents.filter((event) => !enabledEvents.includes(event)),
      };
    });
  } catch (error) {
    report.stripe.account = error instanceof Error ? error.message : "check_failed";
  }
}

console.log("CORE billing readiness (no secrets shown)");
console.log(`Stripe keys: ${matchingStripeKeys ? `${secretMode} pair` : "missing, invalid, or mixed"}`);
if (whitespaceFields.length) console.log(`Configuration error: surrounding whitespace in ${whitespaceFields.join(", ")}`);
console.log(`Stripe account: ${report.stripe.account}`);
if (matchingStripeKeys) console.log(`Stripe charges: ${report.stripe.chargesEnabled ? "enabled" : "disabled"}`);
console.log(`Postcards: ${postcardReady ? "ready" : "not configured"}`);
console.log(`Supporter membership: ${report.membership.ready ? "ready" : report.membership.operationsReady ? "operations ready; checkout disabled" : membershipRequired ? "incomplete" : "disabled"}`);
if (membershipRequired) {
  console.log("  ! manual test-mode webhook delivery and end-to-end Checkout/Portal acceptance remain required; Stripe does not expose endpoint signing secrets via API");
}
if (membershipRequired) {
  console.log(`  ${report.membership.publicHttpsOrigin ? "✓" : "✗"} public HTTPS site origin`);
  console.log(`  ${report.membership.termsOfServiceUrlMatches || secretMode === "test" ? "✓" : "✗"} ${secretMode === "test" ? "Test Checkout uses the site's Terms consent" : `Stripe Terms URL matches ${origin || "the public site"}/legal/terms`}`);
  console.log(`  ${report.membership.portal.defaultActive ? "✓" : "✗"} active default Customer Portal configuration`);
  console.log(`  ${report.membership.portal.cancellationEnabled ? "✓" : "✗"} Customer Portal subscription cancellation`);
  console.log(`  ${report.membership.portal.cancellationAtPeriodEnd ? "✓" : "✗"} Customer Portal cancellation at period end`);
  console.log(`  ${report.membership.portal.paymentMethodUpdateEnabled ? "✓" : "✗"} Customer Portal payment-method updates`);
  console.log(`  ${report.membership.portal.subscriptionUpdateDisabled ? "✓" : "✗"} Customer Portal plan switching disabled`);
}
for (const endpoint of report.stripe.endpoints) {
  const eventStatus = endpoint.configured && endpoint.enabled && endpoint.missingEvents.length === 0 ? "✓" : "✗";
  console.log(`  ${eventStatus} ${endpoint.url}`);
  if (endpoint.configured && !endpoint.enabled) console.log("    Endpoint is disabled");
  if (endpoint.missingEvents.length) console.log(`    Missing events: ${endpoint.missingEvents.join(", ")}`);
}

const endpointsReady = report.stripe.endpoints.length > 0
  && report.stripe.endpoints.every((endpoint) => endpoint.configured && endpoint.enabled && endpoint.missingEvents.length === 0);
const complete = (operationsOnly ? serverStripeKeyReady && operationsPublishableSafe : matchingStripeKeys)
  && whitespaceFields.length === 0
  && report.stripe.account === "verified"
  && endpointsReady
  && (operationsOnly ? report.membership.operationsReady : report.membership.ready)
  && (membershipOnly || postcardReady);
if (strict && !complete) process.exitCode = 1;

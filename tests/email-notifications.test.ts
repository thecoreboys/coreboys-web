import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error TS does not enable allowImportingTsExtensions for app code.
import { THE_CORE_BOYS_MAIL_FROM_ADDRESS, getEmailDeliveryReadiness, isTheCoreBoysSenderAddress } from "../lib/notifications/email-config.ts";
// @ts-expect-error TS does not enable allowImportingTsExtensions for app code.
import { renderFanNotificationEmail } from "../lib/notifications/fan-email-template.ts";

test("mail readiness is disabled and secret-free by default", () => {
  const readiness = getEmailDeliveryReadiness({});
  assert.equal(readiness.enabled, false);
  assert.equal(readiness.configured, false);
  assert.equal(readiness.readyToSend, false);
  assert.equal(readiness.fromEmail, THE_CORE_BOYS_MAIL_FROM_ADDRESS);
  assert.deepEqual(readiness.missing, ["RESEND_API_KEY"]);
  assert.equal("apiKey" in readiness, false);
});

test("mail becomes ready only with a key, verified sender domain, and explicit switch", () => {
  const readiness = getEmailDeliveryReadiness({
    RESEND_API_KEY: "test-only-not-a-real-key",
    EMAIL_NOTIFICATIONS_ENABLED: "true",
    RESEND_FROM_EMAIL: "alerts@thecoreboys.com",
  });
  assert.equal(readiness.configured, true);
  assert.equal(readiness.readyToSend, true);
  assert.equal(isTheCoreBoysSenderAddress("alerts@thecoreboys.com"), true);
  assert.equal(isTheCoreBoysSenderAddress("alerts@example.com"), false);
});

test("mail rejects a sender outside the verified thecoreboys.com domain", () => {
  const readiness = getEmailDeliveryReadiness({
    RESEND_API_KEY: "test-only-not-a-real-key",
    EMAIL_NOTIFICATIONS_ENABLED: "true",
    RESEND_FROM_EMAIL: "alerts@example.com",
  });
  assert.equal(readiness.configured, false);
  assert.equal(readiness.readyToSend, false);
  assert.match(readiness.invalid.join(" "), /@thecoreboys\.com/);
});

test("community template escapes review text and uses an account settings link", () => {
  const message = renderFanNotificationEmail({
    eventType: "fan_submission.denied",
    payload: { denialReason: '<script>alert("no")</script>' },
    siteOrigin: "https://thecoreboys.com/path",
  });
  assert.match(message.text, /Review note/);
  assert.match(message.text, /https:\/\/thecoreboys\.com\/account/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
});

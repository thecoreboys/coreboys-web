/**
 * Public, non-secret mail configuration primitives.
 *
 * Secrets are deliberately absent from the returned readiness object so it is
 * safe to expose to server-side health checks and logs. The actual Resend key
 * is read only inside the server-only transport.
 */

export const THE_CORE_BOYS_MAIL_DOMAIN = "thecoreboys.com" as const;
export const THE_CORE_BOYS_MAIL_FROM_NAME = "The CORE Boys" as const;
export const THE_CORE_BOYS_MAIL_FROM_ADDRESS =
  `notifications@${THE_CORE_BOYS_MAIL_DOMAIN}` as const;

export type EmailEnvironment = {
  [key: string]: string | undefined;
  EMAIL_NOTIFICATIONS_ENABLED?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_FROM_NAME?: string;
  RESEND_REPLY_TO_EMAIL?: string;
};

export type EmailDeliveryReadiness = {
  provider: "resend";
  enabled: boolean;
  configured: boolean;
  readyToSend: boolean;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  domain: typeof THE_CORE_BOYS_MAIL_DOMAIN;
  missing: string[];
  invalid: string[];
};

const SIMPLE_EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isValidEmailAddress(value: string): boolean {
  return value.length <= 254 && SIMPLE_EMAIL.test(value);
}

export function isTheCoreBoysSenderAddress(value: string): boolean {
  if (!isValidEmailAddress(value)) return false;
  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  return domain === THE_CORE_BOYS_MAIL_DOMAIN;
}

export function getEmailDeliveryReadiness(
  env: EmailEnvironment = process.env,
): EmailDeliveryReadiness {
  const enabled = clean(env.EMAIL_NOTIFICATIONS_ENABLED).toLowerCase() === "true";
  const apiKeyConfigured = clean(env.RESEND_API_KEY).length > 0;
  const fromEmail = (
    clean(env.RESEND_FROM_EMAIL) || THE_CORE_BOYS_MAIL_FROM_ADDRESS
  ).toLowerCase();
  const fromName = clean(env.RESEND_FROM_NAME) || THE_CORE_BOYS_MAIL_FROM_NAME;
  const replyToEmail = clean(env.RESEND_REPLY_TO_EMAIL).toLowerCase() || null;

  const missing: string[] = [];
  const invalid: string[] = [];
  if (!apiKeyConfigured) missing.push("RESEND_API_KEY");
  if (!fromName) invalid.push("RESEND_FROM_NAME must not be empty");
  if (fromName.length > 120 || /[\r\n<>]/.test(fromName)) {
    invalid.push("RESEND_FROM_NAME must be a safe single-line display name");
  }
  if (!isTheCoreBoysSenderAddress(fromEmail)) {
    invalid.push(`RESEND_FROM_EMAIL must use @${THE_CORE_BOYS_MAIL_DOMAIN}`);
  }
  if (replyToEmail && !isValidEmailAddress(replyToEmail)) {
    invalid.push("RESEND_REPLY_TO_EMAIL must be a valid email address");
  }

  const configured = missing.length === 0 && invalid.length === 0;
  return {
    provider: "resend",
    enabled,
    configured,
    readyToSend: enabled && configured,
    fromName,
    fromEmail,
    replyToEmail,
    domain: THE_CORE_BOYS_MAIL_DOMAIN,
    missing,
    invalid,
  };
}

export function formatEmailSender(config: EmailDeliveryReadiness): string {
  return `${config.fromName} <${config.fromEmail}>`;
}

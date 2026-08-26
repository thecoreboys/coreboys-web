import "server-only";

import {
  formatEmailSender,
  getEmailDeliveryReadiness,
  isValidEmailAddress,
  type EmailDeliveryReadiness,
} from "./email-config";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export type ResendMailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

export type ResendMailReceipt = {
  provider: "resend";
  id: string;
};

export class EmailDeliveryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryConfigurationError";
  }
}

export class EmailDeliveryProviderError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmailDeliveryProviderError";
    this.status = status;
  }
}

export function getResendReadiness(): EmailDeliveryReadiness {
  return getEmailDeliveryReadiness(process.env);
}

function validateMessage(message: ResendMailMessage): string[] {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (recipients.length === 0 || recipients.length > 50) {
    throw new EmailDeliveryConfigurationError("Email requires between 1 and 50 recipients.");
  }
  if (recipients.some((value) => !isValidEmailAddress(value))) {
    throw new EmailDeliveryConfigurationError("Email contains an invalid recipient address.");
  }
  if (!message.subject.trim() || message.subject.length > 998) {
    throw new EmailDeliveryConfigurationError("Email subject is missing or too long.");
  }
  if (!message.text.trim() || !message.html.trim()) {
    throw new EmailDeliveryConfigurationError("Email requires both text and HTML bodies.");
  }
  return recipients;
}

/**
 * Server-only Resend transport. It is inert until both a key is configured and
 * EMAIL_NOTIFICATIONS_ENABLED=true. Callers must perform their own consent and
 * verified-recipient checks before invoking this function.
 */
export async function sendEmailWithResend(
  message: ResendMailMessage,
): Promise<ResendMailReceipt> {
  const readiness = getResendReadiness();
  if (!readiness.readyToSend) {
    const detail = readiness.configured
      ? "EMAIL_NOTIFICATIONS_ENABLED is not true."
      : [...readiness.missing, ...readiness.invalid].join("; ");
    throw new EmailDeliveryConfigurationError(`Email delivery is not ready: ${detail}`);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new EmailDeliveryConfigurationError("Email delivery is missing RESEND_API_KEY.");
  }
  const recipients = validateMessage(message);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (message.idempotencyKey) {
    headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);
  }

  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: formatEmailSender(readiness),
      to: recipients,
      subject: message.subject.trim(),
      text: message.text,
      html: message.html,
      ...(readiness.replyToEmail ? { reply_to: readiness.replyToEmail } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown; message?: unknown }
    | null;
  if (!response.ok) {
    const providerMessage = typeof payload?.message === "string"
      ? payload.message.slice(0, 300)
      : "Provider rejected the request.";
    throw new EmailDeliveryProviderError(
      `Resend email delivery failed (${response.status}): ${providerMessage}`,
      response.status,
    );
  }
  if (typeof payload?.id !== "string" || !payload.id) {
    throw new EmailDeliveryProviderError(
      "Resend returned an invalid delivery receipt.",
      response.status,
    );
  }
  return { provider: "resend", id: payload.id };
}

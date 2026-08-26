import type { FanNotificationEvent } from "../fanzone-notifications";

export type FanEmailTemplateInput = {
  eventType: FanNotificationEvent;
  payload: Record<string, unknown>;
  siteOrigin: string;
};

export type RenderedFanEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSiteOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported site URL protocol");
    }
    return url.origin;
  } catch {
    return "https://thecoreboys.com";
  }
}

function optionalDenialReason(payload: Record<string, unknown>): string | null {
  const value = payload.denialReason;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

export function renderFanNotificationEmail(
  input: FanEmailTemplateInput,
): RenderedFanEmail {
  const communityEvent = input.eventType.startsWith("fanzone.");
  const destination = communityEvent
    ? `${safeSiteOrigin(input.siteOrigin)}/fanzone#communities`
    : `${safeSiteOrigin(input.siteOrigin)}/account`;
  const isApproved = input.eventType === "fan_submission.approved";
  const payloadTitle = typeof input.payload.title === "string" ? input.payload.title.slice(0, 140) : null;
  const communityName = typeof input.payload.communityName === "string" ? input.payload.communityName.slice(0, 80) : "your CORE community";
  const subject = input.eventType === "fanzone.community_live"
    ? `${communityName} is live`
    : input.eventType === "fanzone.weekly_digest"
      ? `Your ${communityName} weekly recap`
      : input.eventType === "fanzone.community_update"
        ? payloadTitle ?? `New update from ${communityName}`
        : isApproved
          ? "Your CORE community submission was approved"
          : "An update on your CORE community submission";
  const lead = input.eventType === "fanzone.community_live"
    ? `${communityName} has a live stream happening now.`
    : input.eventType === "fanzone.weekly_digest"
      ? `Your concise weekly recap for ${communityName} is ready.`
      : input.eventType === "fanzone.community_update"
        ? `A staff-published update is now available in ${communityName}.`
        : isApproved
          ? "Your community submission was approved and can now appear in the CORE Fan Zone."
          : "Your community submission was reviewed and was not approved.";
  const reason = communityEvent || isApproved ? null : optionalDenialReason(input.payload);
  const reasonText = reason ? `\n\nReview note: ${reason}` : "";
  const text = `${lead}${reasonText}\n\nManage notifications and your account: ${destination}\n\nThe CORE Boys`;
  const reasonHtml = reason
    ? `<p style="margin:16px 0 0;color:#4b5563"><strong>Review note:</strong> ${escapeHtml(reason)}</p>`
    : "";

  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f5f5;color:#111827;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(lead)}</div>
    <main style="max-width:600px;margin:0 auto;padding:32px 20px">
      <section style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">
        <p style="margin:0 0 20px;color:#e11d48;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">The CORE Boys</p>
        <h1 style="margin:0;font-size:24px;line-height:1.25">${escapeHtml(subject)}</h1>
        <p style="margin:16px 0 0;color:#4b5563;line-height:1.6">${escapeHtml(lead)}</p>
        ${reasonHtml}
        <a href="${escapeHtml(destination)}" style="display:inline-block;margin-top:24px;border-radius:999px;background:#111827;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700">${communityEvent ? "Open FanZone" : "Open your account"}</a>
      </section>
      <p style="margin:16px 4px 0;color:#6b7280;font-size:12px;line-height:1.5">You received this because community email notifications were enabled in your CORE account. You can turn them off in account settings.</p>
    </main>
  </body>
</html>`,
  };
}

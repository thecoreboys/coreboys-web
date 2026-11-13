import { z } from "zod";

export const CONTRIBUTOR_ROLES = ["Thumbnail designer", "Artist", "Editor", "Clipper", "Developer", "Community member", "Moderator", "Other"] as const;
const text = (max: number, min = 0) => z.string().trim().min(min, `Enter at least ${min} characters.`).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters.");
const handle = text(80).refine(value => !/[<>\s]/.test(value), "Enter a handle without spaces or brackets.");
const portfolioLink = text(500).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !!url.hostname; } catch { return false; }
}, "Use a full https:// portfolio link.");
const contact = text(120).refine(value => !/[<>\r\n]/.test(value), "Enter an email or contact handle.");

export const submissionKindSchema = z.enum(["help", "suggestion"]);
export const reviewStatusSchema = z.enum(["new", "reviewed"]);
export const communitySubmissionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("help"), name: text(120, 1),
    contact: contact.refine(value => value.length >= 2, "Add an email or handle so we can reach you."),
    role: z.enum(CONTRIBUTOR_ROLES), portfolio: portfolioLink.default(""),
    message: text(2000, 20), ageConfirmed: z.literal(true),
  }).strict(),
  z.object({
    kind: z.literal("suggestion"), name: text(120).default(""), contact: contact.default(""),
    message: text(2000, 10), ageConfirmed: z.literal(true),
  }).strict(),
]);
export type CommunitySubmission = z.infer<typeof communitySubmissionSchema>;

// Keep accepting forms opened before this update and preserve older encrypted records.
export const contributorSchema = z.object({
  firstName: text(60, 1), lastName: text(60, 1),
  phone: text(35).refine(value => !value || (/^\+?[\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 7), "Enter a valid phone number."),
  twitter: handle, discord: handle,
  portfolio: portfolioLink,
  role: z.enum(CONTRIBUTOR_ROLES), how: text(2000, 20),
  ageConfirmed: z.literal(true),
}).strict().refine(value => !!(value.twitter || value.discord), { path: ["twitter"], message: "Add a Twitter or Discord handle so we can reach you." });
export type ContributorDetails = z.infer<typeof contributorSchema>;

export const submissionSchema = z.union([communitySubmissionSchema, contributorSchema]);
export type SubmissionDetails = z.infer<typeof submissionSchema>;
export type NormalizedSubmission = CommunitySubmission & { legacyContacts?: { twitter: string; discord: string; phone: string } };
export type InboxSubmission = NormalizedSubmission & { id: string; submittedAt: string; status: z.infer<typeof reviewStatusSchema> };
export type SubmissionCounts = { total: number; help: number; suggestion: number; new: number };
export type SubmissionFilters = { kind: "all" | CommunitySubmission["kind"]; status: "all" | InboxSubmission["status"] };

export function normalizeSubmission(value: unknown): NormalizedSubmission {
  const details = submissionSchema.parse(value);
  if ("kind" in details) return details;
  return {
    kind: "help", name: `${details.firstName} ${details.lastName}`, contact: details.twitter || details.discord,
    role: details.role, portfolio: details.portfolio, message: details.how, ageConfirmed: details.ageConfirmed,
    legacyContacts: { twitter: details.twitter, discord: details.discord, phone: details.phone },
  };
}

export const applicationEnvelope = z.object({ details: submissionSchema, token: z.string().max(1500), website: z.string().max(200) }).strict();

/** Bound the actual stream, including requests without Content-Length. */
export async function readApplicationJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new Error("body_too_large"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
}

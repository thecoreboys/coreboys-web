/**
 * Account profile and security validation shared by the settings UI and the
 * /api/account routes. Pure zod: safe to import from client components.
 */
import { z } from "zod";
import { newPasswordSchema } from "@/lib/auth/password-reset";
import { validatePublicHandle } from "@/lib/public-handle";

export const DISPLAY_NAME_MAX = 50;

// Control characters, zero-width/bidi overrides, and line breaks never belong in a name.
const INVISIBLE_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/;

export const displayNameSchema = z
  .string({ invalid_type_error: "Enter a display name." })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a display name.")
      .max(DISPLAY_NAME_MAX, `Use ${DISPLAY_NAME_MAX} characters or fewer.`)
      .refine((value) => !INVISIBLE_OR_CONTROL.test(value), "Remove hidden or special control characters."),
  );

/** Empty string or null clears the handle; anything else must pass the public-handle rules. */
export const publicHandleSchema = z
  .union([z.string(), z.null()])
  .transform((value, context) => {
    if (value === null || !value.trim()) return null;
    const result = validatePublicHandle(value);
    if (!result.ok) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: result.error });
      return z.NEVER;
    }
    return result.handle;
  });

export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    publicHandle: publicHandleSchema.optional(),
  })
  .strict()
  .refine((value) => value.displayName !== undefined || value.publicHandle !== undefined, "Nothing to update.");

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords don’t match." });
    }
    if (value.currentPassword && value.newPassword === value.currentPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["newPassword"], message: "Choose a password you aren’t using now." });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** First issue message per field, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/**
 * A lightweight, dependency-free strength hint. It is guidance only; the
 * server enforces the real rules (length and bcrypt byte limits).
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  else if (/\d|[^A-Za-z0-9]/.test(password) && password.length >= 10) score++;
  if (/^(.)\1+$/.test(password) || /^(password|12345678|qwerty)/i.test(password)) score = 1;
  if (password.length < 8) score = Math.min(score, 1);
  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  return { score: clamped, label: ["", "Weak", "Fair", "Good", "Strong"][clamped]! };
}

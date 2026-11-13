import { z } from "zod";
import { safeAuthNext } from "./safe-next";

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
export const INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one.";
export const PASSWORD_RESET_REQUESTED = "If an account exists for that email, you’ll receive a password reset link shortly.";

export const passwordResetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, INVALID_RESET_LINK);
export const newPasswordSchema = z.string()
  .min(8, "Use at least 8 characters for your new password.")
  .max(200, "Use 200 characters or fewer for your new password.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Your password is too long. Try a shorter password.");

export { safeAuthNext };

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  next: z.string().max(2_048).optional().transform((value) => safeAuthNext(value)),
});

export const resetPasswordSchema = z.object({
  token: passwordResetTokenSchema,
  password: newPasswordSchema,
});

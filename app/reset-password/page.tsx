import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = withPageMetadata("/reset-password", {
  title: "Reset your password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
});

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}

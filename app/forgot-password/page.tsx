import { redirect } from "next/navigation";
import { safeAuthNext } from "@/lib/auth/password-reset";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const query = new URLSearchParams({ auth: "forgot-password", next: safeAuthNext(typeof next === "string" ? next : undefined) });
  redirect(`/?${query}`);
}

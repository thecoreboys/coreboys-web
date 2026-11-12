"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Link2Off } from "lucide-react";
import { AlertCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AuthShell, authErrorClass } from "./AuthShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { INVALID_RESET_LINK, passwordResetTokenSchema, resetPasswordSchema, safeAuthNext } from "@/lib/auth/password-reset";

type State = "checking" | "ready" | "invalid" | "check-error" | "success";

export function ResetPasswordForm() {
  const { refresh } = useAuth();
  const token = useRef("");
  const initialized = useRef(false);
  const [next, setNext] = useState("/");
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateLink = useCallback(async () => {
    if (!passwordResetTokenSchema.safeParse(token.current).success) { setState("invalid"); return; }
    const checkedToken = token.current;
    setState("checking");
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password/validate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: checkedToken }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (token.current !== checkedToken) return;
      if (response.ok) setState("ready");
      else if (data.code === "invalid_reset_link") setState("invalid");
      else { setError(data.error ?? "We couldn’t check your reset link. Please try again."); setState("check-error"); }
    } catch {
      if (token.current !== checkedToken) return;
      setError("Couldn’t reach the server. Check your connection and try again.");
      setState("check-error");
    }
  }, []);

  useEffect(() => {
    const readLink = () => {
      const url = new URL(window.location.href);
      // Keep the token through Strict Mode's effect replay, but accept a new
      // emailed link opened in this same tab without a document navigation.
      if (initialized.current && !url.hash) return;
      initialized.current = true;
      token.current = url.hash.slice(1);
      url.hash = "";
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
      setNext(safeAuthNext(url.searchParams.get("next")));
      setPassword("");
      setConfirmation("");
      setError(null);
      void validateLink();
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [validateLink]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = resetPasswordSchema.safeParse({ token: token.current, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? INVALID_RESET_LINK); return; }
    if (password !== confirmation) { setError("Your passwords don’t match. Please enter the same password in both fields."); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "invalid_reset_link") setState("invalid");
        else setError(data.error ?? "We couldn’t update your password. Please try again.");
        return;
      }
      token.current = "";
      setPassword("");
      setConfirmation("");
      setState("success");
      // Refresh the guest state after the server clears the current session.
      refresh();
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const recoveryHref = `/forgot-password?${new URLSearchParams({ next })}` as never;
  const loginHref = `/login?${new URLSearchParams({ next })}` as never;
  const title = state === "success" ? "Password updated." : state === "invalid" ? "Let’s try a fresh link." : "Choose a new password.";
  const subtitle = state === "success" ? "You’re ready to get back to watching." : state === "invalid" ? "Reset links expire after 30 minutes and can only be used once." : "Set a new password for your CORE account.";

  return <AuthShell title={title} subtitle={subtitle} footer={state !== "success" ? <Link href={loginHref} className="inline-flex min-h-11 items-center gap-2 font-medium hover:text-white"><ArrowLeft className="size-4" aria-hidden />Back to sign in</Link> : undefined}>
    {state === "checking" ? <p role="status" className="text-sm text-tertiary">Checking your reset link…</p> : null}
    {state === "check-error" ? <div className="flex flex-col gap-5"><p className={authErrorClass} role="alert">{error}</p><Button type="button" size="lg" color="primary" onClick={() => void validateLink()}>Try again</Button></div> : null}
    {state === "invalid" ? <div className="flex flex-col gap-5"><Link2Off className="size-8 text-rose-300" aria-hidden /><p className="text-sm leading-6 text-tertiary" role="alert">{INVALID_RESET_LINK}</p><Button href={recoveryHref} size="lg" color="primary" className="w-full">Request a new reset link</Button></div> : null}
    {state === "success" ? <div className="flex flex-col gap-5"><div role="status" aria-live="polite"><CheckCircle2 className="mb-4 size-8 text-emerald-300" aria-hidden /><p className="text-sm leading-6 text-tertiary">Your password has been changed and you’ve been signed out on all devices. Sign in with your new password to continue.</p></div><Button href={loginHref} size="lg" color="primary" className="w-full">Back to sign in</Button></div> : null}
    {state === "ready" ? <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <KeyRound className="size-8 text-rose-300" aria-hidden />
      {error ? <p className={authErrorClass} role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span></p> : null}
      <Input isRequired autoFocus size="md" label="New password" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={200} value={password} onChange={(value) => { setPassword(value); setError(null); }} isDisabled={loading} placeholder="At least 8 characters" hint="Use at least 8 characters. A longer, unique password is best." />
      <Input isRequired size="md" label="Confirm new password" type="password" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={200} value={confirmation} onChange={(value) => { setConfirmation(value); setError(null); }} isDisabled={loading} placeholder="Enter your new password again" />
      <Button type="submit" size="lg" color="primary" isLoading={loading} className="w-full">Update password</Button>
    </form> : null}
  </AuthShell>;
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy01, Lock01 } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";

type TwoFactorMode = "enroll" | "verify";
type Setup = { manualKey: string; accountName: string; issuer: string };

/** Password is step one; elevated CORE desk access is only minted after TOTP. */
export default function AdminSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<TwoFactorMode | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "enroll") return;
    let alive = true;
    void fetch("/api/admin/totp/setup", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as Setup & { error?: string };
        if (!response.ok) throw new Error(json.error ?? "Unable to start two-factor setup.");
        if (alive) setSetup(json);
      })
      .catch((setupError) => alive && setError(setupError instanceof Error ? setupError.message : "Unable to start two-factor setup."));
    return () => { alive = false; };
  }, [mode]);

  async function onPasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next: requestedNext }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string; requiresTwoFactor?: boolean; mode?: TwoFactorMode; redirectTo?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Login failed.");
      if (json.requiresTwoFactor && (json.mode === "enroll" || json.mode === "verify")) {
        setMode(json.mode);
        setNext(json.redirectTo ?? requestedNext);
        return;
      }
      router.replace((json.redirectTo ?? "/studio") as never);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTotpSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp, next }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(json.error ?? "Two-factor verification failed.");
      router.replace((json.redirectTo ?? "/admin") as never);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const alert = error ? (
    <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-error_subtle bg-error-primary px-3 py-2.5" role="alert">
      <AlertCircle className="size-4 shrink-0 text-fg-error-secondary" />
      <p className="text-sm font-medium text-primary">{error}</p>
    </div>
  ) : null;

  if (mode) {
    const enrolling = mode === "enroll";
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[color:var(--bg)] px-6 pb-16 pt-24">
        <form onSubmit={onTotpSubmit} className="w-full max-w-[460px] border border-[color:var(--rule)] bg-[color:var(--bg)] p-6 md:p-8">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-primary text-brand-secondary"><Lock01 className="size-5" /></span>
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">CORE staff security</p>
          <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
            {enrolling ? "Set up your authenticator." : "Enter your security code."}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--ink-dim)]">
            {enrolling
              ? "Admin access requires a time-based one-time password. Add this account to an authenticator app, then enter the current six-digit code."
              : "Use the current six-digit code from your authenticator app to open the admin desk."}
          </p>
          {enrolling ? (
            <div className="mt-5 rounded-xl border border-secondary bg-secondary p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-tertiary">Manual setup key</p>
              <p className="mt-2 break-all font-mono text-base font-semibold tracking-[0.12em] text-primary">{setup?.manualKey ?? "Loading secure key…"}</p>
              {setup ? <button type="button" onClick={() => void navigator.clipboard?.writeText(setup.manualKey)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-secondary"><Copy01 className="size-4" /> Copy key</button> : null}
              <p className="mt-3 text-xs leading-relaxed text-tertiary">Issuer: {setup?.issuer ?? "CORE Staff"}. Account: {setup?.accountName ?? email}. This key is only shown during setup.</p>
            </div>
          ) : null}
          <div className="mt-6">
            <Input label="Authenticator code" type="text" inputMode="numeric" autoComplete="one-time-code" isRequired value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
          </div>
          {alert}
          <Button type="submit" size="lg" color="primary" isLoading={submitting || (enrolling && !setup)} className="mt-6 w-full">Verify and continue</Button>
          <button type="button" onClick={() => { setMode(null); setSetup(null); setOtp(""); setError(null); }} className="mt-4 w-full text-sm font-semibold text-tertiary hover:text-primary">Use a different account</button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[color:var(--bg)] px-6 pb-16 pt-24">
      <form onSubmit={onPasswordSubmit} className="w-full max-w-[420px] border border-[color:var(--rule)] bg-[color:var(--bg)] p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">CORE staff</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">Staff sign in.</h1>
        <p className="mt-2 text-sm text-[color:var(--ink-dim)]">Admins require an authenticator code. Member managers open their assigned Studio.</p>
        <div className="mt-6 flex flex-col gap-4">
          <Input label="Email" type="email" autoComplete="username" isRequired value={email} onChange={(value) => setEmail(value)} placeholder="you@example.com" />
          <Input label="Password" type="password" autoComplete="current-password" isRequired value={password} onChange={(value) => setPassword(value)} placeholder="••••••••" />
        </div>
        {alert}
        <Button type="submit" size="lg" color="primary" isLoading={submitting} className="mt-6 w-full">Continue</Button>
      </form>
    </main>
  );
}

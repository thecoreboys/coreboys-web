"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy01 } from "@untitledui/icons";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";

type TwoFactorMode = "enroll" | "verify";
type Setup = { manualKey: string; accountName: string; issuer: string };

function AdminAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[var(--page-min-height)] items-center justify-center bg-[#09090b] px-4 py-8 sm:px-5 sm:py-14">
      <section className="grid w-full overflow-hidden rounded-[22px] border border-white/10 bg-[#121214] shadow-[0_24px_90px_rgba(0,0,0,.4)] sm:max-w-5xl sm:grid-cols-[minmax(0,1fr)_minmax(25rem,1fr)]">
        <aside className="relative hidden min-h-[37rem] overflow-hidden border-r border-white/10 bg-[#181719] p-10 sm:flex sm:flex-col sm:justify-between">
          <div aria-hidden="true" className="pointer-events-none absolute -right-44 -top-44 size-[33rem] rounded-full border border-white/[.06] shadow-[0_0_0_65px_rgba(255,255,255,.018),0_0_0_130px_rgba(255,255,255,.012)]" />
          <div className="relative text-xl font-black italic tracking-[-.08em] text-white">CORE<span className="sr-only"> administration</span></div>
          <div className="relative max-w-sm">
            <p className="text-sm font-medium text-white/55">CORE administration</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-.045em] text-white">Your space to manage CORE.</h2>
            <p className="mt-4 text-base leading-7 text-white/60">Sign in to manage content, communities, and the site.</p>
          </div>
          <p className="relative border-t border-white/10 pt-5 text-sm text-white/45">CORE · Administration</p>
        </aside>

        <div className="relative flex min-h-[32rem] flex-col px-6 pb-9 pt-20 sm:min-h-0 sm:px-12 sm:py-12">
          <Link href="/" className="absolute right-4 top-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to CORE
          </Link>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}

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
      <AdminAuthShell>
        <form onSubmit={onTotpSubmit} noValidate>
          <p className="text-sm font-medium text-white/55">CORE administration</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">
            {enrolling ? "Set up your authenticator" : "Enter your security code"}
          </h1>
          <p className="mt-3 text-base leading-6 text-white/60">
            {enrolling
              ? "Add this account to your authenticator app, then enter the six-digit code."
              : "Enter the six-digit code from your authenticator app."}
          </p>
          {enrolling ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-sm font-medium text-white/65">Manual setup key</p>
              <p className="mt-2 break-all font-mono text-base font-semibold tracking-[0.12em] text-white">{setup?.manualKey ?? "Loading secure key…"}</p>
              {setup ? <button type="button" onClick={() => void navigator.clipboard?.writeText(setup.manualKey)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-rose-300 transition hover:text-rose-200"><Copy01 className="size-4" /> Copy key</button> : null}
              <p className="mt-3 text-sm leading-relaxed text-white/60">Issuer: {setup?.issuer ?? "CORE Staff"}. Account: {setup?.accountName ?? email}. This key is only shown during setup.</p>
            </div>
          ) : null}
          <div className="mt-6">
            <label htmlFor="admin-security-code" className="mb-3 block text-sm font-medium text-white/85">Authenticator code</label>
            <OTPInput id="admin-security-code" name="code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} pasteTransformer={(value) => value.replace(/\D/g, "")} aria-invalid={Boolean(error)} containerClassName="w-full" render={({ slots, isFocused }) => (
              <div aria-hidden="true" className="grid w-full grid-cols-6 gap-2">
                {slots.map((slot, index) => <div key={index} className={`flex aspect-[.82] min-w-0 items-center justify-center rounded-xl border bg-[#0b0b0d] text-center text-2xl font-medium tabular-nums text-white transition-colors ${isFocused && slot.isActive ? "border-rose-400 ring-2 ring-rose-400/25" : "border-white/15"}`}>
                  {slot.char ?? (slot.hasFakeCaret ? <span className="h-7 w-0.5 animate-pulse bg-white" /> : <span className="text-white/20">·</span>)}
                </div>)}
              </div>
            )} />
          </div>
          {alert}
          <Button type="submit" size="lg" color="primary" isDisabled={otp.length !== 6 || (enrolling && !setup)} isLoading={submitting} className="mt-6 w-full">Verify and continue</Button>
          <button type="button" onClick={() => { setMode(null); setSetup(null); setOtp(""); setError(null); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Use a different account <ArrowUpRight className="size-4" aria-hidden="true" /></button>
        </form>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell>
      <form onSubmit={onPasswordSubmit} noValidate>
        <p className="text-sm font-medium text-white/55">CORE administration</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-white">Administrator sign in.</h1>
        <div className="mt-7 flex flex-col gap-4">
          <Input size="md" label="Email" type="email" name="email" autoComplete="username" isRequired value={email} onChange={(value) => setEmail(value)} placeholder="you@email.com" />
          <Input size="md" label="Password" type="password" name="password" autoComplete="current-password" isRequired value={password} onChange={(value) => setPassword(value)} placeholder="••••••••" />
        </div>
        {alert}
        <Button type="submit" size="lg" color="primary" isLoading={submitting} className="mt-6 w-full">Sign in</Button>
      </form>
    </AdminAuthShell>
  );
}

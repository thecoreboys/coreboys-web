"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy01, Lock01 } from "@untitledui/icons";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";

type TwoFactorMode = "enroll" | "verify";
type Setup = { manualKey: string; accountName: string; issuer: string };

function AdminAuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] px-0 pb-0 pt-20 sm:px-5 sm:pb-5 sm:pt-24">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(225,29,72,.12),transparent_32%),radial-gradient(circle_at_82%_85%,rgba(147,51,234,.08),transparent_30%)]" />
      <section className="relative grid min-h-[calc(100dvh-5rem)] w-full overflow-hidden border border-white/12 bg-[#151518] shadow-[0_34px_140px_rgba(0,0,0,.76)] sm:min-h-0 sm:max-w-5xl sm:grid-cols-[minmax(0,1.05fr)_minmax(25rem,.95fr)] sm:rounded-3xl">
        <aside className="relative isolate hidden min-h-[38rem] overflow-hidden p-7 sm:flex sm:flex-col sm:justify-between">
          <span className="absolute inset-0 -z-30 bg-[url('/brand/supporter/signal-room-v1.png')] bg-cover bg-center" />
          <span className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,rgba(7,7,9,.18),rgba(7,7,9,.42)_44%,rgba(7,7,9,.97))]" />
          <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_62%_26%,rgba(244,63,94,.24),transparent_36%)]" />
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-white/75 backdrop-blur-md">
            <ShieldCheck className="size-3.5 text-rose-300" aria-hidden="true" />
            CORE administration
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-rose-300">Secure control room</p>
            <h2 className="mt-3 max-w-md text-4xl font-semibold leading-[.95] tracking-[-.055em] text-white">Everything behind CORE, in one place.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Manage programming, communities, originals, and network operations from the administration desk.</p>
            <div className="mt-7 flex flex-wrap gap-2" aria-label="Administration areas">
              {["Programming", "Moderation", "Operations"].map((label) => (
                <span key={label} className="rounded-full border border-white/12 bg-black/30 px-3 py-1.5 text-xs font-medium text-white/72 backdrop-blur-md">{label}</span>
              ))}
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-[34rem] flex-col px-5 py-6 sm:min-h-0 sm:px-10 sm:py-9">
          <Link href="/" className="absolute right-4 top-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-white/45 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to CORE
          </Link>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pt-12 sm:pt-0">
            {children}
          </div>
        </div>
      </section>
    </main>
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
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-rose-500/12 text-rose-300 ring-1 ring-inset ring-rose-400/20"><Lock01 className="size-5" /></span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[.18em] text-rose-300">Administrator security</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-white">
            {enrolling ? "Set up your authenticator." : "Enter your security code."}
          </h1>
          <p className="mt-2 text-sm leading-5 text-white/48">
            {enrolling
              ? "Admin access requires a time-based one-time password. Add this account to an authenticator app, then enter the current six-digit code."
              : "Use the current six-digit code from your authenticator app to open the admin desk."}
          </p>
          {enrolling ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Manual setup key</p>
              <p className="mt-2 break-all font-mono text-base font-semibold tracking-[0.12em] text-white">{setup?.manualKey ?? "Loading secure key…"}</p>
              {setup ? <button type="button" onClick={() => void navigator.clipboard?.writeText(setup.manualKey)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-rose-300 transition hover:text-rose-200"><Copy01 className="size-4" /> Copy key</button> : null}
              <p className="mt-3 text-xs leading-relaxed text-white/45">Issuer: {setup?.issuer ?? "CORE Staff"}. Account: {setup?.accountName ?? email}. This key is only shown during setup.</p>
            </div>
          ) : null}
          <div className="mt-6">
            <Input label="Authenticator code" type="text" inputMode="numeric" autoComplete="one-time-code" isRequired value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
          </div>
          {alert}
          <Button type="submit" size="lg" color="primary" isLoading={submitting || (enrolling && !setup)} className="mt-6 w-full">Verify and continue</Button>
          <button type="button" onClick={() => { setMode(null); setSetup(null); setOtp(""); setError(null); }} className="mt-4 w-full text-sm font-semibold text-white/48 transition hover:text-white">Use a different account</button>
        </form>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell>
      <form onSubmit={onPasswordSubmit} noValidate>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-rose-300">CORE administration</p>
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

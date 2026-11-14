"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "@untitledui/icons";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/components/providers/AuthProvider";
import { authErrorClass } from "./AuthShell";

export function LoginForm({ next, onSwitch, onComplete }: { next: string; onSwitch: () => void; onComplete: (destination: string) => void }) {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "We couldn't sign you in. Check your email and password, then try again.");
        return;
      }
      await refresh();
      setSuccess(true);
      redirectTimer.current = window.setTimeout(() => onComplete(next), 1_500);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="mt-7 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-5" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
          <div>
            <p className="font-semibold text-white">You’re signed in.</p>
            <p className="mt-1 text-sm leading-5 text-white/55">Your account is ready. Taking you back now.</p>
          </div>
        </div>
        <Button type="button" size="lg" color="primary" className="mt-5 w-full" onClick={() => {
          if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
          onComplete(next);
        }}>Continue</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
      {error ? <p className={authErrorClass} role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span></p> : null}
      <Input isRequired size="md" label="Email" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} isInvalid={error ? true : undefined} placeholder="you@email.com" />
      <Input isRequired size="md" label="Password" type="password" name="password" autoComplete="current-password" value={password} onChange={setPassword} isInvalid={error ? true : undefined} placeholder="••••••••" />
      <Button type="submit" size="lg" color="primary" isLoading={loading} className="mt-1 w-full">Sign in</Button>
      <p className="text-center text-xs text-white/48">New to CoreTV? <button type="button" onClick={onSwitch} className="font-semibold text-rose-300 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200">Create a free account</button></p>
    </form>
  );
}

export function SignupForm({ next, onSwitch, onComplete }: { next: string; onSwitch: () => void; onComplete: (destination: string) => void }) {
  const { refresh } = useAuth(); const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [consent, setConsent] = useState(false); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!consent) { setError("Please tick the box to agree to the Terms and Privacy Policy before continuing."); return; } setLoading(true); setError(null); try { const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, email, password, consent }) }); const data = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) { setError(data.error ?? "We couldn't create your account. Double-check your details and try again."); return; } await refresh(); onComplete(next); } catch { setError("Couldn't reach the server. Check your connection and try again."); } finally { setLoading(false); } }
  return <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">{error ? <p className={authErrorClass} role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{error}</span></p> : null}<Input isRequired size="md" label="Name" type="text" name="name" autoComplete="name" value={displayName} onChange={setDisplayName} placeholder="Your name" /><Input isRequired size="md" label="Email" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@email.com" /><Input isRequired size="md" label="Password" type="password" name="password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} placeholder="At least 8 characters" hint="Use 8 or more characters with a mix of letters and numbers." /><Checkbox size="md" isSelected={consent} onChange={setConsent} isInvalid={error && !consent ? true : undefined} label={<span className="text-tertiary">I confirm I am 13 or older and agree to the <Link href="/legal/terms" className="font-medium text-brand-secondary hover:underline">Terms</Link> and <Link href="/legal/privacy" className="font-medium text-brand-secondary hover:underline">Privacy Policy</Link>.</span>} /><Button type="submit" size="lg" color="primary" isLoading={loading} iconTrailing={ArrowRight} className="mt-1 w-full">Create free account</Button><p className="text-center text-xs text-white/48">Already have an account? <button type="button" onClick={onSwitch} className="font-semibold text-rose-300 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200">Sign in</button></p></form>;
}

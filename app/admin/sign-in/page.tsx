"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Custom admin sign-in form. Posts to /api/admin/login which
 * bcrypt-compares the password and sets the HttpOnly session cookie.
 * Middleware handles redirect-to-here for unauthenticated /admin/*
 * requests; on success we push back to /admin.
 */
export default function AdminSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json: { error?: string } = await res.json().catch(() => ({}));
        setError(json.error ?? "login failed");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[400px] rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-6 md:p-8"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
          Admin · Sign in
        </p>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-[color:var(--ink)]">
          Restricted access.
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-dim)]">
          Single-admin gate. Email + password.
        </p>

        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold tracking-tight text-[color:var(--ink)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-[14px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold tracking-tight text-[color:var(--ink)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-[14px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none"
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 px-3 py-2 text-[12px] text-[color:var(--core)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-[color:var(--core)] bg-[color:var(--core)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-tight text-white transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-6px_rgba(239,68,68,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

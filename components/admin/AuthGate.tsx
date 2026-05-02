"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

const STORAGE_KEY = "coreboys-auth-demo";
// Phase 4 swaps this stub for NextAuth + Twitch OAuth + admin role check.
// Until then, a dev passcode unlocks the admin surface area locally.
const DEV_PASSCODE = "core-admin";

/**
 * Auth gate for /admin/*. Renders the children only when the viewer
 * has set the localStorage flag — otherwise prompts for the dev
 * passcode. This is intentionally a stub; production auth lives in
 * `coreboys-auth` (see ARCHITECTURE.md).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAuthed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setAuthed(false);
    }
  }, []);

  if (authed === null) {
    return null;
  }

  if (!authed) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-6 pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 50% 30%, rgba(239,68,68,0.10), transparent 70%)",
          }}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() === DEV_PASSCODE) {
              try {
                localStorage.setItem(STORAGE_KEY, "1");
              } catch {
                /* ignore */
              }
              setAuthed(true);
              setError(null);
            } else {
              setError("Incorrect passcode.");
            }
          }}
          className="relative w-full max-w-[420px] rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-6 shadow-2xl"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--core)]/14 text-[color:var(--core)]">
            <Lock size={16} />
          </span>
          <h1 className="mt-4 text-[22px] font-bold tracking-tight text-[color:var(--ink)]">
            Admin sign-in
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
            Enter the dev passcode to unlock the admin console. Phase 4 swaps this for Twitch OAuth
            + role check.
          </p>
          <input
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="Passcode"
            autoFocus
            className="mt-5 w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2.5 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--core)] focus:outline-none"
          />
          {error ? (
            <p className="mt-2 text-[12px] text-[color:var(--core)]">{error}</p>
          ) : null}
          <button type="submit" className="btn btn-primary mt-5 w-full justify-center">
            Sign in
          </button>
          <p className="mt-3 text-center text-[10px] text-[color:var(--ink-faint)]">
            Dev passcode: <code className="font-mono">core-admin</code>
          </p>
        </form>
      </main>
    );
  }

  return <>{children}</>;
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        window.location.href = "/admin";
      }}
      className="text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)] cursor-pointer"
    >
      Sign out
    </button>
  );
}

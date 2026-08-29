"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";

function safeDestination(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/access")
    ? value
    : "/";
}

export function AccessGateForm({ next }: { next: string | null }) {
  const destination = useMemo(() => safeDestination(next), [next]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/access/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Access could not be verified.");
        setCode("");
        return;
      }
      window.location.assign(destination);
    } catch {
      setError("Access could not be verified. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="access-gate-form">
      <div className="access-gate-form-heading">
        <label htmlFor="site-access-code">Access code</label>
        <span aria-hidden>{code.length}/6</span>
      </div>
      <div className="access-gate-code-field">
        <input
          id="site-access-code"
          name="code"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          autoFocus
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={Boolean(error)}
          aria-describedby="site-access-status"
        />
        <span className="access-gate-code-slots" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => <i key={index} data-filled={index < code.length} />)}
        </span>
      </div>
      <button type="submit" disabled={code.length !== 6 || submitting}>
        {submitting ? "Checking code…" : "Continue"}
      </button>
      <p id="site-access-status" role="status" aria-live="polite">
        {error}
      </p>
    </form>
  );
}

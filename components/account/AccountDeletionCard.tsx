"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";

type RequestRow = { scheduledFor: string; status: string } | null;

export function AccountDeletionCard() {
  const [request, setRequest] = useState<RequestRow>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/account/deletion", { credentials: "same-origin" }).then((r) => r.json()).then((data: { request?: RequestRow }) => setRequest(data.request ?? null)).catch(() => setError("Could not load deletion status.")); }, []);
  async function submit(action?: "cancel") {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/deletion", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(action ? { action } : {}) });
      const data = await response.json() as { request?: RequestRow; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Account deletion could not be scheduled.");
      setRequest(data.request ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Account deletion could not be scheduled."); } finally { setBusy(false); }
  }
  return <section className="rounded-2xl bg-secondary p-6 ring-1 ring-inset ring-secondary"><h2 className="text-lg font-semibold text-primary">Delete account</h2><p className="mt-1 max-w-2xl text-sm text-tertiary">Your account stays recoverable for 14 days after it is scheduled. A renewing subscription must be cancelled first.</p>{error ? <p className="mt-3 text-sm text-error-primary" role="alert">{error}</p> : null}{request ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><p className="text-sm text-secondary">Scheduled for {new Date(request.scheduledFor).toLocaleDateString()}</p><Button color="secondary" size="sm" onClick={() => void submit("cancel")} isDisabled={busy}>Keep account</Button></div> : <Button className="mt-4" color="secondary" size="sm" onClick={() => { if (window.confirm("Schedule this account for deletion in 14 days?")) void submit(); }} isDisabled={busy}>{busy ? "Scheduling…" : "Request deletion"}</Button>}</section>;
}

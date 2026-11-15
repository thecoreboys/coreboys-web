"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";

type RequestRow = { scheduledFor: string; status: string } | null;

export function AccountDeletionCard() {
  const [request, setRequest] = useState<RequestRow>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/deletion", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load deletion status.");
      const data = await response.json() as { request?: RequestRow };
      setRequest(data.request ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load deletion status.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);
  async function submit(action?: "cancel") {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/deletion", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(action ? { action } : {}) });
      const data = await response.json() as { request?: RequestRow; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Account deletion could not be scheduled.");
      setRequest(data.request ?? null);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Account deletion could not be scheduled."); } finally { setBusy(false); }
  }
  return <section id="account-deletion" className="scroll-mt-32 rounded-2xl bg-secondary p-6 ring-1 ring-inset ring-secondary" aria-labelledby="account-deletion-heading"><h2 id="account-deletion-heading" className="text-lg font-semibold text-primary">Delete account</h2><p className="mt-1 max-w-2xl text-sm text-tertiary">Your account stays recoverable for 14 days after it is scheduled. A renewing subscription must be cancelled first.</p>{error ? <p className="mt-3 text-sm text-error-primary" role="alert">{error}</p> : null}{loading ? <p className="mt-4 text-sm text-tertiary" role="status">Checking deletion status…</p> : error ? <Button className="mt-4" color="secondary" size="sm" onClick={() => void loadStatus()}>Retry status check</Button> : request ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><p className="text-sm text-secondary">Scheduled for {new Date(request.scheduledFor).toLocaleDateString()}</p><Button color="secondary" size="sm" onClick={() => void submit("cancel")} isDisabled={busy}>{busy ? "Keeping account…" : "Keep account"}</Button></div> : <Button className="mt-4" color="secondary" size="sm" onClick={() => { if (window.confirm("Schedule this account for deletion in 14 days?")) void submit(); }} isDisabled={busy}>{busy ? "Scheduling…" : "Request deletion"}</Button>}</section>;
}

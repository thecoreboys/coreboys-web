"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";

type Row = { id: string; userId: string; email: string; displayName: string; scheduledFor: string };
export function AccountDeletionRequests() {
  const [rows, setRows] = useState<Row[]>([]); const [error, setError] = useState<string | null>(null);
  async function load() { try { const response = await fetch("/api/admin/account-deletions", { credentials: "same-origin" }); const data = await response.json() as { requests?: Row[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "Could not load requests."); setRows(data.requests ?? []); } catch (err) { setError(err instanceof Error ? err.message : "Could not load requests."); } }
  useEffect(() => { void load(); }, []);
  async function schedule(userId: string) { const response = await fetch("/api/admin/account-deletions", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setError(data.error ?? "Could not schedule deletion."); return; } await load(); }
  return <main className="mx-auto max-w-5xl px-6 py-12"><h1 className="text-2xl font-semibold text-primary">Account deletion requests</h1><p className="mt-2 text-sm text-tertiary">Review requests and schedule deletion after the subscription renewal check. Users have 14 days to overturn a scheduled deletion.</p>{error ? <p className="mt-4 text-sm text-error-primary" role="alert">{error}</p> : null}<div className="mt-6 divide-y divide-secondary rounded-xl bg-primary ring-1 ring-inset ring-secondary">{rows.length ? rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium text-primary">{row.displayName}</p><p className="text-sm text-tertiary">{row.email} · scheduled {new Date(row.scheduledFor).toLocaleDateString()}</p></div><Button color="secondary" size="sm" onClick={() => void schedule(row.userId)}>Confirm schedule</Button></div>) : <p className="p-5 text-sm text-tertiary">No pending requests.</p>}</div></main>;
}

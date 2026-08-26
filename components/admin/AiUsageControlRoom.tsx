"use client";

import { useCallback, useEffect, useState } from "react";

type Provider = {
  provider: "anthropic" | "elevenlabs";
  enabled: boolean;
  dailyRequestLimit: number;
  subjectHourlyLimit: number;
  monthlyBudgetCents: number;
  requestsToday: number;
  monthSpendMicroUsd: number;
};

const inputClass = "mt-1 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand";

export function AiUsageControlRoom() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/ai-usage", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { providers?: Provider[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load AI controls.");
    setProviders(data.providers ?? []);
  }, []);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load AI controls.")); }, [load]);
  async function save(provider: Provider) {
    setBusy(provider.provider); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/ai-usage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(provider) });
      const data = (await response.json().catch(() => ({}))) as { providers?: Provider[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save AI controls.");
      setProviders(data.providers ?? []); setNotice(`${provider.provider === "anthropic" ? "Anthropic" : "ElevenLabs"} controls saved.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save AI controls."); }
    finally { setBusy(null); }
  }
  return <div className="space-y-4">
    <p className="max-w-3xl text-sm leading-relaxed text-tertiary">Every AI call reserves budget in Postgres before it leaves CORE. Disabling a provider stops new calls immediately. ElevenLabs is disabled by default because the site currently uses approved, pre-rendered audio rather than per-listener generation.</p>
    {error ? <p role="alert" className="rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary">{error}</p> : null}
    {notice ? <p role="status" className="rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary">{notice}</p> : null}
    {providers.map((provider) => <section key={provider.provider} className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-primary">{provider.provider === "anthropic" ? "Anthropic" : "ElevenLabs"}</h2><p className="mt-1 text-sm text-tertiary">Today: {provider.requestsToday} requests · This month: ${(provider.monthSpendMicroUsd / 1_000_000).toFixed(2)} reserved or settled.</p></div><label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary"><input type="checkbox" checked={provider.enabled} onChange={(event) => setProviders((all) => all.map((item) => item.provider === provider.provider ? { ...item, enabled: event.target.checked } : item))} /> Enabled</label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-tertiary">Daily request cap<input className={inputClass} type="number" min="0" value={provider.dailyRequestLimit} onChange={(event) => setProviders((all) => all.map((item) => item.provider === provider.provider ? { ...item, dailyRequestLimit: Number(event.target.value) } : item))} /></label><label className="text-xs font-semibold text-tertiary">Per-user / hour cap<input className={inputClass} type="number" min="0" value={provider.subjectHourlyLimit} onChange={(event) => setProviders((all) => all.map((item) => item.provider === provider.provider ? { ...item, subjectHourlyLimit: Number(event.target.value) } : item))} /></label><label className="text-xs font-semibold text-tertiary">Monthly cap (USD cents)<input className={inputClass} type="number" min="0" value={provider.monthlyBudgetCents} onChange={(event) => setProviders((all) => all.map((item) => item.provider === provider.provider ? { ...item, monthlyBudgetCents: Number(event.target.value) } : item))} /></label></div>
      <button type="button" disabled={busy !== null} onClick={() => void save(provider)} className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50">{busy === provider.provider ? "Saving…" : "Save limits"}</button>
    </section>)}
  </div>;
}

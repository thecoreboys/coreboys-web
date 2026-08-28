"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type CutoffReason = "paused" | "monthly_cap_reached" | null;

type Budget = {
  enabled: boolean;
  paused: boolean;
  monthlyCreditCap: number;
  creditsCharged: number;
  confirmedCreditsCharged: number;
  estimatedCreditsCharged: number;
  creditsReserved: number;
  creditsCommitted: number;
  creditsRemaining: number;
  requestsCompleted: number;
  requestsReserved: number;
  updatedAt: string;
  currentPeriodUtc: string;
  cutoffReason: CutoffReason;
};

type BudgetResponse = {
  budget?: Budget;
  error?: string;
};

type BackfillTask = {
  provider: "tiktok" | "instagram" | "twitter";
  surface: "videos" | "posts" | "reels" | "tweets";
  handle: string;
  memberSlug: string | null;
  accountLabel: string;
  status: "pending" | "completed";
  pagesProcessed: number;
  creditsCommitted: number;
  itemsRecorded: number;
  completionReason: string | null;
  lastError: string | null;
};

type Backfill = {
  id: string;
  status: "running" | "paused" | "completed" | "cancelled";
  months: number;
  cutoffAt: string;
  backfillBeforeAt: string;
  maxCredits: number;
  creditsCommitted: number;
  creditsRemaining: number;
  pagesProcessed: number;
  itemsRecorded: number;
  pauseReason: string | null;
  lastError: string | null;
  totalTasks: number;
  completedTasks: number;
  tasks: BackfillTask[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type BackfillResponse = {
  backfill?: Backfill | null;
  error?: string;
};

const inputClass = "mt-1 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand";

function formatCredits(value: number): string {
  return Math.max(0, value).toLocaleString("en-US");
}

function periodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return `${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)} UTC`;
}

function dateTimeLabel(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed) + " UTC";
}

function backfillStatusLabel(status: Backfill["status"]): string {
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  if (status === "completed") return "Complete";
  return "Cancelled";
}

function cutoffCopy(reason: CutoffReason): string {
  if (reason === "paused") {
    return "Manual pause is active. CORE will not make new paid Social Fetch requests.";
  }
  if (reason === "monthly_cap_reached") {
    return "The UTC monthly cap is exhausted. Paid requests resume next month, or after an administrator raises the cap.";
  }
  return "No cutoff is active. Scheduled paid reads can run within the remaining monthly allowance.";
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-primary">{value}</p>
      {detail ? <p className="mt-1 text-xs text-tertiary">{detail}</p> : null}
    </div>
  );
}

export function SocialFetchControlRoom() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [monthlyCreditCap, setMonthlyCreditCap] = useState("10000");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backfill, setBackfill] = useState<Backfill | null>(null);
  const [backfillMaxCredits, setBackfillMaxCredits] = useState("1000");
  const [backfillArmed, setBackfillArmed] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(true);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);

  const applyBudget = useCallback((next: Budget) => {
    setBudget(next);
    setEnabled(next.enabled);
    setMonthlyCreditCap(String(next.monthlyCreditCap));
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/social-fetch", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as BudgetResponse;
    if (!response.ok || !data.budget) {
      throw new Error(data.error ?? "Unable to load Social Fetch credit controls.");
    }
    applyBudget(data.budget);
  }, [applyBudget]);

  const applyBackfill = useCallback((next: Backfill | null) => {
    setBackfill(next);
    if (next) setBackfillMaxCredits(String(next.maxCredits));
  }, []);

  const loadBackfill = useCallback(async () => {
    const response = await fetch("/api/admin/social-fetch/backfill", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as BackfillResponse;
    if (!response.ok || !("backfill" in data)) {
      throw new Error(data.error ?? "Unable to load the Social Fetch history import.");
    }
    applyBackfill(data.backfill ?? null);
  }, [applyBackfill]);

  useEffect(() => {
    void load()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load Social Fetch credit controls."))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    void loadBackfill()
      .catch((reason) => setBackfillError(reason instanceof Error ? reason.message : "Unable to load the Social Fetch history import."))
      .finally(() => setBackfillLoading(false));
  }, [loadBackfill]);

  useEffect(() => {
    if (backfill?.status !== "running") return;
    const interval = window.setInterval(() => {
      void loadBackfill().catch((reason) => {
        setBackfillError(reason instanceof Error ? reason.message : "Unable to refresh import progress.");
      });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [backfill?.status, loadBackfill]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cap = Number(monthlyCreditCap);
    if (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000) {
      setError("Enter a whole-number monthly cap from 0 to 1,000,000 credits.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/social-fetch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, monthlyCreditCap: cap }),
      });
      const data = (await response.json().catch(() => ({}))) as BudgetResponse;
      if (!response.ok || !data.budget) {
        throw new Error(data.error ?? "Unable to save Social Fetch credit controls.");
      }
      applyBudget(data.budget);
      setNotice("Social Fetch credit controls saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save Social Fetch credit controls.");
    } finally {
      setBusy(false);
    }
  }

  function parsedBackfillCap(): number | null {
    const cap = Number(backfillMaxCredits);
    return Number.isInteger(cap) && cap >= 1 && cap <= 100_000 ? cap : null;
  }

  async function startBackfill() {
    const cap = parsedBackfillCap();
    if (cap === null) {
      setBackfillError("Enter a whole-number import cap from 1 to 100,000 credits.");
      return;
    }
    if (!backfillArmed) {
      setBackfillError("Confirm the private import credit limit before starting.");
      return;
    }
    setBackfillBusy(true);
    setBackfillError(null);
    setBackfillNotice(null);
    try {
      const response = await fetch("/api/admin/social-fetch/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxCredits: cap }),
      });
      const data = (await response.json().catch(() => ({}))) as BackfillResponse;
      if (!response.ok || !data.backfill) {
        throw new Error(data.error ?? "Unable to start the six-month history import.");
      }
      applyBackfill(data.backfill);
      setBackfillArmed(false);
      setBackfillNotice("Six-month history import started. The scheduled reconciler will advance it in small batches.");
    } catch (reason) {
      setBackfillError(reason instanceof Error ? reason.message : "Unable to start the six-month history import.");
    } finally {
      setBackfillBusy(false);
    }
  }

  async function updateBackfill(action: "pause" | "resume") {
    const cap = parsedBackfillCap();
    if (action === "resume" && cap === null) {
      setBackfillError("Enter a whole-number import cap from 1 to 100,000 credits.");
      return;
    }
    setBackfillBusy(true);
    setBackfillError(null);
    setBackfillNotice(null);
    try {
      const response = await fetch("/api/admin/social-fetch/backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "pause" ? { action } : { action, maxCredits: cap }),
      });
      const data = (await response.json().catch(() => ({}))) as BackfillResponse;
      if (!response.ok || !data.backfill) {
        throw new Error(data.error ?? `Unable to ${action} the history import.`);
      }
      applyBackfill(data.backfill);
      setBackfillNotice(action === "pause" ? "History import paused." : "History import resumed.");
    } catch (reason) {
      setBackfillError(reason instanceof Error ? reason.message : `Unable to ${action} the history import.`);
    } finally {
      setBackfillBusy(false);
    }
  }

  if (loading && !budget) {
    return <p role="status" className="text-sm text-tertiary">Loading private credit controls…</p>;
  }

  return (
    <div className="space-y-5">
      {error ? <p role="alert" className="rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary">{notice}</p> : null}

      {budget ? (
        <>
          <section aria-label="Social Fetch monthly credit usage" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Provider status"
                value={budget.cutoffReason ? "Cut off" : "Active"}
                detail={budget.paused ? "Manually paused" : budget.cutoffReason === "monthly_cap_reached" ? "Monthly cap reached" : "Paid reads permitted"}
              />
              <Metric label="Charged" value={formatCredits(budget.creditsCharged)} detail={`${formatCredits(budget.requestsCompleted)} completed requests`} />
              <Metric label="Reserved" value={formatCredits(budget.creditsReserved)} detail={`${formatCredits(budget.requestsReserved)} requests in progress`} />
              <Metric label="Remaining" value={formatCredits(budget.creditsRemaining)} detail={`of ${formatCredits(budget.monthlyCreditCap)} monthly credits`} />
            </div>

            <div className={`rounded-xl border p-4 ${budget.cutoffReason ? "border-error-subtle bg-error-primary" : "border-secondary bg-primary"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Private cutoff state</p>
                  <p className="mt-1 text-sm text-tertiary">{cutoffCopy(budget.cutoffReason)}</p>
                </div>
                <span className="rounded-full border border-secondary bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary">
                  {periodLabel(budget.currentPeriodUtc)}
                </span>
              </div>
              <p className="mt-3 text-xs text-tertiary">
                {formatCredits(budget.creditsCommitted)} committed · {formatCredits(budget.confirmedCreditsCharged)} provider-confirmed · {formatCredits(budget.estimatedCreditsCharged)} conservatively estimated
              </p>
            </div>
          </section>

          <form onSubmit={save} className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-primary">Hard spend controls</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tertiary">
                  The database checks this switch and cap before every paid Social Fetch request, including scheduled media discovery and follower snapshots.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  disabled={busy}
                />
                Paid refresh enabled
              </label>
            </div>

            <div className="mt-5 max-w-sm">
              <label className="text-xs font-semibold text-tertiary">
                Monthly credit cap (UTC)
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  inputMode="numeric"
                  value={monthlyCreditCap}
                  onChange={(event) => setMonthlyCreditCap(event.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="mt-2 text-xs leading-relaxed text-tertiary">
                Set 0 for an immediate hard cutoff. Lowering the cap below this month&apos;s committed usage stops new paid reads; it never deletes stored posts.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-5 inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save controls"}
            </button>
          </form>
        </>
      ) : null}

      <section aria-label="Six-month Social Fetch history import" className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">Six-month history import</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tertiary">
              Imports TikTok videos, Instagram photos and Reels, and X posts for all six members plus CORE. It is resumable, advances only in small scheduled batches, and never sends notifications for historical rows.
            </p>
          </div>
          {backfill ? (
            <span className="rounded-full border border-secondary bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary">
              {backfillStatusLabel(backfill.status)}
            </span>
          ) : null}
        </div>

        {backfillError ? <p role="alert" className="mt-4 rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary">{backfillError}</p> : null}
        {backfillNotice ? <p role="status" className="mt-4 rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary">{backfillNotice}</p> : null}

        {backfillLoading && !backfill ? (
          <p role="status" className="mt-4 text-sm text-tertiary">Loading private import state…</p>
        ) : backfill ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Sources finished" value={`${formatCredits(backfill.completedTasks)} / ${formatCredits(backfill.totalTasks)}`} detail="28 account and surface tasks" />
              <Metric label="Pages read" value={formatCredits(backfill.pagesProcessed)} detail="TikTok/Instagram reserve 1 credit per page; X reserves 2" />
              <Metric label="Posts saved" value={formatCredits(backfill.itemsRecorded)} detail="Canonical rows; duplicates are ignored" />
              <Metric label="Import allowance" value={formatCredits(backfill.creditsRemaining)} detail={`remaining of ${formatCredits(backfill.maxCredits)}`} />
            </div>

            <div className="mt-4 rounded-lg border border-secondary bg-secondary p-4 text-sm text-tertiary">
              <p className="font-semibold text-primary">Fixed historical window</p>
              <p className="mt-1">{dateTimeLabel(backfill.cutoffAt)} through {dateTimeLabel(backfill.backfillBeforeAt)}</p>
              <p className="mt-2 text-xs leading-relaxed">
                The newest notification-safety window is deliberately excluded so normal reconciliation owns current-post alerts. Progress last changed {dateTimeLabel(backfill.updatedAt)}.
              </p>
              {backfill.pauseReason ? <p className="mt-2 text-xs font-semibold text-primary">Private pause reason: {backfill.pauseReason}</p> : null}
              {backfill.lastError ? <p className="mt-1 text-xs text-primary">Last private error: {backfill.lastError}</p> : null}
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-tertiary">No history import has been started.</p>
        )}

        <div className="mt-5 max-w-sm">
          <label className="text-xs font-semibold text-tertiary">
            Total import credit cap
            <input
              className={inputClass}
              type="number"
              min="1"
              max="100000"
              step="1"
              inputMode="numeric"
              value={backfillMaxCredits}
              onChange={(event) => setBackfillMaxCredits(event.target.value)}
              disabled={backfillBusy || backfill?.status === "running"}
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-tertiary">
            This is a second hard ceiling for this import. The global monthly cap above still applies first. The default is 1,000 credits.
          </p>
        </div>

        {!backfill || backfill.status === "completed" || backfill.status === "cancelled" ? (
          <label className="mt-4 flex max-w-2xl items-start gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              checked={backfillArmed}
              onChange={(event) => setBackfillArmed(event.target.checked)}
              disabled={backfillBusy}
            />
            I confirm this private six-month import may use up to the credit limit entered above.
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {!backfill || backfill.status === "completed" || backfill.status === "cancelled" ? (
            <button
              type="button"
              onClick={() => void startBackfill()}
              disabled={backfillBusy || !backfillArmed}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50"
            >
              {backfillBusy ? "Starting…" : "Start six-month import"}
            </button>
          ) : backfill.status === "running" ? (
            <button
              type="button"
              onClick={() => void updateBackfill("pause")}
              disabled={backfillBusy}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50"
            >
              {backfillBusy ? "Pausing…" : "Pause import"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void updateBackfill("resume")}
              disabled={backfillBusy}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50"
            >
              {backfillBusy ? "Resuming…" : "Resume with this cap"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setBackfillLoading(true);
              setBackfillError(null);
              void loadBackfill()
                .catch((reason) => setBackfillError(reason instanceof Error ? reason.message : "Unable to refresh import progress."))
                .finally(() => setBackfillLoading(false));
            }}
            disabled={backfillBusy || backfillLoading}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:opacity-50"
          >
            {backfillLoading ? "Refreshing…" : "Refresh progress"}
          </button>
        </div>

        {backfill?.tasks.length ? (
          <details className="mt-5 rounded-lg border border-secondary bg-secondary p-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Account and surface progress</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {backfill.tasks.map((task) => (
                <div key={`${task.provider}:${task.surface}:${task.handle}`} className="rounded-lg bg-primary p-3 text-xs text-tertiary ring-1 ring-inset ring-secondary">
                  <p className="font-semibold text-primary">{task.accountLabel} · {task.provider} {task.surface}</p>
                  <p className="mt-1">@{task.handle} · {task.status}</p>
                  <p className="mt-1">{formatCredits(task.pagesProcessed)} pages · {formatCredits(task.itemsRecorded)} saved</p>
                  {task.lastError ? <p className="mt-1 text-primary">{task.lastError}</p> : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}

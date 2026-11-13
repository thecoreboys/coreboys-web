"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

const endpoint = "/api/admin/feature-grants";
const field = "mt-1 min-h-11 w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-secondary bg-primary px-4 text-sm font-semibold text-primary disabled:opacity-50";

type Grant = {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: "active" | "expired" | "revoked";
  expiresAt: string | null;
  note: string | null;
  changedAt: string;
};

const STATUS_STYLE: Record<Grant["status"], string> = {
  active: "bg-success-secondary text-success-primary ring-success-primary/20",
  expired: "bg-warning-secondary text-warning-primary ring-warning-primary/20",
  revoked: "bg-secondary text-tertiary ring-secondary",
};

const date = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Complimentary access to creator tags and on-screen detection. Paid members
 * already have it through their plan; this list is for accounts that should
 * have it without one (staff, partners, testers).
 */
export function CreatorTagAccessManager() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [email, setEmail] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error ?? "Access list could not load.");
    if (value.migrationRequired) setMessage("Run the subscription migrations before granting access.");
    setGrants(value.grants ?? []);
  }, []);

  useEffect(() => {
    void load().catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [load]);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error ?? "Change could not be saved.");
      setGrants(value.grants ?? []);
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Change could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function grant(event: FormEvent) {
    event.preventDefault();
    // A date input is a local calendar day; access lasts through its end.
    const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : null;
    if (await send({ action: "grant", email, expiresAt, note: note || undefined }, `Access granted to ${email}. It applies on their next page load.`)) {
      setEmail("");
      setExpires("");
      setNote("");
    }
  }

  const visible = showInactive ? grants : grants.filter((entry) => entry.status === "active");
  const inactiveCount = grants.length - grants.filter((entry) => entry.status === "active").length;

  return (
    <section className="space-y-5" aria-labelledby="creator-tag-access-heading">
      <div>
        <h2 id="creator-tag-access-heading" className="text-xl font-semibold text-primary">On-screen detection access</h2>
        <p className="mt-2 max-w-2xl text-sm text-tertiary">
          Paid members get creator tags and on-screen detection with their plan. Add an account here to give it the same access without a plan. Revoking takes effect on the account’s next request.
        </p>
      </div>
      {message ? <p role="status" className="rounded-lg border border-secondary bg-primary p-3 text-sm text-primary">{message}</p> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <form className="space-y-3 rounded-xl border border-secondary bg-primary p-5" onSubmit={(event) => void grant(event)}>
          <h3 className="font-semibold text-primary">Grant access</h3>
          <label className="block text-sm text-secondary">Account email<input className={field} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} autoComplete="off" /></label>
          <label className="block text-sm text-secondary">Expires (optional)<input className={field} type="date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpires(event.target.value)} /></label>
          <label className="block text-sm text-secondary">Note (optional)<input className={field} value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="e.g. Partner preview" /></label>
          <button className={button} disabled={busy || !email}>Grant access</button>
        </form>
        <div className="rounded-xl border border-secondary bg-primary p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-primary">Accounts with complimentary access · {grants.filter((entry) => entry.status === "active").length}</h3>
            {inactiveCount ? (
              <label className="flex items-center gap-2 text-sm text-tertiary">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show expired and revoked ({inactiveCount})
              </label>
            ) : null}
          </div>
          {loading ? <p role="status" className="mt-4 text-sm text-tertiary">Loading…</p> : null}
          {!loading && !visible.length ? <p className="mt-4 text-sm text-tertiary">No accounts yet.</p> : null}
          <ul className="mt-4 divide-y divide-secondary">
            {visible.map((entry) => (
              <li key={entry.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">{entry.displayName || entry.email || entry.userId}</p>
                  <p className="truncate text-xs text-tertiary">
                    {entry.email ?? entry.userId}
                    {entry.expiresAt ? ` · ${entry.status === "expired" ? "expired" : "until"} ${date(entry.expiresAt)}` : entry.status === "active" ? " · no expiry" : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${STATUS_STYLE[entry.status]}`}>{entry.status}</span>
                {entry.status === "active" ? (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove on-screen detection access for ${entry.email ?? entry.userId}?`)) {
                        void send({ action: "revoke", userId: entry.userId }, "Access removed.");
                      }
                    }}
                  >
                    Revoke
                  </button>
                ) : entry.email ? (
                  <button type="button" className={button} disabled={busy} onClick={() => void send({ action: "grant", email: entry.email, expiresAt: null }, `Access restored for ${entry.email}.`)}>
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MemberOption = { slug: string; name: string };
type StaffRole = "admin" | "member_manager";
type StaffAccount = {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  memberSlug: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  twoFactorEnabled: boolean;
};

type Draft = Pick<StaffAccount, "email" | "displayName" | "role" | "memberSlug"> & {
  password: string;
};

const inputClass = "min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand";
const buttonClass = "inline-flex min-h-9 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-45";

export function StaffAccountsManager({ members }: { members: MemberOption[] }) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [create, setCreate] = useState({
    email: "",
    displayName: "",
    password: "",
    role: "member_manager" as StaffRole,
    memberSlug: members[0]?.slug ?? "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/accounts", { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        accounts?: StaffAccount[];
        currentStaffId?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Unable to load staff accounts.");
      const rows = json.accounts ?? [];
      setAccounts(rows);
      setCurrentStaffId(json.currentStaffId ?? null);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, {
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        memberSlug: row.memberSlug,
        password: "",
      }])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load staff accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAdmins = useMemo(
    () => accounts.filter((account) => account.active && account.role === "admin").length,
    [accounts],
  );

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusyId("create");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...create,
          memberSlug: create.role === "admin" ? null : create.memberSlug,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to create staff account.");
      setCreate({
        email: "",
        displayName: "",
        password: "",
        role: "member_manager",
        memberSlug: members[0]?.slug ?? "",
      });
      setNotice("Staff account created.");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create staff account.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveAccount(account: StaffAccount) {
    const draft = drafts[account.id];
    if (!draft) return;
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email,
          displayName: draft.displayName,
          role: draft.role,
          memberSlug: draft.role === "admin" ? null : draft.memberSlug,
          ...(draft.password ? { password: draft.password } : {}),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to update staff account.");
      setNotice("Staff account updated.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update staff account.");
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(account: StaffAccount, active: boolean) {
    if (!active && !window.confirm(`Deactivate ${account.displayName}? They will lose access immediately.`)) return;
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, active
        ? {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true }),
          }
        : { method: "DELETE" });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to change account status.");
      setNotice(active ? "Staff account reactivated." : "Staff account deactivated.");
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to change account status.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetTwoFactor(account: StaffAccount) {
    if (!window.confirm(`Reset two-factor authentication for ${account.displayName}? Their active sessions will end and they must enroll again.`)) return;
    setBusyId(account.id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}/totp-reset`, { method: "POST" });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to reset two-factor authentication.");
      setNotice("Two-factor authentication reset. The admin must enroll at their next sign-in.");
      await load();
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Unable to reset two-factor authentication."); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={createAccount} className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary">Add staff account</h2>
            <p className="mt-1 text-sm text-tertiary">Admins have the whole desk. Member managers are locked to one member Studio.</p>
          </div>
          <span className="text-xs text-quaternary">{activeAdmins} active admin{activeAdmins === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-tertiary">Display name<input required className={`mt-1 ${inputClass}`} value={create.displayName} onChange={(event) => setCreate((value) => ({ ...value, displayName: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-tertiary">Email<input required type="email" autoComplete="off" className={`mt-1 ${inputClass}`} value={create.email} onChange={(event) => setCreate((value) => ({ ...value, email: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-tertiary">Temporary password<input required minLength={12} type="password" autoComplete="new-password" className={`mt-1 ${inputClass}`} value={create.password} onChange={(event) => setCreate((value) => ({ ...value, password: event.target.value }))} /></label>
          <label className="text-xs font-semibold text-tertiary">Role<select className={`mt-1 ${inputClass}`} value={create.role} onChange={(event) => setCreate((value) => ({ ...value, role: event.target.value as StaffRole }))}><option value="member_manager">Member manager</option><option value="admin">Admin</option></select></label>
          <label className="text-xs font-semibold text-tertiary">Member<select disabled={create.role === "admin"} className={`mt-1 ${inputClass}`} value={create.role === "admin" ? "" : create.memberSlug} onChange={(event) => setCreate((value) => ({ ...value, memberSlug: event.target.value }))}><option value="">All members</option>{members.map((member) => <option key={member.slug} value={member.slug}>{member.name}</option>)}</select></label>
        </div>
        <button className={`mt-4 ${buttonClass}`} disabled={busyId !== null}>{busyId === "create" ? "Creating…" : "Create account"}</button>
      </form>

      {error ? <p role="alert" className="rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary">{notice}</p> : null}

      {loading ? <div className="h-40 animate-pulse rounded-xl bg-primary" /> : (
        <ul className="space-y-3">
          {accounts.map((account) => {
            const draft = drafts[account.id];
            if (!draft) return null;
            const current = account.id === currentStaffId;
            return (
              <li key={account.id} className={`rounded-xl bg-primary p-5 ring-1 ring-inset ${account.active ? "ring-secondary" : "ring-secondary opacity-65"}`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-primary">{account.displayName}</strong>
                    {current ? <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-brand-secondary">You</span> : null}
                    {account.role === "admin" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${account.twoFactorEnabled ? "bg-success-primary text-success-secondary" : "bg-warning-primary text-warning-secondary"}`}>{account.twoFactorEnabled ? "2FA enabled" : "2FA enrollment required"}</span> : null}
                    {!account.active ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-tertiary">Inactive</span> : null}
                  </div>
                  <span className="text-xs text-quaternary">Updated {new Date(account.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-semibold text-tertiary">Display name<input className={`mt-1 ${inputClass}`} value={draft.displayName} onChange={(event) => setDrafts((all) => ({ ...all, [account.id]: { ...draft, displayName: event.target.value } }))} /></label>
                  <label className="text-xs font-semibold text-tertiary">Email<input type="email" className={`mt-1 ${inputClass}`} value={draft.email} onChange={(event) => setDrafts((all) => ({ ...all, [account.id]: { ...draft, email: event.target.value } }))} /></label>
                  <label className="text-xs font-semibold text-tertiary">New password<input minLength={12} type="password" autoComplete="new-password" placeholder="Leave unchanged" className={`mt-1 ${inputClass}`} value={draft.password} onChange={(event) => setDrafts((all) => ({ ...all, [account.id]: { ...draft, password: event.target.value } }))} /></label>
                  <label className="text-xs font-semibold text-tertiary">Role<select disabled={current} className={`mt-1 ${inputClass}`} value={draft.role} onChange={(event) => { const role = event.target.value as StaffRole; setDrafts((all) => ({ ...all, [account.id]: { ...draft, role, memberSlug: role === "admin" ? null : draft.memberSlug ?? members[0]?.slug ?? null } })); }}><option value="member_manager">Member manager</option><option value="admin">Admin</option></select></label>
                  <label className="text-xs font-semibold text-tertiary">Member<select disabled={draft.role === "admin" || current} className={`mt-1 ${inputClass}`} value={draft.memberSlug ?? ""} onChange={(event) => setDrafts((all) => ({ ...all, [account.id]: { ...draft, memberSlug: event.target.value || null } }))}><option value="">All members</option>{members.map((member) => <option key={member.slug} value={member.slug}>{member.name}</option>)}</select></label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busyId !== null} onClick={() => void saveAccount(account)}>{busyId === account.id ? "Saving…" : "Save changes"}</button>
                  <button type="button" className={buttonClass} disabled={busyId !== null || current} onClick={() => void setActive(account, !account.active)}>{account.active ? "Deactivate" : "Reactivate"}</button>
                  {account.role === "admin" ? <button type="button" className={buttonClass} disabled={busyId !== null} onClick={() => void resetTwoFactor(account)}>Reset 2FA</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

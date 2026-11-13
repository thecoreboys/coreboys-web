"use client";

import { useCallback, useEffect, useState } from "react";
import { Download01, Trash01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ConfirmDialog } from "@/components/account/ConfirmDialog";
import { InlineNotice, SettingsCard } from "@/components/account/SettingsCard";

type RequestRow = { scheduledFor: string; status: string } | null;

export function AccountDataExportCard({ accountId }: { accountId: string }) {
  return (
    <SettingsCard
      id="data-export"
      icon={Download01}
      title="Download your data"
      description="Get a copy of your profile, connections, preferences, and activity as a JSON file."
      actions={
        <Button color="secondary" size="sm" href={`/api/account/export?accountId=${encodeURIComponent(accountId)}` as never} iconLeading={Download01}>
          Export my data
        </Button>
      }
    />
  );
}

export function AccountDeletionCard() {
  const [request, setRequest] = useState<RequestRow>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusFailed(false);
    try {
      const response = await fetch("/api/account/deletion", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load deletion status.");
      const data = await response.json() as { request?: RequestRow };
      setRequest(data.request ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load deletion status.");
      setStatusFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function submit(action?: "cancel"): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      const response = await fetch("/api/account/deletion", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action ? { action } : {}),
      });
      const data = await response.json().catch(() => ({})) as { request?: RequestRow; error?: string };
      if (!response.ok) throw new Error(data.error ?? (action ? "Deletion couldn’t be cancelled." : "Account deletion could not be scheduled."));
      setRequest(data.request ?? null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Account deletion could not be scheduled.";
      if (action) setError(message);
      else setDialogError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      id="account-deletion"
      icon={Trash01}
      tone="danger"
      title="Delete account"
      description="Your account is deleted 14 days after you request it, and you can cancel any time before then. Cancel any renewing membership in Billing first."
    >
      {error ? <div className="mb-4"><InlineNotice tone="error">{error}</InlineNotice></div> : null}
      {loading ? (
        <p className="text-sm text-tertiary" role="status">Checking deletion status…</p>
      ) : statusFailed ? (
        <Button color="secondary" size="sm" onClick={() => void loadStatus()}>Try again</Button>
      ) : request ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-error-primary p-4 ring-1 ring-inset ring-error_subtle">
          <p className="text-sm font-medium text-error-primary">
            Scheduled for deletion on {new Date(request.scheduledFor).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
          <Button color="secondary" size="sm" onClick={() => void submit("cancel")} isLoading={busy} showTextWhileLoading>
            Keep my account
          </Button>
        </div>
      ) : (
        <Button color="secondary-destructive" size="sm" onClick={() => { setDialogError(null); setConfirming(true); }}>
          Request deletion
        </Button>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Delete your CORE account?"
        description={
          <>
            <p>Your account, profile, connections, and activity will be permanently deleted in 14 days. You can cancel from this page until then.</p>
            <p className="mt-2">Deleting your account doesn’t cancel a renewing membership. Cancel it in Billing first.</p>
          </>
        }
        confirmText="DELETE"
        confirmLabel="Schedule deletion"
        busy={busy}
        error={dialogError}
        onConfirm={() => {
          void submit().then((ok) => {
            if (ok) setConfirming(false);
          });
        }}
      />
    </SettingsCard>
  );
}

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Lock01, LogOut01, Monitor01 } from "@untitledui/icons";
import { useAuth, type FanUser } from "@/components/providers/AuthProvider";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/account/ConfirmDialog";
import { InlineNotice, SettingsCard } from "@/components/account/SettingsCard";
import { accountRequest, formatWait } from "@/components/account/account-client";
import { changePasswordSchema, fieldErrors, passwordStrength } from "@/lib/account/account-schemas";
import { cx } from "@/utils/cx";

type Notice = { tone: "success" | "error" | "info"; message: string } | null;

export function AccountSecurity({ user }: { user: FanUser }) {
  return (
    <div id="security" className="scroll-mt-32 space-y-5">
      <ChangePasswordCard user={user} />
      <SessionsCard user={user} />
    </div>
  );
}

const STRENGTH_STYLES = ["bg-quaternary", "bg-error-solid", "bg-warning-solid", "bg-success-solid", "bg-success-solid"] as const;

function ChangePasswordCard({ user }: { user: FanUser }) {
  const { refresh } = useAuth();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const strength = passwordStrength(values.newPassword);

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setNotice(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    const result = await accountRequest<{ ok?: boolean }>("/api/account/password", user.id, { method: "POST", body: parsed.data }, "Your password couldn’t be changed. Try again.");
    setSaving(false);
    if (result.ok && result.data.ok) {
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setErrors({});
      setNotice({ tone: "success", message: "Password updated. You’re still signed in here, and every other device has been signed out." });
      refresh();
      return;
    }
    if (!result.ok) {
      setErrors(result.fields);
      setNotice({
        tone: "error",
        message: result.status === 429 && result.retryAfterSeconds ? `Too many attempts. Try again in ${formatWait(result.retryAfterSeconds)}.` : result.error,
      });
    } else {
      setNotice({ tone: "error", message: "The server didn’t confirm the change. Try again." });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Lets password managers associate the new password with this account. */}
      <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
      <SettingsCard
        id="password"
        icon={Lock01}
        title="Change password"
        description="Changing your password signs you out everywhere else. This device stays signed in."
        footer={
          <>
            <Link href={`/forgot-password?next=${encodeURIComponent("/account/settings#security")}` as never} className="mr-auto text-sm font-medium text-tertiary hover:text-primary hover:underline hover:underline-offset-4">
              Forgot your current password?
            </Link>
            <Button type="submit" color="primary" size="sm" isLoading={saving} showTextWhileLoading isDisabled={!values.currentPassword || !values.newPassword || !values.confirmPassword}>
              Update password
            </Button>
          </>
        }
      >
        <div className="grid max-w-xl gap-5">
          <Input
            type="password"
            size="md"
            label="Current password"
            value={values.currentPassword}
            onChange={set("currentPassword")}
            autoComplete="current-password"
            isInvalid={Boolean(errors.currentPassword)}
            hint={errors.currentPassword}
            isDisabled={saving}
            isRequired
          />
          <div>
            <Input
              type="password"
              size="md"
              label="New password"
              value={values.newPassword}
              onChange={set("newPassword")}
              autoComplete="new-password"
              isInvalid={Boolean(errors.newPassword)}
              hint={errors.newPassword ?? "At least 8 characters. A longer phrase is stronger than a short, complex one."}
              isDisabled={saving}
              isRequired
            />
            {values.newPassword ? (
              <div className="mt-2" aria-live="polite">
                <div className="flex gap-1" aria-hidden>
                  {[1, 2, 3, 4].map((step) => (
                    <span key={step} className={cx("h-1 flex-1 rounded-full", step <= strength.score ? STRENGTH_STYLES[strength.score] : "bg-tertiary")} />
                  ))}
                </div>
                <p className="mt-1 text-xs text-tertiary">Strength: <span className="font-medium text-secondary">{strength.label}</span></p>
              </div>
            ) : null}
          </div>
          <Input
            type="password"
            size="md"
            label="Confirm new password"
            value={values.confirmPassword}
            onChange={set("confirmPassword")}
            autoComplete="new-password"
            isInvalid={Boolean(errors.confirmPassword)}
            hint={errors.confirmPassword}
            isDisabled={saving}
            isRequired
          />
        </div>
        {notice ? <div className="mt-5 max-w-xl"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      </SettingsCard>
    </form>
  );
}

function SessionsCard({ user }: { user: FanUser }) {
  const { logout, refresh } = useAuth();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function revokeOthers() {
    setRevoking(true);
    setDialogError(null);
    const result = await accountRequest<{ ok?: boolean }>("/api/account/sessions", user.id, { method: "POST", body: { scope: "others" } }, "Other devices couldn’t be signed out. Try again.");
    setRevoking(false);
    if (result.ok && result.data.ok) {
      setConfirmOthers(false);
      setNotice({ tone: "success", message: "All other devices have been signed out." });
      refresh();
    } else {
      setDialogError(!result.ok && result.status === 429 && result.retryAfterSeconds ? `Too many attempts. Try again in ${formatWait(result.retryAfterSeconds)}.` : !result.ok ? result.error : "The server didn’t confirm the change. Try again.");
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      // A full load clears every account-scoped client cache after sign-out.
      window.location.assign("/");
    } catch {
      setSigningOut(false);
      setNotice({ tone: "error", message: "You couldn’t be signed out. Check your connection and try again." });
    }
  }

  return (
    <SettingsCard
      id="sessions"
      icon={Monitor01}
      title="Where you’re signed in"
      description="Lost a device or signed in somewhere shared? Sign out of every other browser and app at once."
    >
      <ul className="divide-y divide-[color:var(--color-border-secondary)]">
        <li className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">Sign out of all other devices</p>
            <p className="mt-0.5 text-sm text-tertiary">You’ll stay signed in on this device.</p>
          </div>
          <Button color="secondary" size="sm" onClick={() => { setDialogError(null); setConfirmOthers(true); }}>
            Sign out other devices
          </Button>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">Sign out</p>
            <p className="mt-0.5 break-all text-sm text-tertiary">Signed in as {user.email}</p>
          </div>
          <Button color="secondary-destructive" size="sm" iconLeading={LogOut01} onClick={() => void signOut()} isLoading={signingOut} showTextWhileLoading>
            Sign out
          </Button>
        </li>
      </ul>
      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      <ConfirmDialog
        isOpen={confirmOthers}
        onOpenChange={setConfirmOthers}
        title="Sign out of all other devices?"
        description="Every other browser and app signed in to your CORE account will need to sign in again. This device stays signed in."
        confirmLabel="Sign out other devices"
        onConfirm={() => void revokeOthers()}
        busy={revoking}
        error={dialogError}
        destructive={false}
      />
    </SettingsCard>
  );
}

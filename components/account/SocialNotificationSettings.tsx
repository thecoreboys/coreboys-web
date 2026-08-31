"use client";

import { useEffect, useState } from "react";
import { Bell01, Mail01, NotificationBox, VideoRecorder } from "@untitledui/icons";
import { Toggle } from "@/components/base/toggle/toggle";
import type { SocialContentType } from "@/lib/social-alert";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";

const types: Array<{ key: SocialContentType; label: string }> = [
  { key: "live", label: "Live" },
  { key: "video", label: "Videos" },
  { key: "short", label: "Shorts" },
  { key: "photo", label: "Photos" },
  { key: "post", label: "Posts" },
];
type Settings = {
  enabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  rules: Array<{ memberSlug: string; contentType: SocialContentType; enabled: boolean }>;
};
type ChannelReadiness = { configured: boolean; ready: boolean; missing: string[]; invalid?: string[] };
type DeliveryReadiness = {
  enabled: boolean;
  push: ChannelReadiness;
  email: ChannelReadiness & { enabled: boolean };
};
const defaults: Settings = {
  enabled: true,
  inAppEnabled: true,
  pushEnabled: false,
  emailEnabled: false,
  rules: [],
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function SocialNotificationSettings({ members }: { members: Array<{ slug: string; stageName: string }> }) {
  const subscription = useSubscription();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [deliveryReadiness, setDeliveryReadiness] = useState<DeliveryReadiness | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/account/social-notifications", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.settings) setSettings(data.settings);
        if (data?.readiness) setDeliveryReadiness(data.readiness);
        setEmailVerified(data?.emailVerified === true);
        setReady(true);
      })
      .catch(() => {
        setMessage("Couldn’t load alert settings.");
        setReady(true);
      });
  }, []);

  async function save(next: Settings) {
    const previous = settings;
    setSettings(next);
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/social-notifications", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error("Email and browser alerts are part of CORE Membership.");
        throw new Error();
      }
      const data = await response.json().catch(() => null);
      if (data?.settings) setSettings(data.settings);
      if (data?.readiness) setDeliveryReadiness(data.readiness);
      setEmailVerified(data?.emailVerified === true);
      setMessage("Saved");
    } catch {
      setSettings(previous);
      setMessage("Couldn’t save that change.");
    } finally {
      setSaving(false);
    }
  }

  function ruleEnabled(memberSlug: string, contentType: SocialContentType) {
    return settings.rules.find((rule) => rule.memberSlug === memberSlug && rule.contentType === contentType)?.enabled ?? true;
  }

  function setRule(memberSlug: string, contentType: SocialContentType, enabled: boolean) {
    const rules = settings.rules.filter((rule) => !(rule.memberSlug === memberSlug && rule.contentType === contentType));
    void save({ ...settings, rules: [...rules, { memberSlug, contentType, enabled }] });
  }

  async function setPush(enabled: boolean) {
    if (!enabled) {
      void save({ ...settings, pushEnabled: false });
      return;
    }
    try {
      const availability = await fetch("/api/account/push-subscriptions").then((response) => response.json());
      if (!availability.enabled || !availability.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("unsupported");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("denied");
      const registration = await navigator.serviceWorker.register("/core-push-sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(availability.publicKey),
      });
      const result = await fetch("/api/account/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!result.ok) throw new Error(result.status === 403 ? "membership" : "save");
      void save({ ...settings, pushEnabled: true });
    } catch (error) {
      setMessage(error instanceof Error && error.message === "membership" ? "Browser alerts are included with CORE Membership." : "Browser alerts need permission and configured push delivery.");
    }
  }

  async function sendVerificationEmail() {
    setSendingVerification(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/email-verification", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429 && Number.isFinite(data?.retryAfterSeconds)) {
          throw new Error("Verification email already sent. Check your inbox for the latest link.");
        }
        throw new Error("Couldn’t send the verification email.");
      }
      if (data?.state === "already_verified") {
        setEmailVerified(true);
        setMessage("Email verified");
      } else {
        setMessage("Verification email sent");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t send the verification email.");
    } finally {
      setSendingVerification(false);
    }
  }

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  const pushUnavailable = deliveryReadiness?.push.ready !== true;
  const advancedLocked = !subscription.loading && !subscription.hasFeature("notifications.advanced");
  const emailUnavailable = advancedLocked || deliveryReadiness?.email.ready !== true || !emailVerified;
  const pushHint = deliveryReadiness?.enabled === false
    ? "Notification delivery is temporarily unavailable"
    : advancedLocked
      ? "CORE Membership required"
      : pushUnavailable
      ? "Unavailable until browser delivery is configured"
      : undefined;
  const emailHint = deliveryReadiness?.enabled === false
    ? "Notification delivery is temporarily unavailable"
    : advancedLocked
      ? "CORE Membership required"
      : deliveryReadiness?.email.ready !== true
      ? "Unavailable until email delivery is configured"
    : !emailVerified
      ? "Verify your account email to enable"
      : undefined;

  return (
    <section className="overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="flex gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-primary text-brand-secondary">
            <Bell01 className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-primary">Creator alerts</h2>
            <p className="mt-1 max-w-xl text-sm text-tertiary">
              In-app alerts are on by default. Browser alerts and email only turn on after you opt in.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-tertiary">{saving ? "Saving…" : message}</span>
      </div>
      <div className="grid border-y border-secondary sm:grid-cols-2 xl:grid-cols-4">
        <SettingToggle icon={VideoRecorder} label="All alerts" selected={settings.enabled} onChange={(enabled) => void save({ ...settings, enabled })} />
        <SettingToggle icon={Bell01} label="In-app" selected={settings.inAppEnabled} onChange={(inAppEnabled) => void save({ ...settings, inAppEnabled })} />
        <SettingToggle icon={NotificationBox} label="Browser push" selected={settings.pushEnabled} disabled={advancedLocked || pushUnavailable} hint={pushHint} onChange={setPush} />
        <SettingToggle icon={Mail01} label="Email" selected={settings.emailEnabled} disabled={emailUnavailable} hint={emailHint} onChange={(emailEnabled) => void save({ ...settings, emailEnabled })} />
      </div>
      {advancedLocked ? <div className="border-b border-secondary px-5 py-3 text-sm text-tertiary">Email and browser alerts are included with <Link href={subscription.featureHref("notifications.advanced") as never} className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">CORE Membership</Link>. In-app alerts remain available to everyone.</div> : null}
      {!emailVerified && deliveryReadiness?.email.configured === true && deliveryReadiness.email.enabled === true && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-5 py-3 text-sm text-tertiary">
          <span>Verify your account email before turning on creator-alert emails.</span>
          <button
            type="button"
            disabled={sendingVerification}
            onClick={() => void sendVerificationEmail()}
            className="rounded-lg bg-brand-solid px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendingVerification ? "Sending…" : "Send verification email"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[12rem_repeat(5,1fr)] border-b border-secondary px-5 py-3 text-xs font-semibold text-tertiary">
            <span>Creator</span>
            {types.map((type) => <span key={type.key} className="text-center">{type.label}</span>)}
          </div>
          {members.map((member) => (
            <div key={member.slug} className="grid grid-cols-[12rem_repeat(5,1fr)] items-center border-b border-secondary px-5 py-3 last:border-0">
              <span className="text-sm font-semibold text-primary">{member.stageName}</span>
              {types.map((type) => (
                <span key={type.key} className="flex justify-center">
                  <Toggle size="sm" isSelected={ruleEnabled(member.slug, type.key)} onChange={(enabled) => setRule(member.slug, type.key, enabled)} aria-label={`${member.stageName} ${type.label} alerts`} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingToggle({
  icon: Icon,
  label,
  selected,
  disabled = false,
  hint,
  onChange,
}: {
  icon: typeof Bell01;
  label: string;
  selected: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-secondary p-4 sm:border-b-0 sm:border-r last:border-0">
      <span className="flex items-start gap-2 text-sm font-semibold text-primary">
        <Icon className="mt-0.5 size-4 shrink-0 text-tertiary" />
        <span>
          {label}
          {hint && <span className="mt-0.5 block text-xs font-normal leading-4 text-tertiary">{hint}</span>}
        </span>
      </span>
      <Toggle size="sm" isSelected={selected} isDisabled={disabled} onChange={onChange} aria-label={label} />
    </div>
  );
}

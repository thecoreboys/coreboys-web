"use client";

import { useEffect, useRef, useState } from "react";
import { waitForPushWorker } from "@/lib/notifications/browser-push";
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

export function SocialNotificationSettings({ members }: { members: Array<{ slug: string; stageName: string; contentTypes?: readonly SocialContentType[] }> }) {
  const subscription = useSubscription();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [deliveryReadiness, setDeliveryReadiness] = useState<DeliveryReadiness | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadFailed(false);
    void fetch("/api/account/social-notifications", { credentials: "same-origin", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("load"); return response.json(); })
      .then((data) => {
        if (!data?.settings) throw new Error("load");
        setSettings(data.settings);
        if (data?.readiness) setDeliveryReadiness(data.readiness);
        setEmailVerified(data?.emailVerified === true);
        setReady(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMessage("Couldn’t load alert settings.");
        setLoadFailed(true);
      });
    return () => controller.abort();
  }, [loadAttempt]);

  async function persist(next: Settings) {
    const previous = settings;
    setSettings(next);
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
        throw new Error("Couldn’t save that change.");
      }
      const data = await response.json().catch(() => null);
      if (data?.settings) setSettings(data.settings);
      if (data?.readiness) setDeliveryReadiness(data.readiness);
      setEmailVerified(data?.emailVerified === true);
      setMessage("Saved");
    } catch (error) {
      setSettings(previous);
      setMessage(error instanceof Error ? error.message : "Couldn’t save that change.");
    }
  }

  async function save(next: Settings) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try { await persist(next); }
    finally { busy.current = false; setSaving(false); }
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
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setMessage("");
    try {
      if (!window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support push alerts here.");
      }
      // Ask within the click gesture, before a network request can consume it.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications for this site in your browser settings to enable alerts.");
      const response = await fetch("/api/account/push-subscriptions");
      const availability = await response.json();
      if (!response.ok || !availability.enabled || !availability.publicKey) throw new Error("Browser alerts are temporarily unavailable. Please try again later.");
      const registration = await navigator.serviceWorker.register("/core-push-sw.js");
      await waitForPushWorker(registration);
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(availability.publicKey),
      });
      const result = await fetch("/api/account/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!result.ok) throw new Error(result.status === 403 ? "Browser alerts are included with CORE Membership." : "Couldn’t register this browser. Please try again.");
      await persist({ ...settings, pushEnabled: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t enable browser alerts. Please try again.");
    } finally {
      busy.current = false;
      setSaving(false);
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

  if (loadFailed) return <div className="rounded-2xl bg-secondary p-6 text-sm text-primary" role="alert">{message} <button type="button" className="ml-2 font-semibold underline" onClick={() => setLoadAttempt((value) => value + 1)}>Try again</button></div>;
  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-secondary" aria-label="Loading alert settings" />;
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
              Choose which CORE members, crew, and content types can alert you. Crew X updates use Posts. In-app alerts are on by default; browser alerts and email are opt-in.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-tertiary" role="status">{saving ? "Saving…" : message}</span>
      </div>
      <div className="grid border-y border-secondary sm:grid-cols-2 xl:grid-cols-4">
        <SettingToggle icon={VideoRecorder} label="All alerts" selected={settings.enabled} disabled={saving} onChange={(enabled) => void save({ ...settings, enabled })} />
        <SettingToggle icon={Bell01} label="In-app" selected={settings.inAppEnabled} disabled={saving} onChange={(inAppEnabled) => void save({ ...settings, inAppEnabled })} />
        <SettingToggle icon={NotificationBox} label="Browser push" selected={settings.pushEnabled} disabled={saving || (!settings.pushEnabled && (advancedLocked || pushUnavailable))} hint={pushHint} onChange={setPush} />
        <SettingToggle icon={Mail01} label="Email" selected={settings.emailEnabled} disabled={saving || (!settings.emailEnabled && emailUnavailable)} hint={emailHint} onChange={(emailEnabled) => void save({ ...settings, emailEnabled })} />
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
      <div data-lenis-prevent className="min-w-0 overflow-x-auto overscroll-x-contain">
        <div className="min-w-0 lg:min-w-[42rem]">
          <div className="hidden grid-cols-[12rem_repeat(5,1fr)] border-b border-secondary px-5 py-3 text-xs font-semibold text-tertiary lg:grid">
            <span>Creator</span>
            {types.map((type) => <span key={type.key} className="text-center">{type.label}</span>)}
          </div>
          {members.map((member) => (
            <div key={member.slug} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-secondary px-4 py-4 last:border-0 sm:grid-cols-3 lg:grid-cols-[12rem_repeat(5,1fr)] lg:gap-0 lg:px-5 lg:py-3">
              <span className="col-span-2 mb-1 text-sm font-semibold text-primary sm:col-span-3 lg:col-span-1 lg:mb-0">{member.stageName}</span>
              {types.map((type) => (
                <span key={type.key} className="flex min-h-11 items-center justify-between gap-2 lg:justify-center">
                  <span className="text-sm text-tertiary lg:hidden">{type.label}</span>
                  {member.contentTypes && !member.contentTypes.includes(type.key)
                    ? <span aria-label="Not available" className="text-tertiary">—</span>
                    : <Toggle size="sm" isSelected={ruleEnabled(member.slug, type.key)} isDisabled={saving} onChange={(enabled) => setRule(member.slug, type.key, enabled)} aria-label={`${member.stageName} ${type.label} alerts`} />}
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

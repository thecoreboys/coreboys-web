"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell01,
  CalendarCheck01,
  CheckCircle,
  Lock01,
  Mail01,
  Phone01,
  PlayCircle,
  Users01,
  VideoRecorder,
} from "@untitledui/icons";
import { Toggle } from "@/components/base/toggle/toggle";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";
import { useSubscription } from "@/hooks/useSubscription";

type NotificationCategory =
  | "live"
  | "new_content"
  | "reminders"
  | "community"
  | "weekly_digest";
type EditableChannel = "email" | "sms";

type Preference = {
  category: NotificationCategory;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: false;
  updatedAt: string | null;
};

const CATEGORY_META: ReadonlyArray<{
  key: NotificationCategory;
  title: string;
  description: string;
  icon: typeof Bell01;
}> = [
  {
    key: "live",
    title: "Live streams",
    description: "When a CORE creator goes live or a scheduled show starts.",
    icon: VideoRecorder,
  },
  {
    key: "new_content",
    title: "New videos & posts",
    description: "Fresh videos, broadcasts, Shorts, Reels, TikToks, and photos.",
    icon: PlayCircle,
  },
  {
    key: "reminders",
    title: "Guide reminders",
    description: "Programs and premieres you save from the Guide timeline.",
    icon: CalendarCheck01,
  },
  {
    key: "community",
    title: "Community & drops",
    description: "Fan polls, events, new releases, and account updates.",
    icon: Users01,
  },
  {
    key: "weekly_digest",
    title: "Weekly recap",
    description: "A concise roundup of what happened across CORE this week.",
    icon: Mail01,
  },
];

function emptyPreferences(): Preference[] {
  return CATEGORY_META.map(({ key }) => ({
    category: key,
    emailEnabled: false,
    smsEnabled: false,
    pushEnabled: false,
    updatedAt: null,
  }));
}

export function NotificationSettings({
  accountEmail,
  accountEmailVerified,
}: {
  accountEmail: string;
  accountEmailVerified: boolean;
}) {
  const subscription = useSubscription();
  const [preferences, setPreferences] = useState<Preference[]>(emptyPreferences);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");

  const preferenceMap = useMemo(
    () => new Map(preferences.map((preference) => [preference.category, preference])),
    [preferences],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError(false);
    try {
      const response = await fetch("/api/account/notification-preferences", {
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { preferences?: Preference[] };
      const incoming = new Map(
        (data.preferences ?? []).map((preference) => [preference.category, preference]),
      );
      setPreferences(
        emptyPreferences().map((defaults) => incoming.get(defaults.category) ?? defaults),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function updatePreference(
    category: NotificationCategory,
    channel: EditableChannel,
    enabled: boolean,
  ) {
    const field = channel === "email" ? "emailEnabled" : "smsEnabled";
    const previous = preferenceMap.get(category)?.[field] ?? false;
    const key = `${category}:${channel}`;

    setPreferences((current) =>
      current.map((preference) =>
        preference.category === category ? { ...preference, [field]: enabled } : preference,
      ),
    );
    setPending((current) => new Set(current).add(key));
    setAnnouncement("");

    try {
      const response = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, channel, enabled }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { preference?: Preference };
      if (data.preference) {
        setPreferences((current) =>
          current.map((preference) =>
            preference.category === category ? data.preference! : preference,
          ),
        );
      }
      setAnnouncement("Notification preference saved.");
    } catch {
      setPreferences((current) =>
        current.map((preference) =>
          preference.category === category ? { ...preference, [field]: previous } : preference,
        ),
      );
      setAnnouncement("That change could not be saved. Try again.");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Loading notification settings">
        <div className="h-36 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
        <div className="h-[30rem] animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-secondary bg-secondary p-6 text-center shadow-lg">
        <Bell01 className="mx-auto size-6 text-quaternary" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-primary">Couldn&apos;t load preferences</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">
          Your current choices have not changed. Check the connection and try again.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="mt-5 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-secondary shadow-xs-skeuomorphic ring-1 ring-inset ring-primary transition hover:bg-primary_hover"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <FeaturedIcon icon={Bell01} size="lg" color="brand" theme="modern" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-primary">Notification preferences</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-tertiary">
                Choose what reaches you and where. Everything starts off, and saving a
                preference never sends a message by itself.
              </p>
            </div>
          </div>
          <div
            className={cx(
              "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
              announcement.startsWith("That change")
                ? "bg-error-primary text-error-primary ring-error_subtle"
                : "bg-success-primary text-success-primary ring-success_subtle",
            )}
          >
            {announcement.startsWith("That change") ? (
              <AlertCircle className="size-3.5" aria-hidden />
            ) : (
              <CheckCircle className="size-3.5" aria-hidden />
            )}
            {announcement.startsWith("That change")
              ? "Not saved"
              : pending.size > 0
                ? "Saving…"
                : "Saved automatically"}
          </div>
        </div>

        <div className="border-t border-secondary bg-primary px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
              <Mail01 className="mt-0.5 size-5 shrink-0 text-brand-secondary" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">Email</p>
                <p className="mt-0.5 truncate text-xs text-tertiary" title={accountEmail}>
                  {accountEmail}
                </p>
                {!accountEmailVerified ? (
                  <p className="mt-1 text-xs font-medium text-warning-primary">
                    Verification is required before delivery.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
              <Phone01 className="mt-0.5 size-5 shrink-0 text-brand-secondary" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-primary">Text / SMS</p>
                <p className="mt-0.5 text-xs leading-5 text-tertiary">
                  Save choices now; verified-number delivery is not active yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_8rem] border-b border-secondary bg-primary px-6 py-3 md:grid">
          <span className="text-xs font-semibold text-tertiary">Notification</span>
          <span className="text-center text-xs font-semibold text-tertiary">Email</span>
          <span className="text-center text-xs font-semibold text-tertiary">Text</span>
          <span className="text-center text-xs font-semibold text-tertiary">Push</span>
        </div>

        <div className="divide-y divide-[color:var(--color-border-secondary)]">
          {CATEGORY_META.map((meta) => {
            const preference = preferenceMap.get(meta.key) ?? emptyPreferences()[0]!;
            const Icon = meta.icon;
            const emailKey = `${meta.key}:email`;
            const smsKey = `${meta.key}:sms`;
            const advancedNotifications = subscription.hasFeature("notifications.advanced");
            const premiumLocked = meta.key === "weekly_digest"
              && !subscription.loading
              && !advancedNotifications;

            return (
              <div key={meta.key} className="grid md:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem]">
                <div className="flex min-w-0 items-start gap-3 px-5 pb-3 pt-5 md:px-6 md:py-5">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-tertiary ring-1 ring-inset ring-secondary">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-primary">{meta.title}</h3>
                      {meta.key === "weekly_digest" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-brand-secondary ring-1 ring-inset ring-brand_subtle">
                          {!advancedNotifications ? <Lock01 className="size-3" aria-hidden /> : null}
                          {subscription.requiredPlanName("notifications.advanced")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm leading-5 text-tertiary">{meta.description}</p>
                    {meta.key === "live" ? (
                      <Link
                        href="/account#go-live-notifications"
                        className="mt-2 inline-flex text-xs font-semibold text-brand-secondary hover:text-brand-secondary_hover"
                      >
                        Choose creators
                      </Link>
                    ) : null}
                  </div>
                </div>

                <PreferenceCell label="Email">
                  {premiumLocked ? (
                    <PremiumNotificationLink
                      href={subscription.featureHref("notifications.advanced")}
                      plan={subscription.requiredPlanName("notifications.advanced")}
                      label={`${meta.title} email notifications`}
                    />
                  ) : (
                    <Toggle
                      size="md"
                      isSelected={preference.emailEnabled}
                      isDisabled={pending.has(emailKey) || (meta.key === "weekly_digest" && subscription.loading)}
                      onChange={(enabled) => void updatePreference(meta.key, "email", enabled)}
                      aria-label={`${meta.title} by email`}
                    />
                  )}
                </PreferenceCell>
                <PreferenceCell label="Text / SMS">
                  {premiumLocked ? (
                    <PremiumNotificationLink
                      href={subscription.featureHref("notifications.advanced")}
                      plan={subscription.requiredPlanName("notifications.advanced")}
                      label={`${meta.title} text notifications`}
                    />
                  ) : (
                    <Toggle
                      size="md"
                      isSelected={preference.smsEnabled}
                      isDisabled={pending.has(smsKey) || (meta.key === "weekly_digest" && subscription.loading)}
                      onChange={(enabled) => void updatePreference(meta.key, "sms", enabled)}
                      aria-label={`${meta.title} by text message`}
                    />
                  )}
                </PreferenceCell>
                <PreferenceCell label="Push" isLast>
                  <div className="flex items-center gap-2 md:flex-col md:gap-1.5">
                    <Toggle
                      size="md"
                      isSelected={false}
                      isDisabled
                      aria-label={`${meta.title} by push notification — coming soon`}
                    />
                    <span className="whitespace-nowrap text-[11px] font-semibold text-quaternary">
                      Coming soon
                    </span>
                  </div>
                </PreferenceCell>
              </div>
            );
          })}
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-quaternary">
        These controls only store your preferences. CORE will not send email or text
        notifications until a delivery service and the required verification are active. You
        can change your choices at any time.
      </p>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </div>
  );
}

function PremiumNotificationLink({
  href,
  plan,
  label,
}: {
  href: string;
  plan: string;
  label: string;
}) {
  return (
    <Link
      href={href as never}
      aria-label={`Unlock ${label} with ${plan}`}
      title={`Unlock with ${plan}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-2.5 text-xs font-semibold text-brand-secondary shadow-xs-skeuomorphic ring-1 ring-inset ring-brand_subtle transition hover:bg-brand-primary_alt hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Lock01 className="size-3.5" aria-hidden />
      {plan}
    </Link>
  );
}

function PreferenceCell({
  label,
  isLast = false,
  children,
}: {
  label: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-h-14 items-center justify-between gap-4 border-t border-secondary px-5 py-3 md:min-h-0 md:justify-center md:border-l md:border-t-0 md:px-3 md:py-5",
        isLast && "pb-5 md:pb-5",
      )}
    >
      <span className="text-sm font-medium text-secondary md:sr-only">{label}</span>
      {children}
    </div>
  );
}

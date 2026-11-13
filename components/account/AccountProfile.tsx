"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Globe01, Mail01, User01 } from "@untitledui/icons";
import type { FanUser } from "@/components/providers/AuthProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { InlineNotice, SettingsCard } from "@/components/account/SettingsCard";
import { accountRequest, formatWait } from "@/components/account/account-client";
import { AccountFanZone } from "@/components/account/AccountFanZone";
import { DISPLAY_NAME_MAX, displayNameSchema, publicHandleSchema } from "@/lib/account/account-schemas";
import { publicDisplayName } from "@/lib/profile-display";

type Profile = {
  accountId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  publicHandle: string | null;
  publicCard: boolean;
  favoriteMember: string | null;
  createdAt: string;
};

type Notice = { tone: "success" | "error" | "info"; message: string } | null;
type MemberOption = { slug: string; stageName: string };

export function AccountProfile({ user, members }: { user: FanUser; members: MemberOption[] }) {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      const result = await accountRequest<{ profile?: Profile }>("/api/account/profile", user.id, {}, "Your profile couldn’t be loaded.");
      if (cancelled) return;
      if (result.ok && result.data.profile?.accountId === user.id) setProfile(result.data.profile);
      else setLoadError(result.ok ? "Your profile couldn’t be loaded." : result.error);
    })();
    return () => { cancelled = true; };
  }, [user.id, attempt]);

  const onSaved = useCallback((next: Profile) => {
    setProfile(next);
    refresh();
  }, [refresh]);

  const name = publicDisplayName(profile?.displayName ?? user.displayName);
  const memberSince = new Date(profile?.createdAt ?? user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div id="profile" className="scroll-mt-32 space-y-5">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-secondary bg-primary p-5 sm:p-6" aria-label="Account summary">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-primary text-2xl font-semibold text-brand-secondary ring-1 ring-inset ring-brand" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xl font-semibold tracking-tight text-primary">{name}</p>
          <p className="mt-1 text-sm text-tertiary">
            {profile?.publicHandle ? <span className="mr-2 font-medium text-secondary">@{profile.publicHandle}</span> : null}
            Member since {memberSince}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-x-5 gap-y-1 sm:w-auto">
          {([["/passport", "View Passport"], ["/dvr", "Open DVR"], ["/account/settings/billing", "Manage billing"]] as const).map(([href, label]) => (
            <Link key={href} href={href as never} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-secondary hover:text-primary hover:underline hover:underline-offset-4">
              {label}<ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {loadError ? (
        <section className="rounded-xl border border-secondary bg-primary p-5 sm:p-6">
          <InlineNotice tone="error">{loadError}</InlineNotice>
          <Button className="mt-4" color="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
        </section>
      ) : !profile ? (
        <div className="space-y-5" role="status" aria-label="Loading profile">
          <div className="h-72 animate-pulse rounded-xl border border-secondary bg-primary" />
          <div className="h-40 animate-pulse rounded-xl border border-secondary bg-primary" />
        </div>
      ) : (
        <>
          <IdentityForm profile={profile} onSaved={onSaved} />
          <EmailCard profile={profile} onVerified={() => { setProfile({ ...profile, emailVerified: true }); refresh(); }} />
          <PublicProfileCard profile={profile} members={members} onSaved={(patch) => setProfile({ ...profile, ...patch })} />
        </>
      )}

      <details className="group rounded-xl border border-secondary bg-primary">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-5 text-sm font-semibold text-primary sm:px-6">
          Fan score & recent activity
          <span className="text-xs font-medium text-tertiary group-open:hidden">Show</span>
          <span className="hidden text-xs font-medium text-tertiary group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-secondary p-5 sm:p-6"><AccountFanZone /></div>
      </details>
    </div>
  );
}

function IdentityForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.publicHandle ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const dirty = displayName !== profile.displayName || handle !== (profile.publicHandle ?? "");

  function validate(): { displayName: string; publicHandle: string | null } | null {
    const nextErrors: Record<string, string> = {};
    const name = displayNameSchema.safeParse(displayName);
    if (!name.success) nextErrors.displayName = name.error.issues[0]?.message ?? "Enter a display name.";
    const nextHandle = publicHandleSchema.safeParse(handle);
    if (!nextHandle.success) nextErrors.publicHandle = nextHandle.error.issues[0]?.message ?? "Check your handle.";
    else if (nextHandle.data === null && profile.publicCard && profile.publicHandle) {
      nextErrors.publicHandle = "Turn off your public fan profile before removing your handle.";
    }
    setErrors(nextErrors);
    return name.success && nextHandle.success && !nextErrors.publicHandle ? { displayName: name.data, publicHandle: nextHandle.data } : null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const values = validate();
    if (!values) return;
    const body: { displayName?: string; publicHandle?: string | null } = {};
    if (values.displayName !== profile.displayName) body.displayName = values.displayName;
    if (values.publicHandle !== profile.publicHandle) body.publicHandle = values.publicHandle;
    if (!Object.keys(body).length) {
      setDisplayName(values.displayName);
      setHandle(values.publicHandle ?? "");
      return;
    }
    setSaving(true);
    const result = await accountRequest<{ ok?: boolean; profile?: Profile }>("/api/account/profile", profile.accountId, { method: "PATCH", body }, "Your profile couldn’t be saved. Try again.");
    setSaving(false);
    if (result.ok && result.data.ok && result.data.profile) {
      setDisplayName(result.data.profile.displayName);
      setHandle(result.data.profile.publicHandle ?? "");
      onSaved(result.data.profile);
      setNotice({ tone: "success", message: "Profile saved." });
      return;
    }
    if (!result.ok) {
      setErrors(result.fields);
      setNotice({ tone: "error", message: result.status === 429 && result.retryAfterSeconds ? `Too many changes. Try again in ${formatWait(result.retryAfterSeconds)}.` : result.error });
    } else setNotice({ tone: "error", message: "The server didn’t confirm your changes. Try again." });
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsCard
        id="profile-details"
        icon={User01}
        title="Profile"
        description="How you appear to other fans in chat, community spaces, and on your public fan card."
        footer={
          <>
            {dirty ? <Button color="secondary" size="sm" onClick={() => { setDisplayName(profile.displayName); setHandle(profile.publicHandle ?? ""); setErrors({}); setNotice(null); }} isDisabled={saving}>Cancel</Button> : null}
            <Button type="submit" color="primary" size="sm" isDisabled={!dirty} isLoading={saving} showTextWhileLoading>Save changes</Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            size="md"
            label="Display name"
            value={displayName}
            onChange={(value) => { setDisplayName(value); setErrors(({ displayName: _removed, ...rest }) => rest); setNotice(null); }}
            maxLength={DISPLAY_NAME_MAX + 10}
            autoComplete="nickname"
            isInvalid={Boolean(errors.displayName)}
            hint={errors.displayName ?? `Up to ${DISPLAY_NAME_MAX} characters.`}
            isDisabled={saving}
            isRequired
          />
          <Input
            size="md"
            label="Public handle"
            value={handle}
            onChange={(value) => { setHandle(value.replace(/\s+/g, "").toLowerCase()); setErrors(({ publicHandle: _removed, ...rest }) => rest); setNotice(null); }}
            placeholder="your-handle"
            autoComplete="off"
            maxLength={40}
            isInvalid={Boolean(errors.publicHandle)}
            hint={errors.publicHandle ?? (handle ? `Your fan card link: /u/${handle.replace(/^@+/, "")}` : "3–32 lowercase letters, numbers, or single dashes.")}
            isDisabled={saving}
          />
        </div>
        {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      </SettingsCard>
    </form>
  );
}

function EmailCard({ profile, onVerified }: { profile: Profile; onVerified: () => void }) {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function resend() {
    setSending(true);
    setNotice(null);
    let response: Response;
    try {
      response = await fetch("/api/account/email-verification", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } catch {
      setSending(false);
      setNotice({ tone: "error", message: "You appear to be offline. Check your connection and try again." });
      return;
    }
    const data = (await response.json().catch(() => null)) as { state?: string; retryAfterSeconds?: number } | null;
    setSending(false);
    if (response.ok && data?.state === "already_verified") {
      onVerified();
      setNotice({ tone: "success", message: "Your email is already verified." });
    } else if (response.ok && data?.state === "sent") {
      setNotice({ tone: "success", message: `Verification email sent to ${profile.email}. Open the link in that email to finish.` });
    } else if (response.status === 429) {
      const wait = Number(data?.retryAfterSeconds);
      setNotice({ tone: "info", message: Number.isFinite(wait) && wait > 0 ? `We just sent a link. Check your inbox or request another in ${formatWait(wait)}.` : "We just sent a link. Check your inbox for the latest email." });
    } else if (response.status === 503) {
      setNotice({ tone: "error", message: "Email delivery is temporarily unavailable. Try again later." });
    } else if (response.status === 401) {
      setNotice({ tone: "error", message: "Your session expired. Sign in again, then retry." });
    } else {
      setNotice({ tone: "error", message: "The verification email couldn’t be sent. Try again." });
    }
  }

  return (
    <SettingsCard
      id="email"
      icon={Mail01}
      title="Email address"
      description="Used to sign in, recover your account, and deliver the emails you opt into."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="break-all text-sm font-medium text-primary">{profile.email}</p>
          <div className="mt-2">
            {profile.emailVerified
              ? <Badge type="pill-color" color="success" size="sm">Verified</Badge>
              : <Badge type="pill-color" color="warning" size="sm">Not verified</Badge>}
          </div>
        </div>
        {!profile.emailVerified ? (
          <Button color="secondary" size="sm" onClick={() => void resend()} isLoading={sending} showTextWhileLoading>
            Resend verification email
          </Button>
        ) : null}
      </div>
      {!profile.emailVerified && !notice ? (
        <p className="mt-4 text-sm text-tertiary">Verify your email to turn on email alerts and keep account recovery working.</p>
      ) : null}
      {notice ? <div className="mt-4"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      <p className="mt-4 text-xs leading-5 text-quaternary">Need to change the email on your account? Contact CORE support from the address you use now.</p>
    </SettingsCard>
  );
}

function PublicProfileCard({
  profile,
  members,
  onSaved,
}: {
  profile: Profile;
  members: MemberOption[];
  onSaved: (patch: Pick<Profile, "publicCard" | "favoriteMember">) => void;
}) {
  const [publicCard, setPublicCard] = useState(profile.publicCard);
  const [favorite, setFavorite] = useState(profile.favoriteMember ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const dirty = publicCard !== profile.publicCard || favorite !== (profile.favoriteMember ?? "");
  const needsHandle = !profile.publicHandle;

  async function save() {
    setSaving(true);
    setNotice(null);
    const result = await accountRequest<{ ok?: boolean; accountId?: string; publicCard?: boolean; favoriteMember?: string | null }>(
      "/api/account/loyalty",
      profile.accountId,
      { method: "PATCH", body: { publicCard, favoriteMember: favorite || null } },
      "Your fan card settings couldn’t be saved. Try again.",
    );
    setSaving(false);
    if (result.ok && result.data.ok && result.data.accountId === profile.accountId) {
      const next = { publicCard: Boolean(result.data.publicCard), favoriteMember: result.data.favoriteMember ?? null };
      setPublicCard(next.publicCard);
      setFavorite(next.favoriteMember ?? "");
      onSaved(next);
      setNotice({ tone: "success", message: next.publicCard ? "Your fan card is public." : "Your fan card is private." });
    } else {
      setNotice({ tone: "error", message: result.ok ? "The server didn’t confirm your changes. Try again." : result.error });
    }
  }

  return (
    <SettingsCard
      id="public-profile"
      icon={Globe01}
      title="Public fan card"
      description={<>Publish a fan card at <code className="text-xs">/u/{profile.publicHandle ?? "your-handle"}</code> with your display name, connected platform usernames, and favorite member. It stays private until you turn it on.</>}
      footer={
        <>
          {profile.publicCard && profile.publicHandle ? (
            <Button color="link-color" size="sm" href={`/u/${encodeURIComponent(profile.publicHandle)}` as never} iconTrailing={ArrowUpRight}>View your fan card</Button>
          ) : null}
          <Button color="primary" size="sm" onClick={() => void save()} isDisabled={!dirty} isLoading={saving} showTextWhileLoading>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-secondary p-4">
          <div>
            <p className="text-sm font-semibold text-primary">Public fan card</p>
            <p className="mt-0.5 text-xs leading-5 text-tertiary">{needsHandle ? "Add a public handle above to publish." : publicCard ? "Visible to anyone with the link." : "Only you can see it."}</p>
          </div>
          <Toggle size="md" isSelected={publicCard} isDisabled={saving || (needsHandle && !publicCard)} onChange={(value) => { setPublicCard(value); setNotice(null); }} aria-label="Make fan card public" />
        </div>
        <NativeSelect
          label="Favorite member"
          value={favorite}
          disabled={saving}
          onChange={(event) => { setFavorite(event.target.value); setNotice(null); }}
          options={[{ value: "", label: "Auto from your activity" }, ...members.map((member) => ({ value: member.slug, label: member.stageName }))]}
        />
      </div>
      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
    </SettingsCard>
  );
}

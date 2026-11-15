"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Check, Send01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";
import { useAuth } from "@/components/providers/AuthProvider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { detectClipPlatform, saveLocalClipDraft } from "@/lib/clips/local-draft";
import Link from "next/link";

export type FanSubmission = {
  id: string;
  source: "twitch" | "youtube" | "tiktok" | "instagram" | null;
  externalId: string | null;
  url: string;
  why: string;
  memberSlugs: string[];
  /** Legacy single-name field — kept for backwards compat with old saved entries. */
  submitterName?: string;
  submitterFirstName?: string;
  submitterLastName?: string;
  /** Admin-only — never rendered publicly. */
  submitterEmail: string;
  consent: boolean;
  status: "pending" | "approved" | "denied";
  reason?: string;
  submittedAt: string;
};

type MemberOption = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

/**
 * Local clip draft form. There is no public submission endpoint yet, so saving
 * must never imply that a clip was sent to the team or entered moderation.
 */
export function ClipSubmitForm({
  members,
  onClose,
  showHeaderClose = true,
}: {
  members: MemberOption[];
  onClose?: () => void;
  showHeaderClose?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [why, setWhy] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [hasSocial, setHasSocial] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [saveError, setSaveError] = useState("");
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!user) {
      setHasSocial(null);
      return;
    }
    let cancelled = false;
    setHasSocial(null);
    setConnectionError(false);
    fetch("/api/account/connections", { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Could not check connected accounts.");
        return r.json();
      })
      .then((d: { connections?: Array<{ provider: string; status: string }> }) => {
        if (cancelled) return;
        setHasSocial(
          (d.connections ?? []).some(
            (c) => (c.provider === "twitch" || c.provider === "youtube") && c.status === "active",
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setConnectionError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, connectionAttempt]);

  const detection = useMemo(() => detectClipPlatform(url), [url]);

  const togglePick = (slug: string) =>
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
    );

  const ready =
    !authLoading &&
    !!user &&
    hasSocial === true &&
    !!url.trim() &&
    !!detection.source &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    consent &&
    picked.length > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaveError("");
    const sub: Omit<FanSubmission, "status"> & { status: "draft" } = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: detection.source,
      externalId: detection.externalId,
      url: url.trim(),
      why: why.trim(),
      memberSlugs: picked,
      submitterFirstName: firstName.trim(),
      submitterLastName: lastName.trim(),
      submitterEmail: email.trim(),
      consent,
      status: "draft",
      submittedAt: new Date().toISOString(),
    };
    try {
      saveLocalClipDraft(localStorage, sub);
    } catch {
      setSaveError("Your draft could not be saved in this browser. Keep this page open and try again.");
      return;
    }
    setDone(true);
  };

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <h3 className="text-lg font-semibold text-primary">Sign in to save a clip draft</h3>
        <p className="mt-2 max-w-sm text-sm text-tertiary">
          Save your clip details on this device. Public submissions are not available yet.
        </p>
        <Button href={"/login?next=/clips/submit" as never} size="md" color="primary" className="mt-5">
          Sign in
        </Button>
      </div>
    );
  }

  if (connectionError) {
    return <div className="p-8 text-center">
      <p role="alert" className="text-base text-secondary">We couldn&apos;t check your connected accounts.</p>
      <Button size="md" color="secondary" onClick={() => setConnectionAttempt((value) => value + 1)} className="mt-4">Try again</Button>
    </div>;
  }

  if (authLoading || (user && hasSocial === null)) {
    return <p role="status" className="p-8 text-center text-base text-secondary">Checking your account…</p>;
  }

  if (user && hasSocial === false) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <h3 className="text-lg font-semibold text-primary">Connect Twitch or YouTube</h3>
        <p className="mt-2 max-w-sm text-sm text-tertiary">
          We need a connected platform so the clip is tied to a real creator account, not just an email.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex rounded-lg bg-brand-solid px-4 py-2 text-sm font-semibold text-white"
        >
          Connect an account
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center p-8 text-center">
        <FeaturedIcon icon={CheckCircle} size="lg" color="success" theme="modern" />
        <h3 className="mt-4 text-lg font-semibold text-primary">
          Draft saved on this device.
        </h3>
        <p className="mt-1 text-sm text-tertiary">
          Your clip has not been sent to CORE. Public submissions are not available yet.
        </p>
        <Button size="md" color="secondary" onClick={() => setDone(false)} className="mt-5">Edit draft</Button>
        {onClose ? (
          <Button size="md" color="secondary" onClick={onClose} className="mt-5">
            Close
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-secondary bg-secondary px-5 py-4">
        <h3 className="text-md font-semibold tracking-tight text-primary">
          Save a clip draft
        </h3>
        {onClose && showHeaderClose ? (
          <ButtonUtility size="sm" color="tertiary" icon={XClose} aria-label="Close" onClick={onClose} />
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex max-h-[80vh] flex-col gap-5 overflow-y-auto p-5 md:p-6"
      >
        <p className="rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary">
          This saves a draft in this browser only. It does not send your clip for review.
        </p>
        <div>
          <Input
            isRequired
            type="url"
            label="Clip URL"
            hint="Twitch clip, YouTube short, TikTok, Instagram reel."
            size="md"
            value={url}
            onChange={(v) => setUrl(v)}
            placeholder="https://clips.twitch.tv/... or https://youtube.com/shorts/..."
          />
          {url ? (
            detection.source ? (
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-tertiary">
                Detected:
                <Badge type="pill-color" color="brand" size="sm">
                  {detection.source}
                </Badge>
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-error-primary">
                We can&apos;t detect this URL — supported: clips.twitch.tv, youtube.com/shorts,
                youtu.be, tiktok.com, instagram.com/reel.
              </p>
            )
          ) : null}
        </div>

        <TextArea
          label="Why is it worth posting?"
          hint="One sentence. Optional."
          rows={3}
          value={why}
          onChange={(v) => setWhy(v)}
          placeholder="The 1v3 in the final round at 2:14"
        />

        <Field
          label="Who's in the clip?"
          required
          hint="Tag every member who appears."
        >
          <ul className="flex flex-wrap items-center gap-2">
            {members.map((m) => {
              const active = picked.includes(m.slug);
              return (
                <li key={m.slug} className="flex w-20 flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => togglePick(m.slug)}
                    aria-pressed={active}
                    aria-label={m.stageName}
                    className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-all motion-safe:hover:-translate-y-0.5"
                  >
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatarUrl}
                        alt=""
                        className="h-12 w-12 rounded-full ring-2 ring-inset transition-all"
                        style={{
                          ["--tw-ring-color" as string]: active
                            ? m.accent
                            : "var(--rule-strong)",
                          opacity: active ? 1 : 0.6,
                          filter: active ? "none" : "grayscale(0.4)",
                          boxShadow: active
                            ? `0 0 0 2px ${m.accent}, 0 6px 16px -4px ${m.accent}aa`
                            : "none",
                        }}
                      />
                    ) : (
                      <span
                        className="inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ring-2 ring-inset"
                        style={{
                          ["--tw-ring-color" as string]: active
                            ? m.accent
                            : "var(--rule-strong)",
                          color: m.accent,
                          background: "rgba(8,8,10,0.6)",
                        }}
                      >
                        {m.stageName[0]}
                      </span>
                    )}
                    {active ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[color:var(--bg-elev)]"
                        style={{ background: m.accent, color: "#fff" }}
                        aria-hidden
                      >
                        <Check className="size-3" />
                      </span>
                    ) : null}
                  </button>
                  <span className="w-full text-center text-xs font-medium text-secondary">
                    {m.stageName}
                  </span>
                </li>
              );
            })}
          </ul>
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            isRequired
            label="First name"
            size="md"
            value={firstName}
            onChange={(v) => setFirstName(v)}
            placeholder="Alex"
          />
          <Input
            isRequired
            label="Last name"
            hint="Your details stay in this browser draft."
            size="md"
            value={lastName}
            onChange={(v) => setLastName(v)}
            placeholder="Smith"
          />
        </div>
        <Input
          isRequired
          type="email"
          label="Email"
          hint="Stored on this device with the draft."
          size="md"
          value={email}
          onChange={(v) => setEmail(v)}
          placeholder="you@email.com"
        />

        <label
          className={cx(
            "flex cursor-pointer items-start gap-3 rounded-xl bg-primary p-4 text-sm leading-relaxed text-tertiary shadow-xs ring-1 ring-inset transition-colors",
            consent ? "ring-brand bg-brand-primary" : "ring-secondary hover:bg-secondary",
          )}
        >
          <Checkbox
            size="sm"
            isSelected={consent}
            onChange={(v) => setConsent(v)}
            className="mt-0.5"
            aria-label="Consent to public display"
          />
          <span>
            I confirm I&apos;m okay with this clip being shown publicly on thecoreboys.com with
            credit to my first name and last initial, and I&apos;ve read and accept the{" "}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="cursor-pointer font-semibold text-brand-secondary underline underline-offset-2 hover:text-brand-secondary_hover"
            >
              submission terms
            </button>
            .
          </span>
        </label>

        {saveError ? <p role="alert" className="text-sm text-error-primary">{saveError}</p> : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-secondary pt-4">
          <Button
            type="submit"
            size="lg"
            color="primary"
            isDisabled={!ready}
            iconLeading={Send01}
          >
            Save draft
          </Button>
          {onClose ? (
            <Button type="button" size="lg" color="link-gray" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      {termsOpen ? <TermsModal onClose={() => setTermsOpen(false)} /> : null}
    </>
  );
}

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[640px] p-0" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-secondary bg-secondary px-5 py-4">
          <DialogTitle className="pr-12 text-md font-semibold tracking-tight text-primary md:text-md">
            Clip submission terms
          </DialogTitle>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 text-sm leading-relaxed text-tertiary">
          <p>Drafts stay on your device and are not sent for review. These guidelines apply when sharing a clip with CORE:</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <strong className="font-semibold text-primary">The clip is appropriate</strong> — no
              explicit, hateful, harassing, or non-consensual content. Admins reject anything
              that crosses that line.
            </li>
            <li>
              <strong className="font-semibold text-primary">You consent to public display</strong>{" "}
              of the clip embed on thecoreboys.com with attribution to your{" "}
              <em>first name + last initial</em>. Your full last name and email are admin-only
              and never shown publicly.
            </li>
            <li>
              <strong className="font-semibold text-primary">Source ownership</strong> — clips are
              embedded from the original platform (Twitch / YouTube / TikTok / Instagram). We
              don&apos;t re-host the video.
            </li>
            <li>
              <strong className="font-semibold text-primary">Removal requests</strong> at{" "}
              <code className="font-mono">press@thecoreboys.com</code>. We act on verified
              requests within 72 hours.
            </li>
          </ul>
          <p className="mt-5 text-xs text-quaternary">
            By checking the consent box you agree to all of the above.
          </p>
        </div>
        <div className="flex items-center justify-end border-t border-secondary bg-secondary px-5 py-4">
          <Button size="md" color="secondary" onClick={onClose}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-brand-secondary">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-tertiary">{hint}</span> : null}
    </div>
  );
}

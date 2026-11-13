"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/base/buttons/button";

type Digest = {
  window: string;
  siteMinutes: number;
  chatMinutes: number;
  ytPlays: number;
  vodPlays: number;
  chatsSent: number;
  houseStatus: string;
  note: string;
};

export default function WeeklyDigestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/digest");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setFailed(false);
    fetch("/api/account/digest", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Digest) => {
        if (cancelled) return;
        if (data && typeof data.siteMinutes === "number") setDigest(data);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  return (
    <>
      <div className="mx-auto max-w-2xl px-6 py-12 md:py-16">
        <p className="text-sm font-semibold text-brand-secondary">Weekly recap</p>
        <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary">
          What you did on CORE
        </h1>
        <p className="mt-2 text-sm text-tertiary">
          Your last 7 days on CORE. These numbers count time on this site only, not
          hours watched in the Twitch or YouTube apps.
        </p>
        {failed && !digest ? (
          <div className="mt-8 rounded-2xl bg-secondary p-6 ring-1 ring-inset ring-secondary" role="alert">
            <p className="text-sm font-semibold text-primary">Your recap couldn&apos;t be loaded.</p>
            <p className="mt-1 text-sm text-tertiary">Check your connection and try again.</p>
            <Button size="sm" color="secondary" className="mt-4" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : !digest ? (
          <div className="mt-8 h-48 animate-pulse rounded-2xl bg-secondary" role="status" aria-label="Loading your recap" />
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-3">
            {(
              [
                ["Site minutes", digest.siteMinutes],
                ["Chat-tab minutes", digest.chatMinutes],
                ["YouTube plays here", digest.ytPlays],
                ["VOD plays here", digest.vodPlays],
                ["Hub messages sent", digest.chatsSent],
              ] as const
            ).map(([label, n]) => (
              <li key={label} className="rounded-2xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
                <p className="text-xs text-quaternary">{label}</p>
                <p className="mt-1 text-display-xs font-semibold tabular-nums text-primary">{n}</p>
              </li>
            ))}
          </ul>
        )}
        <Button href={"/account" as never} size="md" color="secondary" className="mt-8">
          Back to account
        </Button>
        <p className="mt-3 text-xs text-quaternary">
          <Link href="/legal/privacy" className="underline">
            Why we can&apos;t show Twitch hours
          </Link>
        </p>
      </div>
      <SiteFooter />
    </>
  );
}

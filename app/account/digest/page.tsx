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

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/digest");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/account/digest", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(setDigest)
      .catch(() => setDigest(null));
  }, [user]);

  return (
    <>
      <main className="mx-auto max-w-2xl px-6 py-12 md:py-16">
        <p className="text-sm font-semibold text-brand-secondary">Weekly recap</p>
        <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary">
          What you did on CORE
        </h1>
        <p className="mt-2 text-sm text-tertiary">
          This is an in-app digest. We don&apos;t email unless you add SMTP later.
          Numbers are on-site presence — not Twitch hours or YouTube history.
        </p>
        {!digest ? (
          <div className="mt-8 h-48 animate-pulse rounded-2xl bg-secondary" />
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
        <p className="mt-6 text-xs text-quaternary">{digest?.note}</p>
        <Button href={"/account" as never} size="md" color="secondary" className="mt-8">
          Back to account
        </Button>
        <p className="mt-3 text-xs text-quaternary">
          <Link href="/legal/privacy" className="underline">
            Why we can&apos;t show Twitch hours
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

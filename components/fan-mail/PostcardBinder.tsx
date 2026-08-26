"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BinderItem = {
  collectibleId: string;
  setId: string;
  setTitle: string;
  memberSlug: string;
  releaseTitle: string;
  serialPrefix: string;
  editionSize: number;
  variantTitle: string;
  serialNumber: number;
  issuedAt: string;
};

type BinderProgress = {
  setId: string;
  setTitle: string;
  memberSlug: string;
  ownedReleases: number;
  requiredReleases: number;
  completed: boolean;
  completedAt: string | null;
};

type BinderResponse = {
  available?: boolean;
  reason?: string;
  items?: BinderItem[];
  progress?: BinderProgress[];
  error?: string;
};

export function PostcardBinder() {
  const [payload, setPayload] = useState<BinderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/postcards/binder", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as BinderResponse;
      if (!response.ok) throw new Error(body.error || "Your postcard binder could not be loaded.");
      setPayload(body);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Your postcard binder could not be loaded.");
      }
    });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert" className="rounded-xl border border-error-primary/30 bg-error-primary/5 p-4 text-sm text-error-primary">{error}</p>;
  if (!payload) return <p role="status" className="text-sm text-tertiary">Opening your private binder…</p>;
  if (!payload.available) {
    return <p className="rounded-xl border border-secondary bg-secondary p-4 text-sm text-tertiary">Postcard collectibles have not been enabled for this site yet.</p>;
  }

  const items = payload.items ?? [];
  const progress = payload.progress ?? [];
  return (
    <div className="grid gap-8">
      {progress.length ? (
        <section aria-labelledby="binder-progress-title">
          <h2 id="binder-progress-title" className="text-xl font-semibold text-primary">Set progress</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {progress.map((set) => (
              <article key={set.setId} className="rounded-2xl border border-secondary bg-primary p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">{set.memberSlug}</p>
                <h3 className="mt-1 font-semibold text-primary">{set.setTitle}</h3>
                <p className="mt-2 text-sm text-secondary">
                  {set.ownedReleases} of {set.requiredReleases} releases
                  {set.completed ? " · Complete" : ""}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="binder-cards-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="binder-cards-title" className="text-xl font-semibold text-primary">Issued postcards</h2>
            <p className="mt-1 text-sm text-tertiary">Only you can see this binder.</p>
          </div>
          <Link href="/fan-mail/postcard" className="rounded-xl border border-secondary bg-primary px-4 py-2 text-sm font-semibold text-primary hover:border-primary">Make a postcard</Link>
        </div>
        {items.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article key={item.collectibleId} className="overflow-hidden rounded-2xl border border-secondary bg-primary">
                <div className="bg-gradient-to-br from-brand-solid/25 via-secondary to-warning-secondary p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">{item.setTitle}</p>
                  <h3 className="mt-8 text-xl font-black uppercase text-primary">{item.releaseTitle}</h3>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-primary">{item.variantTitle}</p>
                  <p className="mt-1 font-mono text-sm text-secondary">
                    {item.serialPrefix}-{String(item.serialNumber).padStart(4, "0")} / {item.editionSize}
                  </p>
                  <p className="mt-2 text-xs text-tertiary">Issued {new Date(item.issuedAt).toLocaleDateString()}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-secondary p-8 text-center">
            <p className="font-semibold text-primary">No issued postcards yet</p>
            <p className="mt-1 text-sm text-tertiary">A chosen collectible enters your binder only after a live postcard is accepted for printing.</p>
          </div>
        )}
      </section>
    </div>
  );
}

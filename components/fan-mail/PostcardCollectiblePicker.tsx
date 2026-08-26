"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PostcardDraft } from "@/lib/postcard-draft";
import type { PostcardCollectibleReleaseOption } from "@/lib/postcard-collectibles";
import { cn } from "@/lib/utils";

type CatalogResponse = {
  available?: boolean;
  authRequired?: boolean;
  releases?: PostcardCollectibleReleaseOption[];
  error?: string;
};

export function PostcardCollectiblePicker({
  draft,
  enabled,
  onChange,
}: {
  draft: PostcardDraft;
  enabled: boolean;
  onChange: (updater: (draft: PostcardDraft) => PostcardDraft) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "unavailable" | "error">("loading");
  const [releases, setReleases] = useState<PostcardCollectibleReleaseOption[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setStatus("loading");
    const params = new URLSearchParams({ recipient: draft.recipientSlug, design: draft.designId });
    void fetch(`/api/postcard/collectibles?${params}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as CatalogResponse;
      if (response.status === 401) {
        setReleases([]);
        setStatus("signed-out");
        return;
      }
      if (!response.ok) throw new Error(body.error || "Collectible releases could not be loaded.");
      const next = body.releases ?? [];
      setReleases(next);
      setStatus(body.available === false ? "unavailable" : "ready");
    }).catch(() => {
      if (!controller.signal.aborted) {
        setReleases([]);
        setStatus("error");
      }
    });
    return () => controller.abort();
  }, [draft.designId, draft.recipientSlug, enabled]);

  const availableVariantIds = useMemo(
    () => new Set(releases.flatMap((release) => release.variants.map((variant) => variant.id))),
    [releases],
  );

  useEffect(() => {
    if (status !== "ready" || !draft.collectible.variantId) return;
    if (availableVariantIds.has(draft.collectible.variantId)) return;
    onChange((current) => ({
      ...current,
      collectible: { setId: null, releaseId: null, variantId: null, serial: null },
    }));
  }, [availableVariantIds, draft.collectible.variantId, onChange, status]);

  if (!enabled) return null;
  const selectedVariantId = draft.collectible.variantId;
  const loginHref = `/login?next=${encodeURIComponent(`/fan-mail/postcard?recipient=${draft.recipientSlug}`)}`;

  return (
    <section className="rounded-2xl border border-secondary bg-secondary/45 p-4" aria-labelledby="collectible-release-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="collectible-release-title" className="text-sm font-semibold text-primary">Collectible release</h2>
          <p className="mt-1 text-xs leading-relaxed text-tertiary">Choose a real approved variant. A serial is issued only after this live postcard is accepted for printing.</p>
        </div>
        <Link href={"/binder/postcards" as never} className="text-xs font-semibold text-brand-secondary hover:underline">My binder</Link>
      </div>

      {status === "loading" ? <p role="status" className="mt-3 text-xs text-tertiary">Checking approved releases…</p> : null}
      {status === "signed-out" ? (
        <p className="mt-3 text-sm text-secondary"><Link href={loginHref as never} className="font-semibold text-brand-secondary hover:underline">Sign in</Link> to choose a release and keep issued postcards in your private binder.</p>
      ) : null}
      {status === "unavailable" ? <p className="mt-3 text-xs text-tertiary">Collectible releases have not been enabled yet.</p> : null}
      {status === "error" ? <p role="alert" className="mt-3 text-xs text-error-primary">Collectible releases are temporarily unavailable. Standard postcard checkout still works.</p> : null}
      {status === "ready" && releases.length === 0 ? <p className="mt-3 text-xs text-tertiary">No active collectible release matches this design.</p> : null}

      {status === "ready" && releases.length ? (
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-tertiary">Availability includes active checkout holds. Your choice is held for 30 minutes when checkout starts, then secured when payment is confirmed.</p>
          <button
            type="button"
            aria-pressed={!selectedVariantId}
            onClick={() => onChange((current) => ({ ...current, collectible: { setId: null, releaseId: null, variantId: null, serial: null } }))}
            className={cn(
              "min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold",
              !selectedVariantId ? "border-brand-solid bg-brand-solid/10 text-primary" : "border-secondary bg-primary text-secondary hover:border-primary",
            )}
          >
            Standard postcard · no collectible
          </button>
          {releases.map((release) => (
            <fieldset key={release.releaseId} className="rounded-xl border border-secondary bg-primary p-3">
              <legend className="px-1 text-sm font-semibold text-primary">{release.releaseTitle}</legend>
              <p className="text-xs text-tertiary">{release.setTitle} · {release.remainingNow} unissued now</p>
              {release.description ? <p className="mt-1 text-xs text-tertiary">{release.description}</p> : null}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {release.variants.map((variant) => {
                  const selected = selectedVariantId === variant.id;
                  return (
                    <label key={variant.id} className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm", selected ? "border-brand-solid bg-brand-solid/10" : "border-secondary hover:border-primary")}>
                      <span className="font-semibold text-primary">{variant.title}</span>
                      <span className="flex items-center gap-2 text-xs text-tertiary">
                        {variant.remainingNow} available
                        <input
                          type="radio"
                          name="postcard-collectible-variant"
                          checked={selected}
                          onChange={() => onChange((current) => ({
                            ...current,
                            collectible: {
                              setId: release.setId,
                              releaseId: release.releaseId,
                              variantId: variant.id,
                              serial: null,
                            },
                          }))}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
    </section>
  );
}

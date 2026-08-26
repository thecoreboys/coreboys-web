"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Inbox01, RefreshCw01, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

type ReviewOrder = {
  id: string;
  recipientSlug: string;
  recipientName: string;
  message: string;
  designId: string;
  hasCustomArt: boolean;
  assetCount: number;
  senderName: string | null;
  providerMode: "sandbox" | "test" | "live";
  amountCents: number;
  currency: string;
  status: "review" | "paid" | "fulfilling" | "failed" | "refunding";
  fulfillmentAttempts: number;
  lastFulfillmentError: string | null;
  createdAt: string;
  proofVerified: boolean;
  proofHash: string | null;
  proofError: string | null;
  sourceAssets: Array<{
    key: `slot-${number}` | "signature";
    kind: "photo" | "signature";
    slot: number | null;
    label: string;
    altText: string;
    caption: string | null;
  }>;
  expectedPhotoCount: number;
  sourceAssetsComplete: boolean;
};

type ReviewAction = "approve" | "reject";
type Confirmation = { id: string; action: ReviewAction } | null;

function money(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const PROOF_WIDTH = 600;
const PROOF_HEIGHT = 408;

function creativeUrl(orderId: string, parameter: "face" | "asset", value: string): string {
  return `/api/admin/postcards/${encodeURIComponent(orderId)}/creative?${parameter}=${encodeURIComponent(value)}`;
}

function ScaledProofFrame({ src, title }: { src: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = (width: number) => {
      setScale(Math.max(0.1, Math.min(1, width / PROOF_WIDTH)));
    };
    update(host.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) update(width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className="relative w-full overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary"
      style={{ height: PROOF_HEIGHT * scale }}
    >
      <iframe
        src={src}
        title={title}
        sandbox=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute left-0 top-0 border-0 bg-white"
        style={{
          width: PROOF_WIDTH,
          height: PROOF_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

function PostcardProofReview({ order }: { order: ReviewOrder }) {
  const [face, setFace] = useState<"front" | "back">("front");
  const proofUrl = creativeUrl(order.id, "face", face);

  return (
    <div className="flex flex-col gap-4 border-b border-secondary bg-secondary/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-secondary">
            Immutable print proof
          </p>
          <p className="mt-1 text-xs text-tertiary">
            {order.proofVerified && order.proofHash
              ? `Verified · ${order.proofHash.slice(0, 12)}…`
              : "Integrity check required"}
          </p>
        </div>
        {order.proofVerified ? (
          <div className="flex items-center gap-1 rounded-lg bg-primary p-1 ring-1 ring-inset ring-secondary" role="group" aria-label="Postcard proof side">
            {(["front", "back"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={face === candidate}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  face === candidate
                    ? "bg-brand-solid text-white"
                    : "text-tertiary hover:bg-secondary hover:text-primary"
                }`}
                onClick={() => setFace(candidate)}
              >
                {candidate === "front" ? "Front artwork" : "Writing side"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {order.proofVerified ? (
        <>
          <ScaledProofFrame
            src={proofUrl}
            title={`${face === "front" ? "Front artwork" : "Writing side"} print proof for ${order.recipientName}`}
          />
          <a
            href={proofUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-xs font-semibold text-brand-secondary underline decoration-transparent underline-offset-4 hover:decoration-current"
          >
            Open exact {face === "front" ? "front artwork" : "writing side"} proof
          </a>
        </>
      ) : (
        <div role="alert" className="rounded-xl bg-error-primary p-4 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle">
          {order.proofError ?? "The frozen print proof could not be verified."} Approval is disabled.
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">Submitted source assets</p>
            <p className="mt-1 text-xs text-tertiary">
              {order.expectedPhotoCount} photo{order.expectedPhotoCount === 1 ? "" : "s"}
              {order.sourceAssets.some((asset) => asset.kind === "signature") ? " · private signature" : ""}
            </p>
          </div>
          {!order.sourceAssetsComplete ? (
            <span className="text-xs font-semibold text-error-primary">Asset inventory mismatch</span>
          ) : null}
        </div>
        {order.sourceAssets.length ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {order.sourceAssets.map((asset) => (
              <figure key={asset.key} className="overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-secondary">
                <div className={`relative ${asset.kind === "signature" ? "aspect-[3/1] bg-white" : "aspect-square bg-secondary"}`}>
                  <Image
                    src={creativeUrl(order.id, "asset", asset.key)}
                    alt={asset.altText}
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-contain p-2"
                  />
                </div>
                <figcaption className="p-2.5">
                  <span className="block text-xs font-semibold text-primary">{asset.label}</span>
                  {asset.caption ? <span className="mt-0.5 block text-[11px] text-tertiary">{asset.caption}</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div role="alert" className="mt-3 rounded-xl bg-warning-primary p-3 text-xs text-warning-primary ring-1 ring-inset ring-warning_subtle">
            No reviewable source assets were found for this custom-art order.
          </div>
        )}
      </div>
    </div>
  );
}

export function PostcardReviewQueue() {
  const [orders, setOrders] = useState<ReviewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/postcards", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as {
        orders?: ReviewOrder[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setOrders(result.orders ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load postcard reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: ReviewAction) {
    setBusyId(id);
    setActionError(null);
    setAnnouncement(null);
    try {
      const response = await fetch(`/api/admin/postcards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        disposition?: string;
      };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);

      setOrders((current) => current.filter((order) => order.id !== id));
      setConfirmation(null);
      setAnnouncement(
        action === "approve"
          ? result.disposition === "permanent-failure"
            ? "The approved order could not be safely submitted. Nothing was mailed and the full payment was refunded."
            : result.status === "proof"
            ? "Artwork approved and a provider test proof was created. No physical mail was sent."
            : result.status === "sent"
              ? "Artwork approved and the local mailing simulation completed."
              : "Artwork approved and released to the mail provider."
          : "Artwork declined and the customer payment was refunded.",
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The review action failed.");
      void load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">
            {loading ? "Checking the queue…" : `${orders.length} awaiting review`}
          </p>
          <p className="mt-1 text-sm text-tertiary">
            Inspect the exact frozen front and writing side with every submitted source asset before releasing a paid order.
          </p>
        </div>
        <Button
          type="button"
          size="md"
          color="secondary"
          iconLeading={RefreshCw01}
          isLoading={loading}
          isDisabled={loading || busyId !== null}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {loadError ? (
        <div role="alert" className="rounded-xl bg-error-primary p-4 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle">
          Couldn&apos;t load the postcard queue: {loadError}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="rounded-xl bg-error-primary p-4 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle">
          {actionError}
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {!loading && !loadError && orders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-primary p-8 text-center ring-1 ring-inset ring-secondary">
          <FeaturedIcon icon={Inbox01} size="lg" color="gray" theme="modern" />
          <h2 className="mt-4 text-lg font-semibold text-primary">The review queue is clear.</h2>
          <p className="mt-1 max-w-md text-sm text-tertiary">
            Paid postcards with custom artwork will appear here before anything is sent to print.
          </p>
        </div>
      ) : null}

      {orders.length > 0 ? (
        <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {orders.map((order) => {
            const pending = confirmation?.id === order.id ? confirmation.action : null;
            const busy = busyId === order.id;
            const recoveringMail = order.status === "paid" || order.status === "fulfilling";
            const recoveringRefund = order.status === "failed" || order.status === "refunding";
            const approvalLabel = recoveringMail
              ? "Retry approved order"
              : order.providerMode === "live"
                ? "Approve & mail"
                : order.providerMode === "test"
                  ? "Approve & proof"
                  : "Approve simulation";
            const approvalConfirmation = order.providerMode === "live"
              ? "Approve this artwork and send the physical postcard to print?"
              : order.providerMode === "test"
                ? "Approve this artwork and create a provider test proof?"
                : "Approve this artwork and complete the local simulation?";
            return (
              <li key={order.id} className="overflow-hidden rounded-2xl bg-primary ring-1 ring-inset ring-secondary shadow-xs">
                <div className="flex min-h-full flex-col">
                  <PostcardProofReview order={order} />
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-secondary">
                          Custom art · {order.designId}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary">
                          For {order.recipientName}
                        </h2>
                      </div>
                      <span className="rounded-full bg-warning-primary px-2.5 py-1 text-xs font-semibold text-warning-primary ring-1 ring-inset ring-warning_subtle">
                        {order.status === "review"
                          ? `Paid · ${order.providerMode} review hold`
                          : recoveringRefund
                            ? "Paid · refund recovery"
                            : "Paid · provider recovery"}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-quaternary">Sender</dt>
                        <dd className="mt-0.5 text-secondary">{order.senderName?.trim() || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-quaternary">Paid</dt>
                        <dd className="mt-0.5 text-secondary">{money(order.amountCents, order.currency)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-quaternary">Submitted</dt>
                        <dd className="mt-0.5 text-secondary">{new Date(order.createdAt).toLocaleString()}</dd>
                      </div>
                    </dl>

                    <div className="rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
                      <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">Printed message</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">
                        {order.message}
                      </p>
                    </div>

                    {order.lastFulfillmentError ? (
                      <div className="rounded-lg bg-warning-primary p-3 text-xs text-warning-primary ring-1 ring-inset ring-warning_subtle">
                        Previous mail attempt{order.fulfillmentAttempts > 0 ? ` #${order.fulfillmentAttempts}` : ""}: {order.lastFulfillmentError}
                      </div>
                    ) : null}

                    <div className="mt-auto border-t border-secondary pt-4">
                      {pending ? (
                        <div className="rounded-xl bg-secondary p-3 ring-1 ring-inset ring-secondary">
                          <p className="text-sm font-semibold text-primary">
                            {pending === "approve"
                              ? approvalConfirmation
                              : "Decline this artwork and refund the full payment?"}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-tertiary">
                            {pending === "approve"
                              ? order.providerMode === "live"
                                ? "Printing cannot be recalled after the provider accepts the order."
                                : "This environment does not send physical mail."
                              : "The postcard will not be printed. The refund uses the original payment."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              color={pending === "approve" ? "primary" : "primary-destructive"}
                              iconLeading={pending === "approve" ? Check : X}
                              isLoading={busy}
                              isDisabled={busyId !== null}
                              onClick={() => void act(order.id, pending)}
                            >
                              {pending === "approve"
                                ? recoveringMail
                                  ? "Confirm retry"
                                  : order.providerMode === "live"
                                  ? "Confirm and mail"
                                  : order.providerMode === "test"
                                    ? "Confirm proof"
                                    : "Confirm simulation"
                                : "Confirm refund"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              color="secondary"
                              isDisabled={busy}
                              onClick={() => setConfirmation(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {!recoveringRefund ? (
                            <Button
                              type="button"
                              size="sm"
                              color="primary"
                              iconLeading={Check}
                              isDisabled={busyId !== null || !order.proofVerified || !order.sourceAssetsComplete}
                              onClick={() => setConfirmation({ id: order.id, action: "approve" })}
                            >
                              {approvalLabel}
                            </Button>
                          ) : null}
                          {!recoveringMail ? (
                            <Button
                              type="button"
                              size="sm"
                              color="secondary-destructive"
                              iconLeading={X}
                              isDisabled={busyId !== null}
                              onClick={() => setConfirmation({ id: order.id, action: "reject" })}
                            >
                              {recoveringRefund ? "Retry refund" : "Decline & refund"}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

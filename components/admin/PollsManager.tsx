"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash01, XClose, BarChart01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Badge } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";

type PollOption = { id: string; label: string; mediaUrl: string | null; votes: number; weightedScore: number; pct: number };
type Poll = {
  id: string;
  question: string;
  kind: "standard" | "caption" | "prediction" | "ranked";
  description: string | null;
  mediaUrl: string | null;
  sourceSubmissionId: string | null;
  winnerOptionId: string | null;
  status: "scheduled" | "open" | "closed";
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  resultsVisibility: "always" | "after_vote" | "after_close";
  featured: boolean;
  communityKey: "core" | "flock" | "stable" | "thugs" | "m3" | "nms" | "slg" | null;
  options: PollOption[];
  totalVotes: number;
  weightedScore: number;
};

/**
 * Admin polls manager (Feature 5): create polls + options via a modal form,
 * open/close them, view live results, delete. Hits /api/admin/polls (admin
 * session required). Uses lightweight inline confirmation — no toast lib.
 */
export function PollsManager() {
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/polls", { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { polls: Poll[] };
      setPolls(data.polls ?? []);
    } catch {
      setPolls([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "open" | "closed") {
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/polls/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Status update failed.");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Status update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/polls/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      setConfirmDelete(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function markWinner(pollId: string, optionId: string | null) {
    setBusy(pollId);
    try {
      const response = await fetch(`/api/admin/polls/${pollId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerOptionId: optionId }),
      });
      if (!response.ok) throw new Error("Winner update failed.");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Winner update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setCommunityTarget(id: string, communityKey: Poll["communityKey"]) {
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/polls/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ communityKey }),
      });
      if (!response.ok) throw new Error("Community target update failed.");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Community target update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-tertiary">
          {polls ? `${polls.length} poll${polls.length === 1 ? "" : "s"}` : "Loading…"}
        </p>
        <Button
          size="lg"
          color="primary"
          iconLeading={<Plus className="size-5" />}
          onClick={() => setModalOpen(true)}
        >
          New poll
        </Button>
      </div>

      {polls === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
      ) : polls.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-secondary bg-secondary p-10 text-center shadow-xs-skeuomorphic">
          <FeaturedIcon icon={BarChart01} size="xl" color="brand" theme="modern" />
          <p className="mt-4 text-lg font-semibold text-primary">No polls yet</p>
          <p className="mt-1 text-sm text-tertiary">Create your first poll to ask the fans.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {polls.map((p) => {
            const lead = Math.max(0, ...p.options.map((o) => o.weightedScore));
            return (
              <li
                key={p.id}
                className="flex flex-col rounded-2xl border border-secondary bg-primary p-5 shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-balance text-lg font-semibold tracking-tight text-primary">
                    {p.question}
                  </h3>
                  <Badge type="pill-color" color={p.status === "open" ? "success" : p.status === "scheduled" ? "brand" : "gray"} size="md">
                    {p.status === "open" ? "Open" : p.status === "scheduled" ? "Scheduled" : "Closed"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-tertiary tabular-nums">
                  {p.totalVotes} unique voter{p.totalVotes === 1 ? "" : "s"}
                  {p.featured ? " · featured" : ""}
                  {p.kind !== "standard" ? ` · ${p.kind}` : ""}
                </p>
                <label className="mt-3 block text-xs font-semibold text-quaternary">
                  Community
                  <select
                    value={p.communityKey ?? "core"}
                    disabled={busy === p.id}
                    onChange={(event) => void setCommunityTarget(p.id, event.target.value as Poll["communityKey"])}
                    className="mt-1 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm font-medium text-primary"
                  >
                    <option value="core">CORE / global FanZone</option>
                    <option value="flock">Flock</option><option value="stable">Stable</option>
                    <option value="thugs">Thugs</option><option value="m3">M3</option>
                    <option value="nms">NMS</option><option value="slg">SLG</option>
                  </select>
                </label>
                {p.description ? <p className="mt-2 text-sm leading-relaxed text-tertiary">{p.description}</p> : null}
                {p.opensAt || p.closesAt ? (
                  <p className="mt-2 text-xs text-quaternary">
                    {p.opensAt ? `Opens ${formatAdminDate(p.opensAt)}` : "Open now"}
                    {p.closesAt ? ` · closes ${formatAdminDate(p.closesAt)}` : ""}
                  </p>
                ) : null}

                <div className="mt-4 space-y-3">
                  {p.options.map((o) => (
                    <div key={o.id}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-secondary">
                          {o.label}
                          {p.winnerOptionId === o.id ? <Badge type="pill-color" color="success" size="sm">Winner</Badge> : null}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-tertiary">
                          {o.pct}% · {o.votes}
                        </span>
                      </div>
                      <ProgressBar
                        value={o.pct}
                        progressClassName={cx(!(o.weightedScore === lead && o.weightedScore > 0) && "bg-fg-quaternary")}
                      />
                      {p.status === "closed" && (p.kind === "caption" || p.kind === "prediction") ? (
                        <button type="button" onClick={() => void markWinner(p.id, p.winnerOptionId === o.id ? null : o.id)} className="mt-1 text-xs font-semibold text-brand-secondary">
                          {p.winnerOptionId === o.id ? "Clear winner" : "Mark winner"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-secondary pt-4">
                  {p.status === "open" || p.status === "scheduled" ? (
                    <Button
                      size="sm"
                      color="secondary"
                      isDisabled={busy === p.id}
                      onClick={() => setStatus(p.id, "closed")}
                    >
                      Close poll
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      color="secondary"
                      isDisabled={busy === p.id}
                      onClick={() => setStatus(p.id, "open")}
                    >
                      Reopen
                    </Button>
                  )}
                  {confirmDelete === p.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-sm font-medium text-secondary">Delete?</span>
                      <Button
                        size="sm"
                        color="primary-destructive"
                        isDisabled={busy === p.id}
                        isLoading={busy === p.id}
                        onClick={() => remove(p.id)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" color="tertiary" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      color="tertiary-destructive"
                      iconLeading={Trash01}
                      onClick={() => setConfirmDelete(p.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen ? (
        <CreatePollModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreatePollModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [question, setQuestion] = useState("");
  const [kind, setKind] = useState<"standard" | "caption" | "prediction" | "ranked">("standard");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [optionMedia, setOptionMedia] = useState<string[]>(["", ""]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [sourceSubmissionId, setSourceSubmissionId] = useState("");
  const [choiceMediaOpen, setChoiceMediaOpen] = useState(false);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [resultsVisibility, setResultsVisibility] = useState<"always" | "after_vote" | "after_close">("after_vote");
  const [featured, setFeatured] = useState(false);
  const [communityKey, setCommunityKey] = useState<NonNullable<Poll["communityKey"]>>("core");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function setOption(i: number, v: string) {
    setOptions((arr) => arr.map((o, idx) => (idx === i ? v : o)));
  }
  function setOptionMediaUrl(i: number, value: string) {
    setOptionMedia((current) => current.map((url, index) => index === i ? value : url));
  }
  function addOption() {
    setOptions((arr) => (arr.length >= 8 ? arr : [...arr, ""]));
    setOptionMedia((arr) => (arr.length >= 8 ? arr : [...arr, ""]));
  }
  function removeOption(i: number) {
    setOptions((arr) => (arr.length <= 2 ? arr : arr.filter((_, idx) => idx !== i)));
    setOptionMedia((arr) => (arr.length <= 2 ? arr : arr.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) {
      setError("Question must be at least 3 characters.");
      return;
    }
    if (clean.length < 2) {
      setError("Add at least two options.");
      return;
    }
    if (kind === "ranked" && clean.length < 3) {
      setError("Ranked polls need at least three choices.");
      return;
    }
    if (new Set(clean.map((option) => option.toLocaleLowerCase())).size !== clean.length) {
      setError("Each option needs to be different.");
      return;
    }
    if (opensAt && closesAt && new Date(opensAt) >= new Date(closesAt)) {
      setError("Opening time must be before closing time.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          kind,
          description: description.trim() || null,
          mediaUrl: mediaUrl.trim() || null,
          sourceSubmissionId: sourceSubmissionId.trim() || null,
          options: options
            .map((label, index) => ({ label: label.trim(), mediaUrl: optionMedia[index]?.trim() || null }))
            .filter((option) => option.label),
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          resultsVisibility,
          featured,
          communityKey,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Couldn't create the poll.");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the poll.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create poll"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-secondary bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-secondary bg-secondary px-5 py-4">
          <div className="flex items-center gap-3">
            <FeaturedIcon icon={BarChart01} size="md" color="brand" theme="modern" />
            <h2 className="text-lg font-semibold text-primary">New poll</h2>
          </div>
          <ButtonUtility size="sm" color="tertiary" icon={XClose} aria-label="Close" onClick={onClose} />
        </div>

        <div className="space-y-5 p-5">
          <Input
            label="Question"
            size="md"
            value={question}
            onChange={(v) => setQuestion(v)}
            placeholder="e.g. Which game should we stream Friday?"
            isRequired
          />

          <label className="block text-sm font-medium text-secondary">
            Community
            <select value={communityKey} onChange={(event) => setCommunityKey(event.target.value as typeof communityKey)} className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary">
              <option value="core">CORE / global FanZone</option>
              <option value="flock">Flock</option><option value="stable">Stable</option>
              <option value="thugs">Thugs</option><option value="m3">M3</option>
              <option value="nms">NMS</option><option value="slg">SLG</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-secondary">
            Format
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary">
              <option value="standard">Single choice</option>
              <option value="caption">Caption contest</option>
              <option value="prediction">Prediction</option>
              <option value="ranked">Ranked choice</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-secondary">
            Context <span className="font-normal text-quaternary">(optional)</span>
            <textarea
              value={description}
              maxLength={600}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A little context before fans choose…"
              className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-secondary bg-primary px-3.5 py-2.5 text-sm text-primary outline-none placeholder:text-placeholder focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>

          {(kind === "caption" || kind === "prediction") ? (
            <details className="rounded-xl border border-secondary bg-secondary">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-secondary">Contest media</summary>
              <div className="space-y-3 border-t border-secondary p-4">
                <label className="block text-sm font-medium text-secondary">Approved wall photo ID <span className="font-normal text-quaternary">(preferred)</span>
                  <input value={sourceSubmissionId} onChange={(event) => setSourceSubmissionId(event.target.value)} placeholder="UUID from a wall permalink" className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary" />
                </label>
                <label className="block text-sm font-medium text-secondary">Or media URL
                  <input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://…" className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary" />
                </label>
                <p className="text-xs text-quaternary">Caption contests use each choice below as a proposed caption; close the poll, then mark the final winner.</p>
              </div>
            </details>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-secondary">Options</p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      size="md"
                      value={o}
                      onChange={(v) => setOption(i, v)}
                      placeholder={`Option ${i + 1}`}
                      aria-label={`Option ${i + 1}`}
                    />
                    {choiceMediaOpen ? (
                      <input
                        type="url"
                        value={optionMedia[i] ?? ""}
                        onChange={(event) => setOptionMediaUrl(i, event.target.value)}
                        placeholder="Optional image or video URL"
                        aria-label={`Media URL for option ${i + 1}`}
                        className="mt-1.5 min-h-9 w-full rounded-lg border border-secondary bg-primary px-3 text-xs text-primary"
                      />
                    ) : null}
                  </div>
                  {options.length > 2 ? (
                    <ButtonUtility
                      size="sm"
                      color="tertiary"
                      icon={Trash01}
                      aria-label={`Remove option ${i + 1}`}
                      onClick={() => removeOption(i)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            {options.length < 8 ? (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover cursor-pointer"
              >
                <Plus className="size-4" /> Add option
              </button>
            ) : null}
            <button type="button" onClick={() => setChoiceMediaOpen((value) => !value)} className="ml-3 mt-2 text-sm font-semibold text-tertiary hover:text-primary">
              {choiceMediaOpen ? "Hide media URLs" : "Add choice media"}
            </button>
          </div>

          <details className="rounded-xl border border-secondary bg-secondary">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-secondary">
              Timing &amp; results <span className="font-normal text-quaternary">(optional)</span>
            </summary>
            <div className="grid gap-4 border-t border-secondary p-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-secondary">Opens
                <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary" />
              </label>
              <label className="text-sm font-medium text-secondary">Closes
                <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary" />
              </label>
              <label className="text-sm font-medium text-secondary sm:col-span-2">Show results
                <select value={resultsVisibility} onChange={(event) => setResultsVisibility(event.target.value as typeof resultsVisibility)} className="mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary">
                  <option value="after_vote">After someone votes</option>
                  <option value="always">Always live</option>
                  <option value="after_close">Only after close</option>
                </select>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-secondary sm:col-span-2">
                <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} className="size-4 accent-[color:var(--color-brand-600)]" /> Feature this poll
              </label>
            </div>
          </details>

          {error ? <p className="text-sm font-medium text-error-primary">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-secondary bg-secondary px-5 py-4">
          <Button size="md" color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            color="primary"
            isLoading={submitting}
            isDisabled={submitting}
            onClick={submit}
          >
            {opensAt && new Date(opensAt).getTime() > Date.now() ? "Schedule poll" : "Create & open"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatAdminDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

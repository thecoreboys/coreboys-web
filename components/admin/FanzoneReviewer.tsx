"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, X, Inbox01, RefreshCw01, Star01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Input } from "@/components/base/input/input";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

type Submission = {
  id: string;
  file_url: string;
  thumb_url: string | null;
  caption: string | null;
  submitter_first_name: string;
  submitter_last_name: string;
  submitter_email: string;
  member_slugs: string[];
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  created_at: string;
  updated_at: string;
  submission_kind: "photo" | "art";
  story: string | null;
  event_name: string | null;
  happened_on: string | null;
  location_label: string | null;
  photographer_credit: string | null;
  moderation_status: "unreviewed" | "safe" | "flagged";
  moderation_notes: string | null;
  featured: boolean;
  report_count: string;
  reports: Array<{ reason: string; details: string | null; createdAt: string }>;
  audit: Array<{ action: string; actorEmail: string; createdAt: string }>;
};

type Filter = "pending" | "approved" | "denied" | "all";

/**
 * Admin fan-wall reviewer. Reads from `fan_submissions` via
 * GET /api/admin/fan-submissions; approves/denies via PATCH on
 * /api/admin/fan-submissions/:id.
 *
 * UUI controls: ButtonGroup filter, Badge status pill, Button actions,
 * Input deny-reason field, FeaturedIcon empty state, Alert errors.
 */
export function FanzoneReviewer() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denyOpenId, setDenyOpenId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fan-submissions", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { submissions: Submission[] };
      setSubs(json.submissions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(
    id: string,
    changes: {
      status?: "approved" | "denied" | "pending";
      denialReason?: string | null;
      featured?: boolean;
      moderationStatus?: "unreviewed" | "safe" | "flagged";
      resolveReports?: boolean;
    },
  ) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/fan-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const visible = subs.filter((s) => filter === "all" || s.status === filter);

  const countFor = (f: Filter) =>
    f === "all" ? subs.length : subs.filter((s) => s.status === f).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup
          size="md"
          selectedKeys={new Set([filter])}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as Filter | undefined;
            if (next) setFilter(next);
          }}
        >
          {(["pending", "approved", "denied", "all"] as Filter[]).map((f) => (
            <ButtonGroupItem key={f} id={f}>
              {f.charAt(0).toUpperCase() + f.slice(1)} · {countFor(f)}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
        <Button
          size="md"
          color="secondary"
          iconLeading={RefreshCw01}
          onClick={load}
          className="ml-auto"
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl bg-error-primary p-3 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle">
          Couldn&apos;t load submissions — {error}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="rounded-xl border border-error_subtle bg-error-primary p-3 text-sm font-medium text-error-primary">
          Action failed — {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
      ) : visible.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl bg-secondary p-10 text-center shadow-xs-skeuomorphic ring-1 ring-inset ring-secondary">
          <FeaturedIcon icon={Inbox01} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-md font-semibold text-primary">
            {filter === "pending" ? "Inbox zero" : `No ${filter} submissions`}
          </p>
          <p className="mt-1 text-sm text-tertiary">
            {filter === "pending"
              ? "Nothing waiting for review."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            const submitter = `${s.submitter_first_name} ${s.submitter_last_name[0] ?? ""}`.trim();
            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary shadow-xs"
              >
                <div className="relative aspect-[4/5] w-full bg-black">
                  <Image
                    src={s.thumb_url ?? s.file_url}
                    alt={s.caption ?? "Fan submission"}
                    fill
                    unoptimized
                    sizes="(max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                  <span className="absolute left-2 top-2">
                    <Badge
                      type="pill-color"
                      color={
                        s.status === "approved"
                          ? "success"
                          : s.status === "denied"
                            ? "gray"
                            : "warning"
                      }
                      size="sm"
                    >
                      {s.status}
                    </Badge>
                  </span>
                  {Number(s.report_count) > 0 ? (
                    <span className="absolute right-2 top-2 rounded-full bg-error-solid px-2 py-1 text-xs font-bold text-white">
                      {s.report_count} report{Number(s.report_count) === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-primary">{submitter || "Anonymous"}</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-quaternary">{s.submission_kind}</span>
                  </div>
                  {s.caption ? (
                    <p className="text-sm leading-relaxed text-tertiary">{s.caption}</p>
                  ) : null}
                  {s.member_slugs.length > 0 ? (
                    <p className="text-xs uppercase tracking-wide text-quaternary">
                      tagged · {s.member_slugs.join(", ")}
                    </p>
                  ) : null}
                  {s.event_name ? <p className="text-xs text-tertiary">Album · {s.event_name}{s.happened_on ? ` · ${s.happened_on}` : ""}</p> : null}
                  <details className="rounded-lg border border-secondary bg-primary">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-secondary">Review details</summary>
                    <dl className="space-y-2 border-t border-secondary px-3 py-2 text-xs text-tertiary">
                      <div><dt className="font-semibold text-secondary">Contact</dt><dd>{s.submitter_first_name} {s.submitter_last_name} · {s.submitter_email}</dd></div>
                      {s.location_label ? <div><dt className="font-semibold text-secondary">Location</dt><dd>{s.location_label}</dd></div> : null}
                      {s.photographer_credit ? <div><dt className="font-semibold text-secondary">Credit</dt><dd>{s.photographer_credit}</dd></div> : null}
                      {s.story ? <div><dt className="font-semibold text-secondary">Story</dt><dd className="whitespace-pre-wrap">{s.story}</dd></div> : null}
                      <div><dt className="font-semibold text-secondary">Safety check</dt><dd>{s.moderation_status}{s.moderation_notes ? ` · ${s.moderation_notes}` : ""}</dd></div>
                      {s.reports?.length ? (
                        <div>
                          <dt className="font-semibold text-error-primary">Open reports</dt>
                          <dd className="mt-1 space-y-1">
                            {s.reports.map((report, index) => (
                              <p key={`${report.createdAt}-${index}`}>
                                <strong className="font-semibold">{report.reason}</strong>
                                {report.details ? ` · ${report.details}` : ""}
                              </p>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                      {s.audit?.length ? (
                        <div>
                          <dt className="font-semibold text-secondary">Audit trail</dt>
                          <dd className="mt-1 space-y-1">
                            {s.audit.map((entry, index) => (
                              <p key={`${entry.createdAt}-${index}`}>{entry.action} · {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString()}</p>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                      <div><dt className="font-semibold text-secondary">Submitted</dt><dd>{new Date(s.created_at).toLocaleString()}</dd></div>
                    </dl>
                  </details>
                  {s.status === "denied" && s.denial_reason ? (
                    <p className="text-xs italic text-tertiary">
                      Denial reason: {s.denial_reason}
                    </p>
                  ) : null}
                  {s.status === "pending" ? (
                    denyOpenId === s.id ? (
                      <div className="flex flex-col gap-2 rounded-lg bg-primary p-2 ring-1 ring-inset ring-secondary">
                        <Input
                          autoFocus
                          size="sm"
                          value={denyReason}
                          onChange={(v) => setDenyReason(v)}
                          placeholder="Short explanation for the submitter"
                          aria-label="Reason for denial"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            color="primary-destructive"
                            isDisabled={!denyReason.trim() || busyId === s.id}
                            onClick={() => {
                              void patch(s.id, { status: "denied", denialReason: denyReason });
                              setDenyOpenId(null);
                              setDenyReason("");
                            }}
                          >
                            Confirm deny
                          </Button>
                          <Button
                            size="sm"
                            color="link-gray"
                            onClick={() => {
                              setDenyOpenId(null);
                              setDenyReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          color="primary"
                          iconLeading={Check}
                          isLoading={busyId === s.id}
                          isDisabled={busyId === s.id}
                          onClick={() => void patch(s.id, { status: "approved", moderationStatus: "safe", resolveReports: true })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          color="secondary-destructive"
                          iconLeading={X}
                          onClick={() => setDenyOpenId(s.id)}
                        >
                          Deny
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-2 border-t border-secondary pt-3">
                      {s.status === "approved" ? (
                        <Button
                          size="sm"
                          color={s.featured ? "secondary" : "tertiary"}
                          iconLeading={Star01}
                          isDisabled={busyId === s.id}
                          onClick={() => void patch(s.id, { featured: !s.featured })}
                        >
                          {s.featured ? "Unfeature" : "Feature"}
                        </Button>
                      ) : null}
                      {Number(s.report_count) > 0 ? (
                        <Button size="sm" color="secondary" isDisabled={busyId === s.id} onClick={() => void patch(s.id, { resolveReports: true })}>
                          Resolve reports
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import type { FanSubmission } from "@/components/clips/ClipSubmitForm";

const SUBS_KEY = "coreboys-clip-submissions:v1";
const APPROVED_KEY = "coreboys-admin-clips:v1"; // shared with the direct-add form

type Filter = "pending" | "approved" | "denied" | "all";

/**
 * Admin review queue for fan-submitted clips. Reads from localStorage
 * (Phase 1) → Phase 4 swaps to /v1/clip-submissions. Approving moves
 * the entry to the same store the direct-add form writes to so the
 * /clips library treats them identically.
 */
export function ReviewQueue() {
  const [subs, setSubs] = useState<FanSubmission[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [denyOpenId, setDenyOpenId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUBS_KEY);
      if (raw) setSubs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: FanSubmission[]) => {
    setSubs(next);
    try {
      localStorage.setItem(SUBS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const approve = (id: string) => {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    // Move into the published clip drafts store.
    try {
      const raw = localStorage.getItem(APPROVED_KEY);
      const prev = raw ? (JSON.parse(raw) as unknown[]) : [];
      const draft = {
        id: sub.id,
        source: sub.source,
        externalId: sub.externalId,
        url: sub.url,
        title: `Fan submission · ${sub.url}`,
        memberSlugs: sub.memberSlugs,
        publishedAt: sub.submittedAt,
        aiDescription: sub.why,
        aspect:
          sub.source === "tiktok"
            ? "vertical"
            : sub.source === "instagram"
              ? /\/reel\//i.test(sub.url)
                ? "vertical"
                : "horizontal"
              : sub.source === "youtube"
                ? /\/shorts\//i.test(sub.url)
                  ? "vertical"
                  : "horizontal"
                : "horizontal",
      };
      localStorage.setItem(APPROVED_KEY, JSON.stringify([draft, ...prev]));
    } catch {
      /* ignore */
    }
    persist(subs.map((s) => (s.id === id ? { ...s, status: "approved" } : s)));
  };

  const deny = (id: string, reason: string) => {
    persist(
      subs.map((s) => (s.id === id ? { ...s, status: "denied", reason } : s)),
    );
    setDenyOpenId(null);
    setDenyReason("");
  };

  const counts = useMemo(() => {
    return {
      pending: subs.filter((s) => s.status === "pending").length,
      approved: subs.filter((s) => s.status === "approved").length,
      denied: subs.filter((s) => s.status === "denied").length,
      all: subs.length,
    };
  }, [subs]);

  const visible = subs.filter((s) => filter === "all" || s.status === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["pending", `Pending · ${counts.pending}`],
            ["approved", `Approved · ${counts.approved}`],
            ["denied", `Denied · ${counts.denied}`],
            ["all", `All · ${counts.all}`],
          ] as Array<[Filter, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
              filter === k
                ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
                : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <p className="text-[12px] text-[color:var(--ink-faint)]">Nothing in this lane</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${
                        s.status === "pending"
                          ? "border-[color:var(--warning)]/50 bg-[color:var(--warning)]/12 text-[color:var(--warning)]"
                          : s.status === "approved"
                            ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/12 text-[color:var(--success)]"
                            : "border-[color:var(--core)]/50 bg-[color:var(--core)]/12 text-[color:var(--core)]"
                      }`}
                    >
                      {s.status}
                    </span>
                    {s.source ? (
                      <span className="rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)] px-2 py-0.5 text-[10px] font-bold tracking-tight text-[color:var(--ink-dim)]">
                        {s.source}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-[color:var(--ink-faint)]">
                      {new Date(s.submittedAt).toLocaleString()}
                    </span>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate text-[13px] font-medium text-[color:var(--ink)] hover:text-[color:var(--core)]"
                  >
                    {s.url}
                  </a>
                  {s.why ? (
                    <p className="mt-1 text-[12px] text-[color:var(--ink-dim)]">&ldquo;{s.why}&rdquo;</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[color:var(--ink-faint)]">
                    Submitted by{" "}
                    <span className="text-[color:var(--ink)]">
                      {[s.submitterFirstName, s.submitterLastName].filter(Boolean).join(" ") ||
                        s.submitterName ||
                        "anonymous"}
                    </span>
                    {s.submitterEmail ? <> · {s.submitterEmail}</> : null}
                    {s.memberSlugs.length > 0 ? (
                      <> · tags: {s.memberSlugs.join(", ")}</>
                    ) : null}
                  </p>
                  {s.reason ? (
                    <p className="mt-1 text-[11px] text-[color:var(--core)]">
                      Reason: {s.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                    title="Open clip"
                  >
                    <ExternalLink size={13} />
                  </a>
                  {s.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => approve(s.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--success)]/50 bg-[color:var(--success)]/12 px-2.5 text-[12px] font-medium text-[color:var(--success)] hover:bg-[color:var(--success)]/20 cursor-pointer"
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDenyOpenId(s.id === denyOpenId ? null : s.id);
                          setDenyReason("");
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--core)]/50 bg-[color:var(--core)]/12 px-2.5 text-[12px] font-medium text-[color:var(--core)] hover:bg-[color:var(--core)]/20 cursor-pointer"
                      >
                        <X size={13} /> Deny
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {denyOpenId === s.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    deny(s.id, denyReason.trim());
                  }}
                  className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--rule)] pt-3"
                >
                  <input
                    type="text"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Reason (visible to admins only)"
                    className="flex-1 min-w-[260px] rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-2 text-[12px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none"
                  />
                  <button type="submit" className="btn btn-secondary">
                    Confirm deny
                  </button>
                  <button
                    type="button"
                    onClick={() => setDenyOpenId(null)}
                    className="text-[11px] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                  >
                    Cancel
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

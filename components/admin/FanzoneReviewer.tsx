"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, X } from "lucide-react";

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
};

type Filter = "pending" | "approved" | "denied" | "all";

/**
 * Admin fan-wall reviewer. Reads from `fan_submissions` via
 * GET /api/admin/fan-submissions; approves/denies via PATCH on
 * /api/admin/fan-submissions/:id.
 */
export function FanzoneReviewer() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denyOpenId, setDenyOpenId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

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

  async function patch(id: string, status: "approved" | "denied", reason?: string) {
    try {
      const res = await fetch(`/api/admin/fan-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, denialReason: reason ?? null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic update.
      setSubs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, denial_reason: reason ?? null } : s)),
      );
    } catch (e) {
      alert(`Action failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  const visible = subs.filter((s) => filter === "all" || s.status === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "denied", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
              filter === f
                ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
                : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-2 text-[10px] opacity-70">
              {filter === f
                ? visible.length
                : f === "all"
                  ? subs.length
                  : subs.filter((s) => s.status === f).length}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 p-3 text-[12px] text-[color:var(--core)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[12px] text-[color:var(--ink-faint)]">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
          <p className="text-[12px] text-[color:var(--ink-faint)]">
            {filter === "pending"
              ? "Inbox zero — nothing waiting for review."
              : `No ${filter} submissions.`}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            const submitter = `${s.submitter_first_name} ${s.submitter_last_name[0] ?? ""}`.trim();
            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
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
                  <span
                    className={`absolute left-2 top-2 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-tight ${
                      s.status === "approved"
                        ? "bg-[color:var(--success)] text-white"
                        : s.status === "denied"
                          ? "bg-[color:var(--ink-faint)] text-[color:var(--bg)]"
                          : "bg-[color:var(--core)] text-white"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-[13px] font-semibold text-[color:var(--ink)]">
                    {submitter || "Anonymous"}
                  </p>
                  {s.caption ? (
                    <p className="text-[12px] leading-relaxed text-[color:var(--ink-dim)]">
                      {s.caption}
                    </p>
                  ) : null}
                  {s.member_slugs.length > 0 ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                      tagged · {s.member_slugs.join(", ")}
                    </p>
                  ) : null}
                  {s.status === "denied" && s.denial_reason ? (
                    <p className="text-[11px] italic text-[color:var(--ink-dim)]">
                      Denial reason: {s.denial_reason}
                    </p>
                  ) : null}
                  {s.status === "pending" ? (
                    denyOpenId === s.id ? (
                      <div className="flex flex-col gap-2 rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/8 p-2">
                        <input
                          type="text"
                          autoFocus
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                          placeholder="Reason for denial (private)"
                          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-2 py-1.5 text-[12px] text-[color:var(--ink)] focus:border-[color:var(--core)] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              patch(s.id, "denied", denyReason || "Not a fit");
                              setDenyOpenId(null);
                              setDenyReason("");
                            }}
                            className="btn btn-primary"
                          >
                            Confirm deny
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDenyOpenId(null);
                              setDenyReason("");
                            }}
                            className="text-[11px] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => patch(s.id, "approved")}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-[color:var(--success)]/60 bg-[color:var(--success)]/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-tight text-[color:var(--success)] transition-all hover:-translate-y-px"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setDenyOpenId(s.id)}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-[color:var(--core)]/60 bg-[color:var(--core)]/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-tight text-[color:var(--core)] transition-all hover:-translate-y-px"
                        >
                          <X size={12} /> Deny
                        </button>
                      </div>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

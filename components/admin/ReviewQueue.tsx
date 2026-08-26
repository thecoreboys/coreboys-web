"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, LinkExternal01, Inbox01 } from "@untitledui/icons";
import type { FanSubmission } from "@/components/clips/ClipSubmitForm";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Input } from "@/components/base/input/input";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

const SUBS_KEY = "coreboys-clip-submissions:v1";
const APPROVED_KEY = "coreboys-admin-clips:v1"; // shared with the direct-add form

type Filter = "pending" | "approved" | "denied" | "all";

/**
 * Admin review queue for fan-submitted clips. Reads from localStorage
 * (Phase 1) → Phase 4 swaps to /v1/clip-submissions. Approving moves
 * the entry to the same store the direct-add form writes to so the
 * /clips library treats them identically.
 *
 * UUI controls: ButtonGroup filter, Badge status pills, Button actions,
 * Input deny-reason field, FeaturedIcon empty state.
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
    <div className="flex flex-col gap-5">
      {/* Filter row */}
      <ButtonGroup
        size="md"
        selectedKeys={new Set([filter])}
        onSelectionChange={(keys) => {
          const next = Array.from(keys)[0] as Filter | undefined;
          if (next) setFilter(next);
        }}
      >
        <ButtonGroupItem id="pending">Pending · {counts.pending}</ButtonGroupItem>
        <ButtonGroupItem id="approved">Approved · {counts.approved}</ButtonGroupItem>
        <ButtonGroupItem id="denied">Denied · {counts.denied}</ButtonGroupItem>
        <ButtonGroupItem id="all">All · {counts.all}</ButtonGroupItem>
      </ButtonGroup>

      {visible.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl bg-secondary p-10 text-center ring-1 ring-inset ring-secondary shadow-xs">
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
        <ul className="flex flex-col gap-3">
          {visible.map((s) => (
            <li
              key={s.id}
              className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      type="pill-color"
                      size="sm"
                      color={
                        s.status === "approved"
                          ? "success"
                          : s.status === "denied"
                            ? "gray"
                            : "warning"
                      }
                    >
                      {s.status}
                    </Badge>
                    {s.source ? (
                      <Badge type="pill-color" size="sm" color="brand">
                        {s.source}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-quaternary">
                      {new Date(s.submittedAt).toLocaleString()}
                    </span>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 block truncate text-sm font-semibold text-primary transition-colors hover:text-brand-secondary"
                  >
                    {s.url}
                  </a>
                  {s.why ? (
                    <p className="mt-1.5 text-sm italic text-tertiary">&ldquo;{s.why}&rdquo;</p>
                  ) : null}
                  <p className="mt-2.5 text-xs text-quaternary">
                    Submitted by{" "}
                    <span className="font-medium text-secondary">
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
                    <p className="mt-1.5 text-xs font-medium text-error-primary">
                      Denial reason: {s.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    href={s.url}
                    target="_blank"
                    size="sm"
                    color="secondary"
                    iconLeading={LinkExternal01}
                  >
                    Open
                  </Button>
                  {s.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        color="primary"
                        iconLeading={Check}
                        onClick={() => approve(s.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        color="secondary-destructive"
                        iconLeading={X}
                        onClick={() => {
                          setDenyOpenId(s.id === denyOpenId ? null : s.id);
                          setDenyReason("");
                        }}
                      >
                        Deny
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {denyOpenId === s.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    deny(s.id, denyReason.trim() || "Not a fit");
                  }}
                  className="mt-4 flex flex-wrap items-end gap-3 border-t border-secondary pt-4"
                >
                  <div className="min-w-[260px] flex-1">
                    <Input
                      autoFocus
                      size="sm"
                      value={denyReason}
                      onChange={(v) => setDenyReason(v)}
                      placeholder="Reason for denial (admins only)"
                      aria-label="Reason for denial"
                    />
                  </div>
                  <Button type="submit" color="primary-destructive" size="sm">
                    Confirm deny
                  </Button>
                  <Button
                    type="button"
                    color="link-gray"
                    size="sm"
                    onClick={() => setDenyOpenId(null)}
                  >
                    Cancel
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

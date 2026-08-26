"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Eye,
  Gauge,
  Lock,
  Medal,
  Plus,
  Radio,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  Shield,
  Sparkles,
  Trophy,
  Unlock,
  Users,
  Vote,
} from "lucide-react";
import {
  EMPTY_PASSPORT_OVERVIEW,
  PASSPORT_ROLE_OPTIONS,
  PASSPORT_ROLE_PERMISSIONS,
  activeEvent,
  activeFreeze,
  budgetPercent,
  canSecondApprove,
  formatAdminTime,
  formatMomentTime,
} from "./control-room-helpers";
import type {
  PassportAdminOverview,
  PassportAppeal,
  PassportAssignment,
  PassportAuditEntry,
  PassportBudget,
  PassportChannel,
  PassportEligibleRecipient,
  PassportEvent,
  PassportFreeze,
  PassportMoment,
  PassportPoll,
  PassportPresenceRecord,
  PassportReward,
  PassportScoreboard,
} from "./types";

type TabId = "desk" | "crew" | "moments" | "safety";

const TABS: Array<{ id: TabId; label: string; icon: typeof Radio }> = [
  { id: "desk", label: "Live desk", icon: Radio },
  { id: "crew", label: "Crew & shifts", icon: Users },
  { id: "moments", label: "Moments & rewards", icon: Sparkles },
  { id: "safety", label: "Safety & audit", icon: Shield },
];

const DESK_PERMISSIONS = [
  "event.manage", "poll.create", "poll.publish", "poll.lock", "poll.certify", "score.revise", "score.certify",
] as const;
const MOMENT_PERMISSIONS = [
  "moment.create", "moment.publish", "edition.seal", "reward.nominate", "reward.approve",
] as const;
const SAFETY_PERMISSIONS = ["channel.freeze", "chat.freeze", "reward.revoke"] as const;

const inputClass = "mt-1.5 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition placeholder:text-placeholder focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-55";
const textAreaClass = `${inputClass} min-h-24 resize-y py-2.5`;

export function PassportControlRoom({
  channels,
  apiBase = "/api/admin/passport",
}: {
  channels: PassportChannel[];
  /** Lets the same scoped control room render under /admin or /studio. */
  apiBase?: string;
}) {
  const [channelSlug, setChannelSlug] = useState(channels[0]?.slug ?? "core");
  const [eventId, setEventId] = useState("");
  const [tab, setTab] = useState<TabId>("desk");
  const [overview, setOverview] = useState<PassportAdminOverview>(EMPTY_PASSPORT_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ channel: channelSlug });
      if (eventId) params.set("event", eventId);
      const response = await fetch(`${apiBase}?${params}`, { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        overview?: Partial<PassportAdminOverview>;
      };
      if (!response.ok) throw new Error(json.error ?? "Unable to load the Passport control room.");
      setOverview({ ...EMPTY_PASSPORT_OVERVIEW, ...json.overview });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the Passport control room.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [apiBase, channelSlug, eventId]);

  useEffect(() => { void load(); }, [load]);

  const channel = channels.find((item) => item.slug === channelSlug) ?? channels[0];
  const channelEvents = useMemo(
    () => overview.events.filter((event) => event.channelSlug === channelSlug),
    [channelSlug, overview.events],
  );
  const event = activeEvent(channelEvents, eventId);
  const selectedEventId = event?.id ?? "";
  const freeze = activeFreeze(overview.freezes, channelSlug, event?.id ?? null) ?? event?.freeze ?? null;
  const budget = overview.budgets.find((item) => item.channelSlug === channelSlug) ?? null;

  useEffect(() => {
    if (!eventId && channelEvents.length > 0) setEventId(activeEvent(channelEvents, "")?.id ?? "");
    if (eventId && channelEvents.length > 0 && !channelEvents.some((item) => item.id === eventId)) {
      setEventId(activeEvent(channelEvents, "")?.id ?? "");
    }
  }, [channelEvents, eventId]);

  async function mutate(action: string, payload: Record<string, unknown>, successMessage: string): Promise<unknown> {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, channelSlug, eventId: selectedEventId || null, ...payload }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; result?: unknown };
      if (!response.ok) throw new Error(json.error ?? json.detail ?? "The control-room action failed.");
      const result = json.result && typeof json.result === "object" ? json.result as Record<string, unknown> : null;
      const eligibleCount = result && typeof result.eligibleCount === "number" ? result.eligibleCount : null;
      const correctAwards = result && typeof result.correctPredictionAwards === "number" ? result.correctPredictionAwards : null;
      setNotice(eligibleCount !== null
        ? `${successMessage} ${eligibleCount.toLocaleString()} verified viewer${eligibleCount === 1 ? "" : "s"} currently qualify.`
        : correctAwards !== null
          ? `${successMessage} ${correctAwards.toLocaleString()} correct-prediction reward${correctAwards === 1 ? "" : "s"} recorded.`
          : successMessage);
      await load(true);
      return json.result;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The control-room action failed.");
    } finally {
      setBusy(null);
    }
    return null;
  }

  const filtered = {
    assignments: overview.assignments.filter((item) => item.channelSlug === null || item.channelSlug === channelSlug),
    shifts: overview.activeShifts.filter((item) => item.channelSlug === channelSlug),
    polls: overview.polls.filter((item) => item.channelSlug === channelSlug && (!selectedEventId || !item.eventId || item.eventId === selectedEventId)),
    scoreboards: overview.scoreboards.filter((item) => !selectedEventId || item.eventId === selectedEventId),
    moments: overview.moments.filter((item) => item.channelSlug === channelSlug && (!selectedEventId || item.eventId === selectedEventId)),
    rewards: overview.rewards.filter((item) => item.channelSlug === channelSlug && (!selectedEventId || !item.eventId || item.eventId === selectedEventId)),
    appeals: overview.appeals.filter((item) => item.channelSlug === channelSlug),
    presenceRecords: overview.presenceRecords,
    audit: overview.audit.filter((item) => item.channelSlug === null || item.channelSlug === channelSlug),
  };
  const isAdmin = overview.currentStaff.role === "admin";
  const permissions = new Set(overview.effectivePermissions);
  const dutyPermissions = new Set(overview.dutyPermissions);
  const hasAnyPermission = (required: readonly string[]) => isAdmin || required.some((permission) => permissions.has(permission));
  const availableTabs = loading ? TABS : TABS.filter((item) => (
    item.id === "crew"
    || (item.id === "desk" && hasAnyPermission(DESK_PERMISSIONS))
    || (item.id === "moments" && hasAnyPermission(MOMENT_PERMISSIONS))
    || (item.id === "safety" && hasAnyPermission(SAFETY_PERMISSIONS))
  ));
  const activeTab = availableTabs.some((item) => item.id === tab) ? tab : (availableTabs[0]?.id ?? "crew");
  const canReleaseFreeze = !freeze || isAdmin || (
    freeze.capabilities.every((capability) => capability === "chat")
      ? permissions.has("chat.freeze")
      : permissions.has("channel.freeze")
  );

  useEffect(() => {
    if (!loading && tab !== activeTab) setTab(activeTab);
  }, [activeTab, loading, tab]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-secondary bg-primary shadow-sm">
        <div
          className="h-1.5"
          style={{ background: channel?.accent ?? "#db0368" }}
          aria-hidden="true"
        />
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <div className="flex min-w-0 items-start gap-3">
            {channel?.artwork ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.artwork} alt="" className="size-12 shrink-0 rounded-xl bg-black object-contain p-2 ring-1 ring-inset ring-white/10" />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">Active scope</p>
              <h2 className="truncate text-xl font-semibold text-primary">{channel?.name ?? "CORE Passport"}</h2>
              <p className="mt-0.5 truncate text-sm text-tertiary">
                {event ? `${event.title} · ${event.status}` : "No event selected"}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Channel">
              <select
                className={inputClass}
                value={channelSlug}
                onChange={(changeEvent) => { setChannelSlug(changeEvent.target.value); setEventId(""); }}
              >
                {channels.map((item) => <option key={item.slug} value={item.slug}>{item.name} · {item.community}</option>)}
              </select>
            </Field>
            <Field label="Event">
              <select className={inputClass} value={selectedEventId} onChange={(changeEvent) => setEventId(changeEvent.target.value)}>
                {channelEvents.length === 0 ? <option value="">No events yet</option> : null}
                {channelEvents.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </section>

      {freeze ? <FreezeBanner freeze={freeze} busy={busy} canRelease={canReleaseFreeze} onUnfreeze={() => mutate("event.freeze", { active: false, capabilities: freeze.capabilities, reason: `Released freeze ${freeze.id}` }, "Controls unfrozen.")} /> : null}
      {error ? <Message role="alert" tone="error">{error}</Message> : null}
      {notice ? <Message role="status" tone="success">{notice}</Message> : null}
      {!loading && !isAdmin && !overview.onDuty ? <Message role="status" tone="warning">Start an on-duty shift in Crew before operating live polls, scores, moments, or event rewards.</Message> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<Users className="size-4" />} label="On duty" value={filtered.shifts.filter((item) => !item.endedAt).length} />
        <Metric icon={<Vote className="size-4" />} label="Live polls" value={filtered.polls.filter((item) => item.status === "live").length} />
        <Metric icon={<Sparkles className="size-4" />} label="Moment drafts" value={filtered.moments.filter((item) => item.status === "draft" || item.status === "preview").length} />
        <Metric icon={<BadgeCheck className="size-4" />} label="Needs approval" value={filtered.rewards.filter((item) => item.status === "pending_approval").length + filtered.appeals.filter((item) => item.status === "open").length} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-secondary bg-primary p-1" role="tablist" aria-label="Passport control room sections">
        <div className="flex min-w-max gap-1">
          {availableTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                aria-controls={`passport-panel-${item.id}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${activeTab === item.id ? "bg-brand-primary text-brand-secondary" : "text-tertiary hover:bg-secondary hover:text-primary"}`}
                onClick={() => setTab(item.id)}
              >
                <Icon className="size-4" /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading Passport control room">
          <div className="h-72 animate-pulse rounded-2xl bg-primary" />
          <div className="h-72 animate-pulse rounded-2xl bg-primary" />
        </div>
      ) : activeTab === "crew" ? (
        <CrewPanel
          panelId="passport-panel-crew"
          staff={overview.staff}
          assignments={filtered.assignments}
          shifts={filtered.shifts}
          channelSlug={channelSlug}
          eventId={selectedEventId}
          currentStaffId={overview.currentStaff.id}
          isAdmin={isAdmin}
          busy={busy}
          mutate={mutate}
        />
      ) : activeTab === "desk" ? (
        <LiveDeskPanel
          panelId="passport-panel-desk"
          event={event}
          channelSlug={channelSlug}
          polls={filtered.polls}
          scoreboards={filtered.scoreboards}
          permissions={permissions}
          dutyPermissions={dutyPermissions}
          isAdmin={isAdmin}
          busy={busy}
          mutate={mutate}
        />
      ) : activeTab === "moments" ? (
        <MomentsPanel
          panelId="passport-panel-moments"
          event={event}
          channelSlug={channelSlug}
          currentStaffId={overview.currentStaff.id}
          canSetCollectionPolicy={overview.currentStaff.role === "admin"}
          eligibleRecipients={overview.eligibleRecipients}
          moments={filtered.moments}
          rewards={filtered.rewards}
          budget={budget}
          signerOptions={channels.filter((item) => item.slug !== "core").map((item) => ({ value: item.slug, label: item.host }))}
          permissions={permissions}
          dutyPermissions={dutyPermissions}
          isAdmin={isAdmin}
          busy={busy}
          mutate={mutate}
        />
      ) : (
        <>
          <SafetyPanel
            panelId="passport-panel-safety"
            event={event}
            channelSlug={channelSlug}
            freeze={freeze}
            appeals={filtered.appeals}
            rewards={filtered.rewards}
            audit={filtered.audit}
            permissions={permissions}
            isAdmin={isAdmin}
            busy={busy}
            mutate={mutate}
          />
          {overview.currentStaff.role === "admin" ? (
            <PresenceCorrectionPanel event={event} records={filtered.presenceRecords} busy={busy} mutate={mutate} />
          ) : null}
        </>
      )}
    </div>
  );
}

type Mutate = (action: string, payload: Record<string, unknown>, successMessage: string) => Promise<unknown>;

function CrewPanel({
  panelId, staff, assignments, shifts, channelSlug, eventId, currentStaffId, isAdmin, busy, mutate,
}: {
  panelId: string;
  staff: PassportAdminOverview["staff"];
  assignments: PassportAssignment[];
  shifts: PassportAdminOverview["activeShifts"];
  channelSlug: string;
  eventId: string;
  currentStaffId: string;
  isAdmin: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [role, setRole] = useState("poll_host");
  const [scopeType, setScopeType] = useState<"channel" | "event">("channel");
  const [endsAt, setEndsAt] = useState("");

  useEffect(() => { if (!staffId && staff[0]?.id) setStaffId(staff[0].id); }, [staff, staffId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await mutate("assignment.upsert", {
      staffId,
      role,
      scopeType,
      channelSlug,
      eventId: scopeType === "event" ? eventId : null,
      permissions: [...(PASSPORT_ROLE_PERMISSIONS[role] ?? [])],
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    }, "Scoped role assigned.");
  }

  return (
    <div id={panelId} role="tabpanel" className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
      <Panel icon={<Users className="size-5" />} title="Assign channel crew" description="Authority is limited to this channel or the selected event and automatically expires when configured.">
        {!isAdmin ? <Empty>Only a CORE administrator can change role assignments. Your own on-duty shift remains available here.</Empty> : <form className="space-y-4" onSubmit={submit}>
          <Field label="Staff account">
            <select required className={inputClass} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              <option value="" disabled>Select staff</option>
              {staff.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.email}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Control-room role">
              <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}>
                {PASSPORT_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Scope">
              <select className={inputClass} value={scopeType} onChange={(event) => setScopeType(event.target.value as "channel" | "event")}>
                <option value="channel">Entire channel</option>
                <option value="event" disabled={!eventId}>Selected event only</option>
              </select>
            </Field>
          </div>
          <Field label="Access expires" hint="Optional">
            <input className={inputClass} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
          <div className="rounded-lg bg-secondary p-3 text-xs leading-relaxed text-tertiary">
            <strong className="text-secondary">Included:</strong> {(PASSPORT_ROLE_PERMISSIONS[role] ?? []).map(humanize).join(", ") || "No controls"}.
          </div>
          <ActionButton type="submit" disabled={!staffId || busy !== null} loading={busy === "assignment.upsert"} icon={<Plus className="size-4" />}>Assign role</ActionButton>
        </form>}
      </Panel>

      <div className="space-y-4">
        <Panel icon={<Clock3 className="size-5" />} title="On-duty shifts" description="Starting a shift records who actively controls this broadcast.">
          {shifts.filter((shift) => !shift.endedAt).length === 0 ? <Empty>No one is on duty for this scope.</Empty> : (
            <ul className="space-y-2">
              {shifts.filter((shift) => !shift.endedAt).map((shift) => (
                <li key={shift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-secondary bg-secondary p-3">
                  <div><p className="text-sm font-semibold text-primary">{shift.staffName}</p><p className="text-xs text-tertiary">{humanize(shift.role)} · since {formatAdminTime(shift.startedAt)}</p></div>
                  {isAdmin || shift.staffId === currentStaffId ? <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "shift.end"} onClick={() => mutate("shift.end", { shiftId: shift.id }, `${shift.staffName}'s shift ended.`)}>End shift</ActionButton> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Shield className="size-5" />} title="Scoped assignments" description="Inactive and expired roles remain visible for accountability.">
          {assignments.length === 0 ? <Empty>No Passport roles have been assigned here.</Empty> : (
            <ul className="divide-y divide-secondary">
              {assignments.map((assignment) => {
                const shift = shifts.find((item) => item.assignmentId === assignment.id && !item.endedAt);
                return (
                  <li key={assignment.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-primary">{assignment.staffName}</p>
                          <StatusPill status={assignment.active ? (shift ? "on duty" : "active") : "inactive"} />
                        </div>
                        <p className="mt-0.5 text-sm text-tertiary">{humanize(assignment.role)} · {assignment.scopeType} scope</p>
                        <p className="mt-1 text-xs text-quaternary">{assignment.permissions.map(humanize).join(" · ")}</p>
                        {assignment.endsAt ? <p className="mt-1 text-xs text-quaternary">Expires {formatAdminTime(assignment.endsAt)}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!shift && assignment.active && (isAdmin || assignment.staffId === currentStaffId) ? (
                          <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "shift.start"} onClick={() => mutate("shift.start", { assignmentId: assignment.id }, `${assignment.staffName} is on duty.`)}>Start shift</ActionButton>
                        ) : null}
                        {isAdmin && assignment.active ? (
                          <ActionButton variant="danger" disabled={busy !== null} loading={busy === "assignment.revoke"} onClick={() => {
                            const reason = window.prompt(`Why is ${assignment.staffName}'s scoped role being revoked?`);
                            if (reason?.trim()) void mutate("assignment.revoke", { assignmentId: assignment.id, reason: reason.trim() }, "Scoped role revoked immediately.");
                          }}>Revoke</ActionButton>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function LiveDeskPanel({ panelId, event, channelSlug, polls, scoreboards, permissions, dutyPermissions, isAdmin, busy, mutate }: {
  panelId: string;
  event: PassportEvent | null;
  channelSlug: string;
  polls: PassportPoll[];
  scoreboards: PassportScoreboard[];
  permissions: ReadonlySet<string>;
  dutyPermissions: ReadonlySet<string>;
  isAdmin: boolean;
  busy: string | null;
  mutate: Mutate;
}) {
  const can = (permission: string) => isAdmin || permissions.has(permission);
  const canOperate = (permission: string) => isAdmin || dutyPermissions.has(permission);
  const canUsePolls = ["poll.create", "poll.publish", "poll.lock", "poll.certify"].some(can);
  const canUseScores = ["score.revise", "score.certify"].some(can);
  return (
    <div id={panelId} role="tabpanel" className="space-y-4">
      {can("event.manage") ? <EventDesk event={event} channelSlug={channelSlug} busy={busy} mutate={mutate} /> : null}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {canUsePolls ? <PollDesk event={event} polls={polls} canCreate={can("poll.create")} canCreateNow={canOperate("poll.create")} canPublish={can("poll.publish")} canPublishNow={canOperate("poll.publish")} canLock={can("poll.lock")} canLockNow={canOperate("poll.lock")} canCertify={can("poll.certify")} busy={busy} mutate={mutate} /> : null}
        {canUseScores ? <ScoreDesk event={event} scoreboards={scoreboards} canRevise={can("score.revise")} canReviseNow={canOperate("score.revise")} canCertify={can("score.certify")} busy={busy} mutate={mutate} /> : null}
      </div>
    </div>
  );
}

function EventDesk({ event, channelSlug, busy, mutate }: { event: PassportEvent | null; channelSlug: string; busy: string | null; mutate: Mutate }) {
  const [title, setTitle] = useState("");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [playbackRef, setPlaybackRef] = useState("");
  useEffect(() => { setPlaybackRef(event?.playbackRef ?? ""); }, [event?.id, event?.playbackRef]);
  const hasPlaybackProof = Boolean(event?.playbackRef);
  return (
    <Panel icon={<Radio className="size-5" />} title={event ? event.title : "Create the first event"} description={event ? `${humanize(event.status)} · ${formatAdminTime(event.scheduledStartAt ?? event.startedAt)} · ${event.playbackRef ? `attendance proof bound to ${event.playbackRef}` : "attendance and Moment Cards disabled until exact media is bound"}` : "Events bind staff, polls, scores, moments, and rewards to one accountable broadcast."}>
      {event ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {event.status === "draft" || event.status === "scheduled" ? <ActionButton disabled={busy !== null || !hasPlaybackProof} loading={busy === "event.update"} icon={<Radio className="size-4" />} onClick={() => mutate("event.update", { eventId: event.id, status: "live" }, "Event is live.")}>Go live</ActionButton> : null}
            {event.status === "live" ? <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "event.update"} onClick={() => mutate("event.update", { eventId: event.id, status: "ended" }, "Event ended; results remain unofficial until certified.")}>End event</ActionButton> : null}
            {event.status === "ended" ? <ActionButton disabled={busy !== null} loading={busy === "event.update"} icon={<BadgeCheck className="size-4" />} onClick={() => mutate("event.update", { eventId: event.id, status: "certified" }, "Event certified.")}>Certify event</ActionButton> : null}
          </div>
          {!hasPlaybackProof ? <Message tone="warning" role="status">Bind the exact player reference before going live. Poll and score drafts remain available, but attendance, Moment Cards, and presence rewards cannot be verified without it.</Message> : null}
          {event.status === "draft" || event.status === "scheduled" ? <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(formEvent) => { formEvent.preventDefault(); void mutate("event.update", { eventId: event.id, externalRef: playbackRef.trim() }, "Playback proof updated."); }}><Field label="Attendance playback reference" hint="Exact media URL or canonical provider ID"><input required maxLength={200} className={inputClass} value={playbackRef} onChange={(changeEvent) => setPlaybackRef(changeEvent.target.value)} placeholder="youtube:video-id or twitch:stream:login" /></Field><ActionButton type="submit" disabled={!playbackRef.trim() || busy !== null || playbackRef.trim() === (event.playbackRef ?? "")} loading={busy === "event.update"} icon={<Lock className="size-4" />}>Bind media</ActionButton></form> : null}
        </div>
      ) : (
        <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto] xl:items-end" onSubmit={(formEvent) => { formEvent.preventDefault(); void mutate("event.create", { channelSlug, title, externalRef: playbackRef.trim() || null, scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null }, "Event created.").then(() => { setTitle(""); setPlaybackRef(""); setScheduledStartAt(""); }); }}>
          <Field label="Event title"><input required minLength={3} maxLength={140} className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="CORE House Game Night" /></Field>
          <Field label="Playback reference" hint="Required for verified attendance and cards"><input required maxLength={200} className={inputClass} value={playbackRef} onChange={(event) => setPlaybackRef(event.target.value)} placeholder="youtube:video-id or twitch:stream:login" /></Field>
          <Field label="Scheduled start"><input className={inputClass} type="datetime-local" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} /></Field>
          <ActionButton type="submit" disabled={!title.trim() || !playbackRef.trim() || busy !== null} loading={busy === "event.create"} icon={<Plus className="size-4" />}>Create event</ActionButton>
        </form>
      )}
    </Panel>
  );
}

function PollDesk({ event, polls, canCreate, canCreateNow, canPublish, canPublishNow, canLock, canLockNow, canCertify, busy, mutate }: { event: PassportEvent | null; polls: PassportPoll[]; canCreate: boolean; canCreateNow: boolean; canPublish: boolean; canPublishNow: boolean; canLock: boolean; canLockNow: boolean; canCertify: boolean; busy: string | null; mutate: Mutate }) {
  const [question, setQuestion] = useState("");
  const [kind, setKind] = useState<PassportPoll["kind"]>("standard");
  const [audience, setAudience] = useState<PassportPoll["audience"]>("signed_in");
  const [options, setOptions] = useState(["", ""]);
  const [winningOptions, setWinningOptions] = useState<Record<string, string>>({});
  const transitions: Readonly<Record<PassportPoll["status"], PassportPoll["status"] | null>> = { draft: "preview", preview: "live", live: "locked", locked: "certified", certified: null };
  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!canCreateNow) return;
    await mutate("poll.create", { eventId: event?.id, question, kind, audience, options: options.map((item) => item.trim()).filter(Boolean) }, "Poll draft created.");
    setQuestion(""); setOptions(["", ""]);
  }
  return (
    <Panel icon={<Vote className="size-5" />} title="Poll control" description="Draft, preview, publish, lock, then certify. Certified results cannot be silently changed.">
      {canCreate ? <form className="space-y-3" onSubmit={submit}>
        <Field label="Question"><input required minLength={3} maxLength={280} disabled={!event} className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Who was tonight's MVP?" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format"><select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as PassportPoll["kind"])}><option value="standard">Single choice</option><option value="prediction">Prediction</option><option value="trivia">Trivia</option><option value="mvp">MVP</option></select></Field>
          <Field label="Eligible audience"><select className={inputClass} value={audience} onChange={(event) => setAudience(event.target.value as PassportPoll["audience"])}><option value="everyone">Everyone</option><option value="signed_in">Signed-in fans</option><option value="live_attendees">Verified live attendees</option></select></Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option, index) => <input key={index} aria-label={`Poll option ${index + 1}`} required className={inputClass} value={option} onChange={(event) => setOptions((all) => all.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} />)}
        </div>
        <div className="flex flex-wrap gap-2"><ActionButton type="button" variant="secondary" disabled={options.length >= 8} onClick={() => setOptions((all) => [...all, ""])} icon={<Plus className="size-4" />}>Option</ActionButton><ActionButton type="submit" disabled={!event || !canCreateNow || busy !== null || options.filter((item) => item.trim()).length < 2} loading={busy === "poll.create"}>Save draft</ActionButton></div>
      </form> : null}
      <div className="mt-5 border-t border-secondary pt-4">
        {polls.length === 0 ? <Empty>No polls for this event.</Empty> : <ul className="space-y-3">{polls.map((poll) => {
          const next = transitions[poll.status];
          const needsWinner = next === "certified" && (poll.kind === "prediction" || poll.kind === "trivia");
          const winnerOptionId = winningOptions[poll.id] ?? "";
          const canTransition = next === "live" ? canPublish : next === "certified" ? canCertify : next !== null ? canLock : false;
          const shiftReady = next === "live" ? canPublishNow : next === "certified" ? true : canLockNow;
          return (
            <li key={poll.id} className="rounded-xl border border-secondary bg-secondary p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-primary">{poll.question}</p><p className="mt-0.5 text-xs text-tertiary">{humanize(poll.kind)} · {humanize(poll.audience)} · {poll.options.reduce((sum, option) => sum + option.votes, 0)} votes</p></div>
                <StatusPill status={poll.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">{poll.options.map((option) => <span key={option.id} className="rounded-md bg-primary px-2 py-1 text-xs text-secondary">{option.label} · {option.votes}</span>)}</div>
                {next && canTransition ? <div className="flex flex-wrap items-end gap-2">
                  {needsWinner ? <Field label="Certified answer"><select aria-label={`Winning option for ${poll.question}`} className={`${inputClass} min-w-44`} value={winnerOptionId} onChange={(event) => setWinningOptions((all) => ({ ...all, [poll.id]: event.target.value }))}><option value="">Choose winner</option>{poll.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field> : null}
                  <ActionButton variant={next === "certified" ? "primary" : "secondary"} disabled={!shiftReady || busy !== null || (needsWinner && !winnerOptionId)} loading={busy === "poll.transition"} icon={next === "preview" ? <Eye className="size-4" /> : next === "live" ? <Send className="size-4" /> : next === "locked" ? <Lock className="size-4" /> : <BadgeCheck className="size-4" />} onClick={() => mutate("poll.transition", { pollId: poll.id, status: next, winnerOptionId: winnerOptionId || null }, `Poll moved to ${humanize(next)}.`)}>{humanize(next)}</ActionButton>
                </div> : null}
              </div>
            </li>
          );
        })}</ul>}
      </div>
    </Panel>
  );
}

function ScoreDesk({ event, scoreboards, canRevise, canReviseNow, canCertify, busy, mutate }: { event: PassportEvent | null; scoreboards: PassportScoreboard[]; canRevise: boolean; canReviseNow: boolean; canCertify: boolean; busy: string | null; mutate: Mutate }) {
  const scoreboard = scoreboards[0] ?? null;
  const [homeName, setHomeName] = useState("CORE");
  const [awayName, setAwayName] = useState("Guests");
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [reason, setReason] = useState("Score update");
  useEffect(() => { if (scoreboard) { setHomeScore(String(scoreboard.homeScore)); setAwayScore(String(scoreboard.awayScore)); } }, [scoreboard?.id, scoreboard?.homeScore, scoreboard?.awayScore]);
  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!canReviseNow) return;
    await mutate("score.revise", { scoreboardId: scoreboard?.id ?? null, eventId: event?.id, title: scoreboard?.title ?? `${homeName} vs ${awayName}`, homeName: scoreboard?.homeName ?? homeName, awayName: scoreboard?.awayName ?? awayName, homeScore: Number(homeScore), awayScore: Number(awayScore), reason }, scoreboard ? "Unofficial score updated." : "Scoreboard created.");
  }
  return (
    <Panel icon={<Trophy className="size-5" />} title="Verified scoreboard" description="Every change is a revision. Another operator must verify the current result.">
      <form className="space-y-3" onSubmit={submit}>
        {!scoreboard ? <div className="grid grid-cols-2 gap-3"><Field label="Home"><input disabled={!canRevise} className={inputClass} value={homeName} onChange={(event) => setHomeName(event.target.value)} /></Field><Field label="Away"><input disabled={!canRevise} className={inputClass} value={awayName} onChange={(event) => setAwayName(event.target.value)} /></Field></div> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={scoreboard?.homeName ?? homeName}><input required disabled={!canRevise} min={0} max={9999} type="number" className={`${inputClass} text-2xl font-semibold tabular-nums`} value={homeScore} onChange={(event) => setHomeScore(event.target.value)} /></Field>
          <Field label={scoreboard?.awayName ?? awayName}><input required disabled={!canRevise} min={0} max={9999} type="number" className={`${inputClass} text-2xl font-semibold tabular-nums`} value={awayScore} onChange={(event) => setAwayScore(event.target.value)} /></Field>
        </div>
        <Field label="Revision reason"><input required disabled={!canRevise} minLength={3} maxLength={240} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-2">{canRevise ? <ActionButton type="submit" disabled={!event || !canReviseNow || busy !== null} loading={busy === "score.revise"} icon={<RotateCcw className="size-4" />}>{scoreboard ? "Record revision" : "Create scoreboard"}</ActionButton> : null}{canCertify && scoreboard?.lastRevisionId && scoreboard.status === "unofficial" ? <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "score.certify"} icon={<BadgeCheck className="size-4" />} onClick={() => mutate("score.certify", { scoreboardId: scoreboard.id, revisionId: Number(scoreboard.lastRevisionId) }, "Current score verified.")}>Verify current score</ActionButton> : null}<StatusPill status={scoreboard?.status ?? "not started"} /></div>
      </form>
      {scoreboard?.revisions.length ? <details className="mt-4 rounded-xl border border-secondary bg-secondary"><summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-secondary">Correction ledger · {scoreboard.revisions.length}</summary><ol className="space-y-2 border-t border-secondary p-3">{scoreboard.revisions.map((revision) => <li key={revision.id} className="text-xs text-tertiary"><span className="font-semibold text-primary">{revision.homeScore}–{revision.awayScore}</span> · {revision.reason} · {revision.actorName} · {formatAdminTime(revision.createdAt)}{revision.verifiedByName ? ` · verified by ${revision.verifiedByName}` : " · awaiting verifier"}</li>)}</ol></details> : null}
    </Panel>
  );
}

function MomentsPanel({ panelId, event, channelSlug, currentStaffId, canSetCollectionPolicy, eligibleRecipients, moments, rewards, budget, signerOptions, permissions, dutyPermissions, isAdmin, busy, mutate }: {
  panelId: string; event: PassportEvent | null; channelSlug: string; currentStaffId: string; canSetCollectionPolicy: boolean; eligibleRecipients: PassportEligibleRecipient[]; moments: PassportMoment[]; rewards: PassportReward[]; budget: PassportBudget | null; signerOptions: Array<{ value: string; label: string }>; permissions: ReadonlySet<string>; dutyPermissions: ReadonlySet<string>; isAdmin: boolean; busy: string | null; mutate: Mutate;
}) {
  const can = (permission: string) => isAdmin || permissions.has(permission);
  const canOperate = (permission: string) => isAdmin || dutyPermissions.has(permission);
  const canUseMoments = ["moment.create", "moment.publish", "edition.seal"].some(can);
  const canUseRewards = ["reward.nominate", "reward.approve"].some(can);
  return <div id={panelId} role="tabpanel" className="space-y-4">{budget ? <BudgetPanel budget={budget} /> : null}<div className="grid items-start gap-4 xl:grid-cols-2">{canUseMoments ? <MomentDesk event={event} moments={moments} signerOptions={signerOptions} canSetCollectionPolicy={canSetCollectionPolicy} canCreate={can("moment.create")} canCreateNow={canOperate("moment.create")} canPublish={can("moment.publish")} canSeal={can("edition.seal")} busy={busy} mutate={mutate} /> : null}{canUseRewards ? <RewardDesk event={event} channelSlug={channelSlug} currentStaffId={currentStaffId} eligibleRecipients={eligibleRecipients} rewards={rewards} canNominate={can("reward.nominate")} canNominateNow={canOperate("reward.nominate")} canApprove={can("reward.approve")} busy={busy} mutate={mutate} /> : null}</div></div>;
}

function BudgetPanel({ budget }: { budget: PassportBudget }) {
  const rows = [["Common", budget.commonUsed, budget.commonLimit], ["Rare", budget.rareUsed, budget.rareLimit], ["Historic / Legendary", budget.legendaryUsed, budget.legendaryLimit]] as const;
  return <Panel icon={<Gauge className="size-5" />} title="Channel reward budget" description="Previews do not consume inventory. Approved grants count immediately; historic rewards share the protected legendary pool."><div className="grid gap-3 sm:grid-cols-3">{rows.map(([label, used, limit]) => <div key={label} className="rounded-xl border border-secondary bg-secondary p-3"><div className="flex justify-between gap-3 text-xs"><span className="font-semibold text-secondary">{label}</span><span className="tabular-nums text-tertiary">{used} / {limit}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary"><div className={`h-full rounded-full ${budgetPercent(used, limit) >= 90 ? "bg-error-solid" : "bg-brand-solid"}`} style={{ width: `${budgetPercent(used, limit)}%` }} /></div></div>)}</div></Panel>;
}

function MomentDesk({ event, moments, signerOptions, canSetCollectionPolicy, canCreate, canCreateNow, canPublish, canSeal, busy, mutate }: { event: PassportEvent | null; moments: PassportMoment[]; signerOptions: Array<{ value: string; label: string }>; canSetCollectionPolicy: boolean; canCreate: boolean; canCreateNow: boolean; canPublish: boolean; canSeal: boolean; busy: string | null; mutate: Mutate }) {
  const [title, setTitle] = useState("");
  const [rarity, setRarity] = useState<PassportMoment["rarity"]>("common");
  const [timestamp, setTimestamp] = useState("0");
  const [before, setBefore] = useState("300");
  const [after, setAfter] = useState("180");
  const [threshold, setThreshold] = useState("50");
  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!canCreateNow) return;
    await mutate("moment.create", { eventId: event?.id, title, rarity, timestampSeconds: Number(timestamp), windowBeforeSeconds: Number(before), windowAfterSeconds: Number(after), watchThresholdPercent: Number(threshold) }, "Moment draft captured.");
    setTitle("");
    setRarity("common");
  }
  return <Panel icon={<Sparkles className="size-5" />} title="Official moments" description="Capture the timestamp, choose its significance, preview eligibility, publish the illustrated edition, then seal it.">{canCreate ? <form className="space-y-3" onSubmit={submit}><Field label="Moment title"><input required minLength={3} maxLength={140} disabled={!event} className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Buzzer at the House" /></Field><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Field label="Significance"><select className={inputClass} value={rarity} onChange={(event) => setRarity(event.target.value as PassportMoment["rarity"])}><option value="common">Common memory</option><option value="rare">Rare moment</option><option value="historic">Historic moment</option><option value="legendary">Legendary moment</option></select></Field><Field label="Player second"><input type="number" min={0} required className={inputClass} value={timestamp} onChange={(event) => setTimestamp(event.target.value)} /></Field><Field label="Before (sec)"><input type="number" min={0} max={3600} className={inputClass} value={before} onChange={(event) => setBefore(event.target.value)} /></Field><Field label="After (sec)"><input type="number" min={0} max={3600} className={inputClass} value={after} onChange={(event) => setAfter(event.target.value)} /></Field><Field label="Watch %"><input type="number" min={1} max={100} className={inputClass} value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field></div><p className="text-xs text-quaternary">Legendary moments require a different authorized operator to publish the final edition.</p><ActionButton type="submit" disabled={!event || !canCreateNow || busy !== null} loading={busy === "moment.create"} icon={<Plus className="size-4" />}>Mark moment</ActionButton></form> : null}<div className={canCreate ? "mt-5 border-t border-secondary pt-4" : ""}>{moments.length === 0 ? <Empty>No official moments marked yet.</Empty> : <ul className="space-y-3">{moments.map((moment) => <MomentRow key={moment.id} moment={moment} signerOptions={signerOptions} canSetCollectionPolicy={canSetCollectionPolicy} canPreview={canCreateNow} canPublish={canPublish} canSeal={canSeal} busy={busy} mutate={mutate} />)}</ul>}</div></Panel>;
}

function MomentRow({ moment, signerOptions, canSetCollectionPolicy, canPreview, canPublish, canSeal, busy, mutate }: { moment: PassportMoment; signerOptions: Array<{ value: string; label: string }>; canSetCollectionPolicy: boolean; canPreview: boolean; canPublish: boolean; canSeal: boolean; busy: string | null; mutate: Mutate }) {
  const [variant, setVariant] = useState<"base" | "signed">("base");
  const [signedBy, setSignedBy] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [maxSupply, setMaxSupply] = useState("");
  const [collectionMode, setCollectionMode] = useState<"account_bound" | "transferable">("account_bound");
  const [giftable, setGiftable] = useState(true);
  const [tradeable, setTradeable] = useState(false);
  const [craftValue, setCraftValue] = useState("0");
  const publishable = moment.status === "draft" || moment.status === "preview";
  const transferEnabled = collectionMode === "transferable" && (giftable || tradeable);
  return (
    <li className="rounded-xl border border-secondary bg-secondary p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-primary">{moment.title} <span className="ml-1 rounded-full border border-secondary bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tertiary">{moment.rarity}</span></p><p className="mt-0.5 text-xs text-tertiary">At {formatMomentTime(moment.timestampSeconds)} · {moment.windowBeforeSeconds}s before / {moment.windowAfterSeconds}s after · {moment.watchThresholdPercent}% watch</p>{moment.estimatedRecipients !== null ? <p className="mt-1 text-xs font-semibold text-brand-secondary">Estimated {moment.estimatedRecipients.toLocaleString()} recipients</p> : null}</div>
        <StatusPill status={moment.status} />
      </div>
      {publishable && canPublish ? <div className="mt-3 grid gap-2 rounded-lg border border-secondary bg-primary p-3 sm:grid-cols-2">
        <Field label="Edition variant"><select className={inputClass} value={variant} onChange={(event) => setVariant(event.target.value as "base" | "signed")}><option value="base">Base edition</option><option value="signed">Creator-signed edition</option></select></Field>
        {variant === "signed" ? <Field label="Signed by"><select required className={inputClass} value={signedBy} onChange={(event) => setSignedBy(event.target.value)}><option value="">Choose a CORE member</option>{signerOptions.map((signer) => <option key={signer.value} value={signer.value}>{signer.label}</option>)}</select></Field> : <p className="self-end pb-2 text-xs text-quaternary">The safe collection default is account-bound with no craft value.</p>}
        <Field label="Card artwork" hint="Optional HTTPS image"><input type="url" inputMode="url" maxLength={2048} className={inputClass} value={artworkUrl} onChange={(event) => setArtworkUrl(event.target.value)} placeholder="https://cdn.example.com/moment-card.jpg" /></Field>
        <Field label="Maximum supply" hint="Leave empty for an open edition"><input type="number" min={1} max={1000000} step={1} className={inputClass} value={maxSupply} onChange={(event) => setMaxSupply(event.target.value)} placeholder="Open edition" /></Field>
        <p className="text-xs text-quaternary sm:col-span-2">Rarity, artwork, and supply become part of the edition provenance at publish time. A capped edition stops issuing automatically when its supply is reached.</p>
      </div> : null}
      {publishable && canPublish && canSetCollectionPolicy ? <details className="mt-2 rounded-lg border border-secondary bg-primary">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Collection policy · admin only</summary>
        <div className="grid gap-3 border-t border-secondary p-3 sm:grid-cols-2">
          <Field label="Ownership"><select className={inputClass} value={collectionMode} onChange={(event) => setCollectionMode(event.target.value as "account_bound" | "transferable")}><option value="account_bound">Account-bound · safest default</option><option value="transferable">Transferable</option></select></Field>
          <Field label="Craft value"><input type="number" min={0} max={10000} step={1} className={inputClass} value={craftValue} onChange={(event) => setCraftValue(event.target.value)} /><span className="mt-1 block text-[11px] font-normal text-quaternary">0–10,000 Sparks when a later audited crafting rule permits retirement.</span></Field>
          {collectionMode === "transferable" ? <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-tertiary">Allowed transfers</legend><div className="mt-2 flex flex-wrap gap-2"><label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-secondary bg-secondary px-3 text-sm text-secondary"><input type="checkbox" checked={giftable} onChange={(event) => setGiftable(event.target.checked)} /> Gifts</label><label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-secondary bg-secondary px-3 text-sm text-secondary"><input type="checkbox" checked={tradeable} onChange={(event) => setTradeable(event.target.checked)} /> Trades</label></div>{!transferEnabled ? <p role="alert" className="mt-2 text-xs text-error-primary">Allow gifts, trades, or both before publishing a transferable edition.</p> : null}</fieldset> : null}
          <p className="text-xs text-quaternary sm:col-span-2">Publishing fixes this edition policy in its provenance. Account-bound and transferable cannot be enabled together.</p>
        </div>
      </details> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canPreview && moment.status === "draft" ? <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "moment.preview"} icon={<Eye className="size-4" />} onClick={() => mutate("moment.preview", { momentId: moment.id }, "Eligibility preview calculated.")}>Preview audience</ActionButton> : null}
        {canPublish && publishable ? <ActionButton disabled={busy !== null || (variant === "signed" && !signedBy.trim()) || (canSetCollectionPolicy && collectionMode === "transferable" && !transferEnabled)} loading={busy === "moment.publish"} icon={<Send className="size-4" />} onClick={() => mutate("moment.publish", { momentId: moment.id, variant, signedBy: variant === "signed" ? signedBy.trim() : null, artworkUrl: artworkUrl.trim() || null, maxSupply: maxSupply ? Number(maxSupply) : null, accountBound: canSetCollectionPolicy ? collectionMode === "account_bound" : true, giftable: canSetCollectionPolicy && collectionMode === "transferable" ? giftable : false, tradeable: canSetCollectionPolicy && collectionMode === "transferable" ? tradeable : false, craftValue: canSetCollectionPolicy ? Number(craftValue) : 0 }, "Moment published; qualifying viewers may now receive it.")}>Publish {variant === "signed" ? "signed" : "base"} edition</ActionButton> : null}
        {canSeal && moment.status === "published" && moment.edition ? <ActionButton variant="secondary" disabled={busy !== null} loading={busy === "edition.seal"} icon={<Lock className="size-4" />} onClick={() => mutate("edition.seal", { editionId: moment.edition?.id }, "Edition sealed and serials fixed.")}>Seal edition</ActionButton> : null}
        {moment.edition ? <span className="inline-flex min-h-9 items-center rounded-lg border border-secondary bg-primary px-2.5 text-xs text-tertiary">{humanize(moment.edition.rarity)} · {humanize(moment.edition.variant)}{moment.edition.signedBy ? ` by ${moment.edition.signedBy}` : ""} · {moment.edition.accountBound ? "account-bound" : [moment.edition.giftable ? "giftable" : "", moment.edition.tradeable ? "tradeable" : ""].filter(Boolean).join(" + ")} · {humanize(moment.edition.status)} · {moment.edition.issuedCount}{moment.edition.maxSupply ? ` / ${moment.edition.maxSupply} max` : moment.edition.editionSize ? ` / ${moment.edition.editionSize}` : " issued"}{moment.edition.craftValue ? ` · ${moment.edition.craftValue} craft` : ""}</span> : null}
      </div>
      {moment.edition?.artworkUrl ? <div className="mt-3 w-fit overflow-hidden rounded-lg border border-secondary bg-primary"><img src={moment.edition.artworkUrl} alt={`${moment.edition.name} card artwork`} className="aspect-[3/4] w-40 object-cover sm:w-48" /></div> : null}
    </li>
  );
}

function RewardDesk({ event, channelSlug, currentStaffId, eligibleRecipients, rewards, canNominate, canNominateNow, canApprove, busy, mutate }: { event: PassportEvent | null; channelSlug: string; currentStaffId: string; eligibleRecipients: PassportEligibleRecipient[]; rewards: PassportReward[]; canNominate: boolean; canNominateNow: boolean; canApprove: boolean; busy: string | null; mutate: Mutate }) {
  const [recipient, setRecipient] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [rewardType, setRewardType] = useState<PassportReward["rewardType"]>("achievement");
  const [rewardKey, setRewardKey] = useState("");
  const [label, setLabel] = useState("");
  const [rarity, setRarity] = useState<PassportReward["rarity"]>("common");
  const [reason, setReason] = useState("");
  const visibleRecipients = useMemo(() => {
    const query = recipientQuery.trim().replace(/^@/, "").toLocaleLowerCase();
    if (!query) return eligibleRecipients;
    return eligibleRecipients.filter((candidate) => `${candidate.displayName} ${candidate.publicSlug ?? ""}`.toLocaleLowerCase().includes(query));
  }, [eligibleRecipients, recipientQuery]);

  useEffect(() => {
    if (recipient && !eligibleRecipients.some((candidate) => candidate.id === recipient)) setRecipient("");
  }, [eligibleRecipients, recipient]);

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!canNominateNow || !recipient) return;
    const result = await mutate("reward.nominate", { channelSlug, eventId: event?.id ?? null, recipientUserId: recipient, rewardType, rewardKey, rewardLabel: label, rarity, quantity: 1, reason }, "Reward preview created; approval rules applied.");
    if (result === null) return;
    setRecipient("");
    setRecipientQuery("");
    setRewardKey("");
    setLabel("");
    setReason("");
  }

  return <Panel icon={<Medal className="size-5" />} title="Reward desk" description="Nominate a verified attendee first. Rare or mass rewards need another authorized operator; self-grants are blocked.">
    {canNominate ? <form className="space-y-3" onSubmit={submit}>
      {!event ? <Message tone="warning" role="status">Select an event before choosing a recipient.</Message> : eligibleRecipients.length === 0 ? <Empty>No verified or eligible attendees are available for this event yet.</Empty> : <div className="rounded-xl border border-secondary bg-secondary p-3">
        <Field label="Find verified attendee"><input type="search" autoComplete="off" className={inputClass} value={recipientQuery} onChange={(changeEvent) => setRecipientQuery(changeEvent.target.value)} placeholder="Search a display name or @handle" /></Field>
        <Field label="Eligible attendee"><select required className={inputClass} value={recipient} onChange={(changeEvent) => setRecipient(changeEvent.target.value)}><option value="">Choose an attendee</option>{visibleRecipients.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}{candidate.publicSlug ? ` · @${candidate.publicSlug}` : ""}</option>)}</select></Field>
        {visibleRecipients.length === 0 ? <p className="mt-2 text-xs text-tertiary" role="status">No eligible attendee matches that public name or handle.</p> : <p className="mt-2 text-xs text-quaternary">Only verified or eligible attendees for {event.title} appear here. Email and other private account data are never shown.</p>}
      </div>}
      <div className="grid grid-cols-2 gap-3"><Field label="Reward"><select className={inputClass} value={rewardType} onChange={(changeEvent) => setRewardType(changeEvent.target.value as PassportReward["rewardType"])}><option value="achievement">Badge / achievement</option><option value="card">Moment card</option><option value="cosmetic">Title / cosmetic</option><option value="xp">Channel XP</option><option value="sparks">Sparks</option></select></Field><Field label="Rarity"><select className={inputClass} value={rarity} onChange={(changeEvent) => setRarity(changeEvent.target.value as PassportReward["rarity"])}><option value="common">Common</option><option value="rare">Rare</option><option value="historic">Historic</option><option value="legendary">Legendary</option></select></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Definition key"><input required className={inputClass} value={rewardKey} onChange={(changeEvent) => setRewardKey(changeEvent.target.value)} placeholder="opening-night" /></Field><Field label="Display label"><input required className={inputClass} value={label} onChange={(changeEvent) => setLabel(changeEvent.target.value)} placeholder="Opening Night" /></Field></div>
      <Field label="Reason"><textarea required minLength={5} maxLength={600} className={textAreaClass} value={reason} onChange={(changeEvent) => setReason(changeEvent.target.value)} placeholder="What did this fan do to earn it?" /></Field>
      <ActionButton type="submit" disabled={!event || !canNominateNow || !recipient || busy !== null} loading={busy === "reward.nominate"} icon={<Eye className="size-4" />}>Preview nomination</ActionButton>
    </form> : null}
    <div className={canNominate ? "mt-5 border-t border-secondary pt-4" : ""}>{rewards.length === 0 ? <Empty>No reward activity for this event.</Empty> : <ul className="space-y-3">{rewards.map((reward) => <li key={`${reward.id}:${reward.recipientUserId}`} className="rounded-xl border border-secondary bg-secondary p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-primary">{reward.rewardLabel} → {reward.recipientName}{reward.recipientPublicSlug ? <span className="ml-1 font-normal text-tertiary">@{reward.recipientPublicSlug}</span> : null}</p><p className="mt-0.5 text-xs text-tertiary">{humanize(reward.rarity)} {humanize(reward.rewardType)} · nominated by {reward.nominatedByName}</p><p className="mt-1 text-xs text-quaternary">{reward.reason}</p></div><StatusPill status={reward.status} /></div>{canApprove && reward.status === "pending_approval" ? <div className="mt-3 flex gap-2"><ActionButton disabled={busy !== null || !canSecondApprove(currentStaffId, reward.nominatedById)} loading={busy === "reward.review"} icon={<CheckCircle2 className="size-4" />} onClick={() => mutate("reward.review", { rewardId: reward.id, decision: "approve", reason: "Second-person approval" }, "Reward approved and granted.")}>Approve</ActionButton><ActionButton variant="danger" disabled={busy !== null} onClick={() => mutate("reward.review", { rewardId: reward.id, decision: "reject", reason: "Rejected in control room" }, "Reward rejected.")}>Reject</ActionButton>{!canSecondApprove(currentStaffId, reward.nominatedById) ? <span className="self-center text-xs text-warning-primary">A different operator must approve.</span> : null}</div> : null}</li>)}</ul>}</div>
  </Panel>;
}

function SafetyPanel({ panelId, event, channelSlug, freeze, appeals, rewards, audit, permissions, isAdmin, busy, mutate }: { panelId: string; event: PassportEvent | null; channelSlug: string; freeze: PassportFreeze | null; appeals: PassportAppeal[]; rewards: PassportReward[]; audit: PassportAuditEntry[]; permissions: ReadonlySet<string>; isAdmin: boolean; busy: string | null; mutate: Mutate }) {
  const [reason, setReason] = useState(""); const [capabilities, setCapabilities] = useState(["polls", "scores", "moments", "rewards", "chat"]); const [auditQuery, setAuditQuery] = useState("");
  const allowedCapabilities = isAdmin || permissions.has("channel.freeze")
    ? ["polls", "scores", "moments", "rewards", "chat"]
    : permissions.has("chat.freeze")
      ? ["chat"]
      : [];
  const selectedCapabilities = capabilities.filter((capability) => allowedCapabilities.includes(capability));
  const canReviewAppeals = isAdmin;
  const canRevokeRewards = isAdmin || permissions.has("reward.revoke");
  const visibleAudit = audit.filter((entry) => `${entry.actorName} ${entry.actorEmail} ${entry.action} ${entry.targetType} ${entry.reason ?? ""}`.toLocaleLowerCase().includes(auditQuery.toLocaleLowerCase())).slice(0, 100);
  function toggleCapability(value: string) { setCapabilities((all) => all.includes(value) ? all.filter((item) => item !== value) : [...all, value]); }
  return <div id={panelId} role="tabpanel" className="grid items-start gap-4 xl:grid-cols-2"><div className="space-y-4">{allowedCapabilities.length > 0 ? <Panel icon={<Lock className="size-5" />} title="Emergency controls" description="Freeze only the capabilities assigned to your role. The reason and release are permanently audited.">{freeze ? <Message tone="warning" role="status">Frozen by {freeze.actorName}: {freeze.reason}</Message> : <form className="space-y-3" onSubmit={(formEvent) => { formEvent.preventDefault(); void mutate("event.freeze", { eventId: event?.id ?? null, channelSlug, active: true, capabilities: selectedCapabilities, reason }, "Selected controls frozen."); }}><fieldset><legend className="text-xs font-semibold text-tertiary">Freeze capabilities</legend><div className="mt-2 grid grid-cols-2 gap-2">{allowedCapabilities.map((item) => <label key={item} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-secondary bg-secondary px-3 text-sm text-secondary"><input type="checkbox" checked={selectedCapabilities.includes(item)} onChange={() => toggleCapability(item)} /> {humanize(item)}</label>)}</div></fieldset><Field label="Emergency reason"><textarea required minLength={5} maxLength={600} className={textAreaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><ActionButton type="submit" variant="danger" disabled={selectedCapabilities.length === 0 || busy !== null} loading={busy === "event.freeze"} icon={<Lock className="size-4" />}>Freeze controls</ActionButton></form>}</Panel> : null}{canReviewAppeals ? <Panel icon={<AlertTriangle className="size-5" />} title="Appeals" description="Every decision requires a reviewer note and remains in the audit record.">{appeals.filter((item) => item.status === "open" || item.status === "reviewing").length === 0 ? <Empty>No open appeals.</Empty> : <ul className="space-y-3">{appeals.filter((item) => item.status === "open" || item.status === "reviewing").map((appeal) => <AppealRow key={appeal.id} appeal={appeal} busy={busy} mutate={mutate} />)}</ul>}</Panel> : null}{canRevokeRewards ? <Panel icon={<RotateCcw className="size-5" />} title="Revocations" description="Revocation never deletes the original grant or its provenance.">{rewards.filter((item) => item.status === "approved").length === 0 ? <Empty>No active event rewards to revoke.</Empty> : <ul className="space-y-2">{rewards.filter((item) => item.status === "approved").map((reward) => <li key={reward.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-secondary bg-secondary p-3"><div><p className="text-sm font-semibold text-primary">{reward.rewardLabel} · {reward.recipientName}</p><p className="text-xs text-tertiary">Granted {formatAdminTime(reward.createdAt)}</p></div><ActionButton variant="danger" disabled={busy !== null} loading={busy === "reward.revoke"} onClick={() => { const why = window.prompt("Required revocation reason"); if (why?.trim()) void mutate("reward.revoke", { rewardId: reward.id, reason: why.trim() }, "Reward revoked; ledger history retained."); }}>Revoke</ActionButton></li>)}</ul>}</Panel> : null}</div><Panel icon={<ScrollText className="size-5" />} title="Action history" description="Up to 100 scoped actions, newest first."><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quaternary" /><span className="sr-only">Filter action history</span><input className={`${inputClass} mt-0 pl-9`} value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Search actor, action, target, or reason" /></label>{visibleAudit.length === 0 ? <div className="mt-4"><Empty>No matching audit events.</Empty></div> : <ol className="mt-4 max-h-[820px] space-y-2 overflow-y-auto pr-1">{visibleAudit.map((entry) => <li key={entry.id} className="rounded-xl border border-secondary bg-secondary p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-primary">{humanize(entry.action)}</p><time className="shrink-0 text-[11px] text-quaternary">{formatAdminTime(entry.createdAt)}</time></div><p className="mt-1 text-xs text-tertiary">{entry.actorName} · {humanize(entry.targetType)}{entry.targetId ? ` ${entry.targetId.slice(0, 8)}` : ""}</p>{entry.reason ? <p className="mt-1 text-xs text-quaternary">{entry.reason}</p> : null}</li>)}</ol>}</Panel></div>;
}

function PresenceCorrectionPanel({
  event,
  records,
  busy,
  mutate,
}: {
  event: PassportEvent | null;
  records: PassportPresenceRecord[];
  busy: string | null;
  mutate: Mutate;
}) {
  async function correct(record: PassportPresenceRecord) {
    if (!event) return;
    const decision = record.state === "rejected" || record.state === "revoked"
      ? "reinstate"
      : record.state === "verified"
        ? "revoke"
        : "reject";
    const actionLabel = decision === "reinstate" ? "reinstate" : decision;
    const reason = window.prompt(`Required reason to ${actionLabel} ${record.displayName}'s attendance`);
    if (!reason?.trim()) return;
    const destructive = decision !== "reinstate";
    if (destructive && !window.confirm(`${humanize(decision)} attendance for ${record.displayName}? Earned event credit and still-owned event cards will be corrected with an audit trail.`)) return;
    await mutate("presence.correct", {
      eventId: event.id,
      userId: record.userId,
      decision,
      reason: reason.trim(),
      idempotencyKey: crypto.randomUUID(),
    }, decision === "reinstate"
      ? `${record.displayName}'s attendance was reinstated.`
      : `${record.displayName}'s attendance was ${decision === "revoke" ? "revoked" : "rejected"}.`);
  }

  return <div className="mt-4"><Panel
    icon={<BadgeCheck className="size-5" />}
    title="Attendance corrections"
    description="Admin-only, audited corrections for false positives or successful appeals. Transferred rewards are blocked for manual review instead of being silently clawed back."
  >
    {!event ? <Empty>Select an event to review attendance.</Empty> : records.length === 0 ? <Empty>No attendance records for this event.</Empty> : <ul className="grid gap-3 lg:grid-cols-2">{records.map((record) => {
      const decision = record.state === "rejected" || record.state === "revoked" ? "reinstate" : record.state === "verified" ? "revoke" : "reject";
      return <li key={record.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-secondary bg-secondary p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-primary">{record.displayName}</p>{record.publicSlug ? <span className="text-xs text-tertiary">@{record.publicSlug}</span> : null}<StatusPill status={record.state} /></div>
          <p className="mt-1 text-xs text-tertiary">{Math.floor(record.watchSeconds / 60)}m {record.watchSeconds % 60}s verified activity · {record.heartbeatCount} heartbeat{record.heartbeatCount === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-[11px] text-quaternary">{record.claimedAt ? `Claimed ${formatAdminTime(record.claimedAt)}` : record.updatedAt ? `Updated ${formatAdminTime(record.updatedAt)}` : "No claim submitted"}</p>
        </div>
        <ActionButton
          variant={decision === "reinstate" ? "secondary" : "danger"}
          disabled={busy !== null}
          loading={busy === "presence.correct"}
          icon={decision === "reinstate" ? <RotateCcw className="size-4" /> : <AlertTriangle className="size-4" />}
          onClick={() => void correct(record)}
        >{humanize(decision)}</ActionButton>
      </li>;
    })}</ul>}
  </Panel></div>;
}

function AppealRow({ appeal, busy, mutate }: { appeal: PassportAppeal; busy: string | null; mutate: Mutate }) {
  const [resolution, setResolution] = useState("");
  return <li className="rounded-xl border border-secondary bg-secondary p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-primary">{appeal.userName} · {humanize(appeal.subjectType)}</p><p className="mt-1 text-xs leading-relaxed text-tertiary">{appeal.message}</p></div><StatusPill status={appeal.status} /></div><label className="mt-3 block text-xs font-semibold text-tertiary">Reviewer note<input className={inputClass} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Explain the decision" /></label><div className="mt-3 flex gap-2"><ActionButton disabled={!resolution.trim() || busy !== null} loading={busy === "appeal.review"} onClick={() => mutate("appeal.review", { appealId: appeal.id, decision: "approved", resolution }, "Appeal accepted for correction review; no asset was changed automatically.")}>Accept for correction</ActionButton><ActionButton variant="danger" disabled={!resolution.trim() || busy !== null} onClick={() => mutate("appeal.review", { appealId: appeal.id, decision: "denied", resolution }, "Appeal denied with reviewer note.")}>Deny</ActionButton></div></li>;
}

function FreezeBanner({ freeze, busy, canRelease, onUnfreeze }: { freeze: PassportFreeze; busy: string | null; canRelease: boolean; onUnfreeze: () => void }) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning_subtle bg-warning-primary p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-primary" /><div><p className="text-sm font-semibold text-primary">Controls frozen: {freeze.capabilities.map(humanize).join(", ")}</p><p className="mt-0.5 text-xs text-tertiary">{freeze.reason} · {freeze.actorName} · {formatAdminTime(freeze.createdAt)}</p></div></div><ActionButton variant="secondary" disabled={busy !== null || !canRelease} loading={busy === "event.freeze"} icon={<Unlock className="size-4" />} onClick={onUnfreeze}>{canRelease ? "Release freeze" : "Release requires authority"}</ActionButton></div>;
}

function Panel({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-secondary bg-primary p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-brand-secondary">{icon}</span><div><h3 className="font-semibold text-primary">{title}</h3>{description ? <p className="mt-0.5 text-sm leading-relaxed text-tertiary">{description}</p> : null}</div></div>{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-tertiary">{label}{hint ? <span className="ml-1 font-normal text-quaternary">({hint})</span> : null}{children}</label>;
}

function ActionButton({ children, variant = "primary", loading = false, disabled = false, icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; loading?: boolean; icon?: ReactNode }) {
  const styles = variant === "primary" ? "border-brand-solid bg-brand-solid text-white hover:bg-brand-solid_hover" : variant === "danger" ? "border-error-solid bg-error-solid text-white hover:opacity-90" : "border-secondary bg-primary text-secondary hover:text-primary";
  return <button {...props} disabled={disabled || loading} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${props.className ?? ""}`}>{loading ? <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" /> : icon}{loading ? "Working…" : children}</button>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-secondary bg-primary p-3 sm:p-4"><div className="flex items-center gap-2 text-xs font-semibold text-tertiary">{icon}{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums text-primary">{value}</p></div>;
}

function StatusPill({ status }: { status: string }) {
  const positive = ["active", "on duty", "live", "certified", "verified", "approved", "sealed", "published", "final"].includes(status);
  const warning = ["preview", "pending_approval", "unofficial", "open", "reviewing", "scheduled"].includes(status);
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${positive ? "bg-success-primary text-success-primary" : warning ? "bg-warning-primary text-warning-primary" : "bg-secondary text-tertiary"}`}>{humanize(status)}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-secondary bg-secondary p-4 text-center text-sm text-tertiary">{children}</p>;
}

function Message({ children, tone, role }: { children: ReactNode; tone: "error" | "success" | "warning"; role: "alert" | "status" }) {
  const styles = tone === "error" ? "border-error_subtle bg-error-primary" : tone === "success" ? "border-success_subtle bg-success-primary" : "border-warning_subtle bg-warning-primary";
  return <p role={role} className={`rounded-xl border p-3 text-sm text-primary ${styles}`}>{children}</p>;
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

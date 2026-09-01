import type { PassportAdminOverview as RawPassportAdminOverview, PassportActor } from "@/lib/passport/admin";
import type {
  PassportAdminOverview,
  PassportAppeal,
  PassportAssignment,
  PassportAuditEntry,
  PassportBudget,
  PassportEdition,
  PassportEligibleRecipient,
  PassportEvent,
  PassportFreeze,
  PassportMoment,
  PassportPoll,
  PassportPresenceRecord,
  PassportReward,
  PassportScoreRevision,
  PassportScoreboard,
  PassportShift,
  PassportStaffCandidate,
} from "@/components/admin/passport/types";

type Row = Record<string, unknown>;
type RawOverviewWithRecipients = RawPassportAdminOverview & {
  eligibleRecipients?: Row[];
  rewardRecipients?: Row[];
  presenceRecords?: Row[];
};

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function nullableText(value: unknown): string | null {
  const valueText = text(value).trim();
  return valueText || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const source = text(value);
  if (!source) return null;
  const date = new Date(source);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function staffCandidates(raw: RawPassportAdminOverview): PassportStaffCandidate[] {
  return raw.staffCandidates.map((candidate): PassportStaffCandidate => ({
    id: text(candidate.id),
    displayName: text(candidate.displayName ?? candidate.display_name ?? candidate.email, "Staff"),
    email: text(candidate.email),
    role: text(candidate.role) === "admin" ? "admin" : "member_manager",
  })).filter((candidate) => candidate.id);
}

function staffName(staff: PassportStaffCandidate[], id: unknown, fallback = "Staff"): string {
  const identifier = text(id);
  return staff.find((candidate) => candidate.id === identifier || candidate.email.toLocaleLowerCase() === identifier.toLocaleLowerCase())?.displayName ?? fallback;
}

function publicRecipient(value: unknown): PassportEligibleRecipient | null {
  const recipient = row(value);
  const id = text(recipient.id ?? recipient.user_id ?? recipient.userId);
  const publicSlug = nullableText(recipient.publicSlug ?? recipient.public_slug);
  const displayName = text(recipient.displayName ?? recipient.display_name, publicSlug ? `@${publicSlug}` : "Fan").trim();
  return id ? { id, displayName: displayName || "Fan", publicSlug } : null;
}

function recipientDirectory(raw: RawPassportAdminOverview): Map<string, PassportEligibleRecipient> {
  const extended = raw as RawOverviewWithRecipients;
  const values: unknown[] = [
    ...(Array.isArray(extended.rewardRecipients) ? extended.rewardRecipients : []),
    ...(Array.isArray(extended.eligibleRecipients) ? extended.eligibleRecipients : []),
  ];
  for (const nomination of raw.nominations) {
    const embedded = nomination.recipients ?? nomination.recipient_profiles ?? nomination.recipientProfiles;
    if (Array.isArray(embedded)) values.push(...embedded);
  }
  const directory = new Map<string, PassportEligibleRecipient>();
  for (const value of values) {
    const recipient = publicRecipient(value);
    if (recipient) directory.set(recipient.id, recipient);
  }
  return directory;
}

function eligibleRecipients(
  raw: RawPassportAdminOverview,
  selectedChannel: string,
  selectedEvent: string | null,
): PassportEligibleRecipient[] {
  if (!selectedEvent) return [];
  const candidates = (raw as RawOverviewWithRecipients).eligibleRecipients;
  if (!Array.isArray(candidates)) return [];
  const recipients = new Map<string, PassportEligibleRecipient>();
  for (const value of candidates) {
    const candidate = row(value);
    const eventId = nullableText(candidate.event_id ?? candidate.eventId);
    const channelSlug = nullableText(candidate.channel_slug ?? candidate.channelSlug);
    if (eventId && eventId !== selectedEvent) continue;
    if (channelSlug && selectedChannel && channelSlug !== selectedChannel) continue;
    const recipient = publicRecipient(candidate);
    if (recipient) recipients.set(recipient.id, recipient);
  }
  return [...recipients.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function presenceRecords(
  raw: RawPassportAdminOverview,
  selectedChannel: string,
  selectedEvent: string | null,
): PassportPresenceRecord[] {
  if (!selectedEvent) return [];
  const values = (raw as RawOverviewWithRecipients).presenceRecords;
  if (!Array.isArray(values)) return [];
  const records = new Map<string, PassportPresenceRecord>();
  for (const value of values) {
    const record = row(value);
    const eventId = nullableText(record.event_id ?? record.eventId);
    const channelSlug = nullableText(record.channel_slug ?? record.channelSlug);
    if (eventId && eventId !== selectedEvent) continue;
    if (channelSlug && selectedChannel && channelSlug !== selectedChannel) continue;
    const userId = text(record.user_id ?? record.userId);
    if (!userId) continue;
    const stateValue = text(record.state, "observed");
    const state = (["observed", "eligible", "verified", "rejected", "revoked"].includes(stateValue)
      ? stateValue : "observed") as PassportPresenceRecord["state"];
    records.set(userId, {
      userId,
      displayName: text(record.display_name ?? record.displayName, "Fan"),
      publicSlug: nullableText(record.public_slug ?? record.publicSlug),
      state,
      watchSeconds: numberValue(record.watch_seconds ?? record.watchSeconds),
      heartbeatCount: numberValue(record.heartbeat_count ?? record.heartbeatCount),
      claimedAt: iso(record.claimed_at ?? record.claimedAt),
      updatedAt: iso(record.updated_at ?? record.updatedAt),
    });
  }
  return [...records.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function assignments(raw: RawPassportAdminOverview, staff: PassportStaffCandidate[]): PassportAssignment[] {
  return raw.assignments.map((assignment): PassportAssignment => {
    const staffId = text(assignment.staff_user_id ?? assignment.staffUserId);
    const roles = stringArray(assignment.roles);
    const channelSlug = nullableText(assignment.channel_slug ?? assignment.channelSlug);
    const eventId = nullableText(assignment.event_id ?? assignment.eventId);
    const revokedAt = iso(assignment.revoked_at ?? assignment.revokedAt);
    const endsAt = iso(assignment.ends_at ?? assignment.endsAt);
    return {
      id: text(assignment.id),
      staffId,
      staffName: text(assignment.display_name ?? assignment.displayName, staffName(staff, staffId)),
      staffEmail: text(assignment.email, staff.find((candidate) => candidate.id === staffId)?.email ?? ""),
      role: roles[0] ?? text(assignment.role, "channel_lead"),
      scopeType: eventId ? "event" : channelSlug ? "channel" : "network",
      channelSlug,
      eventId,
      permissions: stringArray(assignment.permissions),
      startsAt: iso(assignment.starts_at ?? assignment.startsAt),
      endsAt,
      active: !revokedAt && (!endsAt || Date.parse(endsAt) > Date.now()),
    };
  }).filter((assignment) => assignment.id);
}

function shifts(raw: RawPassportAdminOverview, scopedAssignments: PassportAssignment[], staff: PassportStaffCandidate[]): PassportShift[] {
  return raw.activeShifts.map((shift): PassportShift => {
    const assignmentId = text(shift.assignment_id ?? shift.assignmentId);
    const assignment = scopedAssignments.find((candidate) => candidate.id === assignmentId);
    const staffId = text(shift.staff_user_id ?? shift.staffId ?? assignment?.staffId);
    return {
      id: text(shift.id),
      assignmentId,
      staffId,
      staffName: text(shift.display_name ?? shift.displayName, assignment?.staffName ?? staffName(staff, staffId)),
      role: stringArray(shift.roles)[0] ?? assignment?.role ?? "channel_lead",
      channelSlug: text(shift.channel_slug ?? shift.channelSlug ?? assignment?.channelSlug),
      eventId: nullableText(shift.event_id ?? shift.eventId ?? assignment?.eventId),
      startedAt: iso(shift.started_at ?? shift.startedAt) ?? new Date(0).toISOString(),
      endedAt: iso(shift.ended_at ?? shift.endedAt),
    };
  }).filter((shift) => shift.id && shift.assignmentId);
}

function controls(raw: RawPassportAdminOverview, nominations: Row[]): { budgets: PassportBudget[]; freezes: PassportFreeze[] } {
  const budgets: PassportBudget[] = [];
  const freezes: PassportFreeze[] = [];
  for (const control of raw.channelControls) {
    const channelSlug = text(control.channel_slug ?? control.channelSlug);
    if (!channelSlug) continue;
    const approved = nominations.filter((nomination) => text(nomination.channel_slug ?? nomination.channelSlug) === channelSlug && text(nomination.state) === "approved");
    const used = (rarity: string) => approved.reduce((total, nomination) => {
      const data = row(nomination.reward_data ?? nomination.rewardData);
      return text(data.rarity, "common") === rarity ? total + Math.max(1, numberValue(data.quantity, stringArray(nomination.user_ids).length || 1)) : total;
    }, 0);
    budgets.push({
      channelSlug,
      commonLimit: numberValue(control.common_budget ?? control.commonBudget, 10_000),
      commonUsed: numberValue(control.common_used ?? control.commonUsed, used("common")),
      rareLimit: numberValue(control.rare_budget ?? control.rareBudget, 250),
      rareUsed: numberValue(control.rare_used ?? control.rareUsed, used("rare")),
      historicLimit: numberValue(control.historic_budget ?? control.historicBudget, 0),
      historicUsed: numberValue(control.historic_used ?? control.historicUsed, used("historic")),
      legendaryLimit: numberValue(control.legendary_budget ?? control.legendaryBudget, 10),
      legendaryUsed: numberValue(control.legendary_used ?? control.legendaryUsed, used("legendary")),
    });
    const capabilityPairs = [
      ["polls", control.polls_frozen ?? control.pollsFrozen],
      ["scores", control.scores_frozen ?? control.scoresFrozen],
      ["moments", control.moments_frozen ?? control.momentsFrozen],
      ["rewards", control.rewards_frozen ?? control.rewardsFrozen],
      ["chat", control.chat_frozen ?? control.chatFrozen],
    ] as const;
    const capabilities = capabilityPairs.filter(([, frozen]) => booleanValue(frozen)).map(([name]) => name);
    if (capabilities.length > 0) {
      const updatedAt = iso(control.updated_at ?? control.updatedAt) ?? new Date().toISOString();
      freezes.push({
        id: `${channelSlug}:${updatedAt}`,
        channelSlug,
        eventId: nullableText(control.event_id ?? control.eventId),
        capabilities,
        reason: text(control.reason, "Emergency hold"),
        active: true,
        actorName: text(control.updated_by ?? control.updatedBy, "Staff"),
        createdAt: updatedAt,
      });
    }
  }
  return { budgets, freezes };
}

function events(raw: RawPassportAdminOverview, freezes: PassportFreeze[]): PassportEvent[] {
  return raw.events.map((event): PassportEvent => {
    const id = text(event.id);
    const channelSlug = text(event.channel_slug ?? event.channelSlug);
    const sourceState = text(event.state, "draft");
    const status = (["draft", "scheduled", "live", "ended", "certified", "cancelled", "frozen"].includes(sourceState) ? sourceState : "draft") as PassportEvent["status"];
    return {
      id,
      channelSlug,
      title: text(event.title, "Untitled event"),
      description: nullableText(event.description),
      playbackRef: nullableText(event.external_ref ?? event.externalRef),
      status,
      scheduledStartAt: iso(event.starts_at ?? event.startsAt),
      scheduledEndAt: iso(event.ends_at ?? event.endsAt),
      startedAt: status === "live" || status === "ended" || status === "certified" ? iso(event.starts_at ?? event.startsAt) : null,
      endedAt: status === "ended" || status === "certified" ? iso(event.ends_at ?? event.endsAt) : null,
      minimumWatchSeconds: numberValue(event.minimum_watch_seconds ?? event.minimumWatchSeconds, 120),
      attendanceGraceSeconds: numberValue(event.attendance_grace_seconds ?? event.attendanceGraceSeconds, 300),
      heartbeatIntervalSeconds: numberValue(event.heartbeat_interval_seconds ?? event.heartbeatIntervalSeconds, 30),
      freeze: freezes.find((freeze) => freeze.channelSlug === channelSlug && (!freeze.eventId || freeze.eventId === id)) ?? null,
    };
  }).filter((event) => event.id);
}

function polls(raw: RawPassportAdminOverview, staff: PassportStaffCandidate[]): PassportPoll[] {
  return raw.polls.map((poll): PassportPoll => {
    const options = Array.isArray(poll.options) ? poll.options.map((optionValue) => {
      const option = row(optionValue);
      return { id: text(option.id), label: text(option.label), votes: numberValue(option.votes) };
    }).filter((option) => option.id && option.label) : [];
    const lifecycle = text(poll.lifecycle_state ?? poll.lifecycleState, text(poll.status) === "open" ? "live" : "draft");
    const status = (["draft", "preview", "live", "locked", "certified"].includes(lifecycle) ? lifecycle : "draft") as PassportPoll["status"];
    const createdBy = text(poll.created_by ?? poll.createdBy);
    const certifiedBy = nullableText(poll.certified_by ?? poll.certifiedBy);
    return {
      id: text(poll.id),
      eventId: nullableText(poll.passport_event_id ?? poll.eventId),
      channelSlug: text(poll.channel_slug ?? poll.channelSlug),
      question: text(poll.question),
      kind: (["standard", "prediction", "trivia", "mvp"].includes(text(poll.kind)) ? text(poll.kind) : "standard") as PassportPoll["kind"],
      options,
      status,
      audience: (["everyone", "signed_in", "live_attendees", "members"].includes(text(poll.passport_audience ?? poll.audience)) ? text(poll.passport_audience ?? poll.audience) : "signed_in") as PassportPoll["audience"],
      createdByName: staffName(staff, createdBy),
      certifiedByName: certifiedBy ? staffName(staff, certifiedBy) : null,
      winnerOptionId: nullableText(poll.winner_option_id ?? poll.winnerOptionId),
      createdAt: iso(poll.created_at ?? poll.createdAt) ?? new Date(0).toISOString(),
    };
  }).filter((poll) => poll.id);
}

function scores(raw: RawPassportAdminOverview, staff: PassportStaffCandidate[]): PassportScoreboard[] {
  return raw.scores.map((score): PassportScoreboard => {
    const state = row(score.state);
    const teams = Array.isArray(state.teams) ? state.teams.map(row) : [];
    const revisionsRaw = Array.isArray(score.revisions) ? score.revisions : [];
    const revisions = revisionsRaw.map((revisionValue): PassportScoreRevision => {
      const revision = row(revisionValue);
      const nextState = row(revision.next_state ?? revision.nextState);
      const revisionTeams = Array.isArray(nextState.teams) ? nextState.teams.map(row) : [];
      return {
        id: text(revision.id ?? revision.revision),
        homeScore: numberValue(revisionTeams[0]?.score),
        awayScore: numberValue(revisionTeams[1]?.score),
        reason: text(revision.reason),
        actorName: staffName(staff, revision.actor_id ?? revision.actorId),
        verifiedByName: nullableText(revision.verified_by ?? revision.verifiedBy),
        createdAt: iso(revision.created_at ?? revision.createdAt) ?? new Date(0).toISOString(),
      };
    });
    const eventId = text(score.event_id ?? score.eventId);
    const serviceStatus = text(score.status, "unofficial");
    const status: PassportScoreboard["status"] = serviceStatus === "certified" ? "verified" : "unofficial";
    return {
      id: eventId,
      eventId,
      title: text(state.title, `${text(teams[0]?.name, "Home")} vs ${text(teams[1]?.name, "Away")}`),
      homeName: text(teams[0]?.name, "Home"),
      awayName: text(teams[1]?.name, "Away"),
      homeScore: numberValue(teams[0]?.score),
      awayScore: numberValue(teams[1]?.score),
      status,
      lastRevisionId: nullableText(score.revision),
      verifiedByName: nullableText(score.certified_by ?? score.certifiedBy),
      revisions,
    };
  }).filter((score) => score.eventId);
}

function editions(raw: RawPassportAdminOverview): Map<string, PassportEdition> {
  return new Map(raw.editions.map((edition) => {
    const momentId = text(edition.moment_id ?? edition.momentId);
    const state = text(edition.state, "draft");
    const normalized: PassportEdition = {
      id: text(edition.id),
      name: text(edition.name, "Moment edition"),
      artworkUrl: nullableText(edition.artwork_url ?? edition.artworkUrl),
      rarity: (["common", "rare", "historic", "legendary"].includes(text(edition.rarity)) ? text(edition.rarity) : "common") as PassportEdition["rarity"],
      variant: text(edition.variant, "base"),
      signedBy: nullableText(edition.signed_by ?? edition.signedBy ?? row(edition.metadata).signedBy),
      accountBound: booleanValue(edition.account_bound ?? edition.accountBound ?? true),
      giftable: booleanValue(edition.giftable),
      tradeable: booleanValue(edition.tradeable),
      craftValue: numberValue(edition.craft_value ?? edition.craftValue),
      status: state === "sealed" ? "sealed" : state === "published" ? "open" : "draft",
      maxSupply: edition.max_supply === null || edition.maxSupply === null ? null : numberValue(edition.max_supply ?? edition.maxSupply),
      editionSize: edition.edition_size === null || edition.editionSize === null ? null : numberValue(edition.edition_size ?? edition.editionSize),
      issuedCount: numberValue(edition.issued_count ?? edition.issuedCount),
      sealedAt: iso(edition.sealed_at ?? edition.sealedAt),
    };
    return [momentId, normalized];
  }).filter(([momentId]) => Boolean(momentId)) as Array<[string, PassportEdition]>);
}

function moments(raw: RawPassportAdminOverview, editionByMoment: Map<string, PassportEdition>, staff: PassportStaffCandidate[]): PassportMoment[] {
  return raw.moments.map((moment): PassportMoment => {
    const state = text(moment.state, "draft");
    const metadata = row(moment.metadata);
    const id = text(moment.id);
    return {
      id,
      eventId: text(moment.event_id ?? moment.eventId),
      channelSlug: text(moment.channel_slug ?? moment.channelSlug),
      title: text(moment.title, "Untitled moment"),
      description: nullableText(moment.description),
      rarity: (["common", "rare", "historic", "legendary"].includes(text(moment.rarity)) ? text(moment.rarity) : "common") as PassportMoment["rarity"],
      timestampSeconds: numberValue(moment.offset_seconds ?? moment.offsetSeconds),
      windowBeforeSeconds: numberValue(moment.eligibility_before_seconds ?? moment.eligibilityBeforeSeconds, 300),
      windowAfterSeconds: numberValue(moment.eligibility_after_seconds ?? moment.eligibilityAfterSeconds, 180),
      watchThresholdPercent: numberValue(metadata.watchThresholdPercent, 50),
      status: (state === "revoked" ? "cancelled" : state) as PassportMoment["status"],
      estimatedRecipients: moment.eligible_count !== undefined ? numberValue(moment.eligible_count) : metadata.eligibleCount !== undefined ? numberValue(metadata.eligibleCount) : null,
      createdByName: staffName(staff, moment.created_by ?? moment.createdBy),
      edition: editionByMoment.get(id) ?? null,
      createdAt: iso(moment.created_at ?? moment.createdAt) ?? new Date(0).toISOString(),
    };
  }).filter((moment) => moment.id);
}

function rewards(
  raw: RawPassportAdminOverview,
  staff: PassportStaffCandidate[],
  recipients: Map<string, PassportEligibleRecipient>,
): PassportReward[] {
  return raw.nominations.flatMap((nomination): PassportReward[] => {
    const data = row(nomination.reward_data ?? nomination.rewardData);
    const userIds = stringArray(nomination.user_ids ?? nomination.userIds);
    const nominatedBy = text(nomination.nominated_by ?? nomination.nominatedBy);
    const reviewedBy = nullableText(nomination.reviewed_by ?? nomination.reviewedBy);
    const state = text(nomination.state, "pending");
    const status: PassportReward["status"] = state === "approved" ? "approved" : state === "denied" ? "rejected" : state === "cancelled" || state === "revoked" ? "revoked" : "pending_approval";
    const rewardType = text(nomination.reward_type ?? nomination.rewardType, "achievement") as PassportReward["rewardType"];
    const code = text(nomination.reward_code ?? nomination.rewardCode, rewardType);
    return (userIds.length ? userIds : [""]).map((userId) => {
      const recipient = recipients.get(userId);
      return ({
      id: text(nomination.id),
      channelSlug: text(nomination.channel_slug ?? nomination.channelSlug),
      eventId: nullableText(nomination.event_id ?? nomination.eventId),
      recipientUserId: userId,
      recipientName: recipient?.displayName ?? text(data.recipientName, "Fan"),
      recipientPublicSlug: recipient?.publicSlug ?? null,
      rewardType,
      rewardKey: code,
      rewardLabel: text(data.label, code),
      rarity: (["common", "rare", "historic", "legendary"].includes(text(data.rarity)) ? text(data.rarity) : "common") as PassportReward["rarity"],
      quantity: numberValue(data.quantity, 1),
      reason: text(nomination.reason),
      status,
      nominatedById: nominatedBy,
      nominatedByName: staffName(staff, nominatedBy),
      approvedByName: reviewedBy ? staffName(staff, reviewedBy) : null,
      createdAt: iso(nomination.created_at ?? nomination.createdAt) ?? new Date(0).toISOString(),
      });
    });
  });
}

function appeals(raw: RawPassportAdminOverview, selectedChannel: string, staff: PassportStaffCandidate[], include: boolean): PassportAppeal[] {
  if (!include) return [];
  return raw.appeals.map((appeal): PassportAppeal => {
    const reviewedBy = nullableText(appeal.reviewed_by ?? appeal.reviewedBy);
    const state = text(appeal.state, "open");
    return {
      id: text(appeal.id),
      channelSlug: text(appeal.channel_slug ?? appeal.channelSlug, selectedChannel),
      userId: text(appeal.user_id ?? appeal.userId),
      userName: text(appeal.display_name ?? appeal.displayName ?? appeal.email, "Fan"),
      subjectType: (["reward", "card", "achievement", "moderation"].includes(text(appeal.subject_type ?? appeal.subjectType)) ? text(appeal.subject_type ?? appeal.subjectType) : "moderation") as PassportAppeal["subjectType"],
      subjectId: nullableText(appeal.subject_id ?? appeal.subjectId),
      message: text(appeal.reason ?? appeal.message),
      status: state === "under_review" ? "reviewing" : (["open", "approved", "denied"].includes(state) ? state : "reviewing") as PassportAppeal["status"],
      reviewerName: reviewedBy ? staffName(staff, reviewedBy) : null,
      resolution: nullableText(appeal.response ?? appeal.resolution),
      createdAt: iso(appeal.created_at ?? appeal.createdAt) ?? new Date(0).toISOString(),
    };
  }).filter((appeal) => appeal.id);
}

function scopedAudit(raw: RawPassportAdminOverview, selectedChannel: string, actor: PassportActor): PassportAuditEntry[] {
  const allowedIds = new Set<string>([selectedChannel]);
  for (const collection of [raw.assignments, raw.activeShifts, raw.events, raw.scores, raw.polls, raw.moments, raw.editions, raw.nominations]) {
    for (const item of collection) for (const key of ["id", "event_id", "assignment_id", "channel_slug"]) {
      const identifier = text(item[key]);
      if (identifier) allowedIds.add(identifier);
    }
  }
  return raw.audit.filter((entry) => {
    if (actor.role !== "admin") return text(entry.actor_id ?? entry.actorId) === actor.id;
    const scopeId = nullableText(entry.scope_id ?? entry.scopeId);
    return !selectedChannel || scopeId === null || allowedIds.has(scopeId);
  }).map((entry): PassportAuditEntry => {
    const actorId = text(entry.actor_id ?? entry.actorId);
    return {
      id: text(entry.id),
      channelSlug: selectedChannel || null,
      eventId: text(entry.scope_type ?? entry.scopeType) === "event" ? nullableText(entry.scope_id ?? entry.scopeId) : null,
      actorName: actorId,
      actorEmail: text(entry.actor_email ?? entry.actorEmail),
      action: text(entry.action),
      targetType: text(entry.scope_type ?? entry.scopeType, "record"),
      targetId: nullableText(entry.scope_id ?? entry.scopeId),
      reason: nullableText(entry.reason),
      createdAt: iso(entry.created_at ?? entry.createdAt) ?? new Date(0).toISOString(),
    };
  });
}

export function normalizePassportAdminOverview(
  raw: RawPassportAdminOverview,
  actor: PassportActor,
  selectedChannel: string,
  selectedEvent: string | null = null,
): PassportAdminOverview {
  const staff = staffCandidates(raw);
  const recipients = recipientDirectory(raw);
  const scopedAssignments = assignments(raw, staff);
  const normalizedShifts = shifts(raw, scopedAssignments, staff);
  const normalizedControls = controls(raw, raw.nominations);
  const normalizedEvents = events(raw, normalizedControls.freezes);
  return {
    effectivePermissions: stringArray(raw.effectivePermissions),
    dutyPermissions: stringArray(raw.dutyPermissions),
    onDuty: Boolean(raw.onDuty),
    currentStaff: {
      id: actor.id,
      displayName: staffName(staff, actor.id, actor.email),
      email: actor.email,
      role: actor.role,
    },
    staff: actor.role === "admin" ? staff : staff.filter((candidate) => candidate.id === actor.id),
    eligibleRecipients: eligibleRecipients(raw, selectedChannel, selectedEvent),
    presenceRecords: actor.role === "admin" ? presenceRecords(raw, selectedChannel, selectedEvent) : [],
    assignments: actor.role === "admin" ? scopedAssignments : scopedAssignments.map((assignment) => ({ ...assignment, staffEmail: "" })),
    activeShifts: normalizedShifts,
    events: normalizedEvents,
    polls: polls(raw, staff),
    scoreboards: scores(raw, staff),
    moments: moments(raw, editions(raw), staff),
    rewards: rewards(raw, staff, recipients),
    budgets: normalizedControls.budgets,
    freezes: normalizedControls.freezes,
    appeals: appeals(raw, selectedChannel, staff, actor.role === "admin"),
    audit: scopedAudit(raw, selectedChannel, actor),
  };
}

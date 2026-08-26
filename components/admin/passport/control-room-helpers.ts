import type { PassportAdminOverview, PassportEvent, PassportFreeze } from "./types";

export const PASSPORT_ROLE_OPTIONS = [
  { value: "channel_lead", label: "Channel lead" },
  { value: "live_producer", label: "Live producer" },
  { value: "chat_guardian", label: "Chat guardian" },
  { value: "poll_host", label: "Poll host" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "moment_archivist", label: "Moment archivist" },
  { value: "reward_curator", label: "Reward curator" },
  { value: "judge", label: "Judge / verifier" },
] as const;

export const PASSPORT_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  channel_lead: ["poll.create", "poll.publish", "poll.lock", "poll.certify", "score.revise", "score.certify", "moment.create", "moment.publish", "edition.seal", "reward.nominate", "reward.approve", "reward.revoke", "event.manage", "channel.freeze"],
  live_producer: ["event.manage", "poll.create", "poll.publish", "poll.lock", "score.revise", "moment.create", "moment.publish"],
  chat_guardian: ["chat.freeze"],
  poll_host: ["poll.create", "poll.publish", "poll.lock"],
  scorekeeper: ["score.revise"],
  moment_archivist: ["moment.create", "moment.publish"],
  reward_curator: ["reward.nominate", "reward.revoke"],
  judge: ["poll.certify", "score.certify", "edition.seal", "reward.approve"],
};

export const EMPTY_PASSPORT_OVERVIEW: PassportAdminOverview = {
  currentStaff: { id: "", displayName: "", email: "" },
  effectivePermissions: [],
  dutyPermissions: [],
  onDuty: false,
  staff: [],
  eligibleRecipients: [],
  presenceRecords: [],
  assignments: [],
  activeShifts: [],
  events: [],
  polls: [],
  scoreboards: [],
  moments: [],
  rewards: [],
  budgets: [],
  freezes: [],
  appeals: [],
  audit: [],
};

export function activeEvent(events: PassportEvent[], selectedId: string): PassportEvent | null {
  return events.find((event) => event.id === selectedId) ?? events.find((event) => event.status === "live") ?? events[0] ?? null;
}

export function activeFreeze(
  freezes: PassportFreeze[],
  channelSlug: string,
  eventId: string | null,
): PassportFreeze | null {
  return freezes.find((freeze) => freeze.active && freeze.channelSlug === channelSlug && (freeze.eventId === null || freeze.eventId === eventId)) ?? null;
}

export function formatAdminTime(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not set";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMomentTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function canSecondApprove(actorId: string, nominatedById: string): boolean {
  return Boolean(actorId) && actorId !== nominatedById;
}

export function budgetPercent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

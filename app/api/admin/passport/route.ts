import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-api";
import {
  PASSPORT_PERMISSIONS,
  appendScoreRevision,
  cancelPassportMoment,
  certifyScore,
  createPassportEvent,
  createPassportMoment,
  createPassportPoll,
  correctPassportPresence,
  endModeratorShift,
  freezePassportEvent,
  getPassportAdminOverview,
  nominatePassportReward,
  previewPassportMoment,
  publishPassportMoment,
  reviewPassportAppeal,
  reviewPassportNomination,
  revokeModeratorAssignment,
  revokePassportNomination,
  sealCardEdition,
  startModeratorShift,
  transitionPassportPoll,
  updatePassportEvent,
  upsertModeratorAssignment,
  type PassportActor,
  type PassportModeratorRole,
  type PassportPermission,
  type PassportReward,
} from "@/lib/passport/admin";
import { PassportError } from "@/lib/passport/policy";
import { PASSPORT_ROLE_PERMISSIONS } from "@/components/admin/passport/control-room-helpers";
import { PassportAdminActionSchema, PassportAdminQuerySchema, type PassportAdminAction } from "./contracts";
import { normalizePassportAdminOverview } from "./normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function actorFromStaff(staff: Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>): PassportActor {
  return { id: staff.id, email: staff.email, role: staff.role, memberSlug: staff.memberSlug };
}

function enforceChannelScope(actor: PassportActor, requested: string | null | undefined): string | undefined {
  if (actor.role === "admin") return requested || undefined;
  if (!actor.memberSlug) throw new PassportError("forbidden", 403, "staff_channel_scope_missing");
  if (requested && requested !== actor.memberSlug) throw new PassportError("forbidden", 403, "channel_out_of_scope");
  return actor.memberSlug;
}

function safeCode(value: string, fallback = "core"): string {
  const normalized = value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52);
  return normalized || fallback;
}

function permissionsForRole(role: PassportModeratorRole): PassportPermission[] {
  const allowed = new Set<string>(PASSPORT_PERMISSIONS);
  return (PASSPORT_ROLE_PERMISSIONS[role] ?? []).filter((permission): permission is PassportPermission => allowed.has(permission));
}

function jsonError(error: unknown): NextResponse {
  if (error instanceof PassportError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return NextResponse.json({ error: "That code or scoped record already exists." }, { status: 409 });
  }
  console.error("Passport admin route failed", error);
  return NextResponse.json({ error: "passport_control_room_failed" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const actor = actorFromStaff(auth);
  try {
    const url = new URL(request.url);
    const parsed = PassportAdminQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_query" }, { status: 400 });
    }
    const channelSlug = enforceChannelScope(actor, parsed.data.channel);
    const raw = await getPassportAdminOverview(actor, {
      channelSlug,
      eventId: parsed.data.event,
      limit: parsed.data.auditLimit,
    });
    return NextResponse.json({
      overview: normalizePassportAdminOverview(raw, actor, channelSlug ?? "", parsed.data.event ?? null),
    }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const actor = actorFromStaff(auth);
  const parsed = PassportAdminActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_payload" }, { status: 400 });
  }
  const input = parsed.data;
  try {
    const channelSlug = enforceChannelScope(actor, input.channelSlug);
    if (!channelSlug) throw new PassportError("invalid_input", 400, "channel_required");
    const result = await dispatch(actor, { ...input, channelSlug });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return jsonError(error);
  }
}

async function scopedMoment(
  actor: PassportActor,
  input: { channelSlug: string; eventId?: string | null; momentId: string },
) {
  const overview = await getPassportAdminOverview(actor, {
    channelSlug: input.channelSlug,
    eventId: input.eventId ?? undefined,
    limit: 50,
  });
  const moment = overview.moments.find((candidate) => String(candidate.id) === input.momentId);
  if (!moment) throw new PassportError("not_found", 404, "moment_not_found_in_scope");
  return moment;
}

async function dispatch(actor: PassportActor, input: PassportAdminAction): Promise<unknown> {
  switch (input.action) {
    case "assignment.upsert": {
      const role = input.role as PassportModeratorRole;
      return upsertModeratorAssignment(actor, {
        id: input.assignmentId,
        staffUserId: input.staffId,
        networkSlug: "core",
        channelSlug: input.scopeType === "network" ? null : input.channelSlug,
        eventId: input.scopeType === "event" ? input.eventId : null,
        roles: [role],
        // Server-owned role bundles prevent clients from escalating the list.
        permissions: permissionsForRole(role),
        startsAt: new Date().toISOString(),
        endsAt: input.endsAt,
        reason: `Assigned ${role} in the Passport control room`,
      });
    }
    case "assignment.revoke":
      return revokeModeratorAssignment(actor, { assignmentId: input.assignmentId, reason: input.reason });
    case "shift.start":
      return startModeratorShift(actor, { assignmentId: input.assignmentId });
    case "shift.end":
      return endModeratorShift(actor, { shiftId: input.shiftId, reason: "Ended from the control room" });
    case "event.create": {
      const startsAt = input.scheduledStartAt ?? new Date().toISOString();
      return createPassportEvent(actor, {
        code: `${safeCode(input.channelSlug)}-${safeCode(input.title, "event")}-${Date.now().toString(36)}`,
        networkSlug: "core",
        channelSlug: input.channelSlug,
        title: input.title,
        description: input.description,
        externalRef: input.externalRef,
        startsAt,
        endsAt: input.scheduledEndAt,
        minimumWatchSeconds: input.minimumWatchSeconds,
        attendanceGraceSeconds: input.attendanceGraceSeconds,
        heartbeatIntervalSeconds: input.heartbeatIntervalSeconds,
      });
    }
    case "event.update": {
      const patch: Parameters<typeof updatePassportEvent>[1]["patch"] = {};
      if (input.title !== undefined) patch.title = input.title;
      if (Object.prototype.hasOwnProperty.call(input, "description")) patch.description = input.description;
      if (Object.prototype.hasOwnProperty.call(input, "externalRef")) patch.externalRef = input.externalRef;
      if (input.status !== undefined) patch.state = input.status;
      if (input.scheduledStartAt) patch.startsAt = input.scheduledStartAt;
      if (Object.prototype.hasOwnProperty.call(input, "scheduledEndAt")) patch.endsAt = input.scheduledEndAt;
      if (input.minimumWatchSeconds !== undefined) patch.minimumWatchSeconds = input.minimumWatchSeconds;
      if (input.attendanceGraceSeconds !== undefined) patch.attendanceGraceSeconds = input.attendanceGraceSeconds;
      if (input.heartbeatIntervalSeconds !== undefined) patch.heartbeatIntervalSeconds = input.heartbeatIntervalSeconds;
      return updatePassportEvent(actor, {
        eventId: input.eventId,
        patch,
        reason: input.reason ?? (input.status ? `Event moved to ${input.status}` : "Event details updated"),
      });
    }
    case "event.freeze": {
      const requested = new Set(input.capabilities ?? ["polls", "scores", "moments", "rewards", "chat"]);
      const freezeAll = requested.has("all");
      const targets = (["polls", "scores", "moments", "rewards", "chat"] as const).filter((target) => freezeAll || requested.has(target));
      return freezePassportEvent(actor, {
        channelSlug: input.channelSlug,
        eventId: input.eventId,
        targets,
        frozen: input.active,
        reason: input.reason,
      });
    }
    case "poll.create":
      return createPassportPoll(actor, {
        eventId: input.eventId!,
        channelSlug: input.channelSlug,
        question: input.question,
        options: input.options,
        kind: input.kind,
        audience: input.audience,
        resultsVisibility: input.kind === "prediction" || input.kind === "trivia" ? "after_close" : "after_vote",
      });
    case "poll.transition": {
      const transitionInput = {
        pollId: input.pollId,
        state: input.status,
        winnerOptionId: input.winnerOptionId,
        reason: input.reason ?? `Poll moved to ${input.status}`,
      };
      return transitionPassportPoll(actor, transitionInput);
    }
    case "score.revise":
      return appendScoreRevision(actor, {
        eventId: input.eventId!,
        state: {
          title: input.title,
          teams: [
            { key: "home", name: input.homeName, score: input.homeScore },
            { key: "away", name: input.awayName, score: input.awayScore },
          ],
          clock: null,
          period: null,
        },
        reason: input.reason,
      });
    case "score.certify":
      return certifyScore(actor, {
        eventId: input.scoreboardId,
        revision: input.revisionId,
        reason: input.reason ?? "Current scoreboard verified",
      });
    case "moment.create": {
      const qualificationSeconds = input.windowBeforeSeconds + input.windowAfterSeconds;
      return createPassportMoment(actor, {
        eventId: input.eventId!,
        code: `${safeCode(input.title, "moment")}-${Date.now().toString(36)}`,
        title: input.title,
        description: input.description,
        offsetSeconds: input.timestampSeconds,
        eligibilityBeforeSeconds: input.windowBeforeSeconds,
        eligibilityAfterSeconds: input.windowAfterSeconds,
        minimumPresenceSeconds: Math.max(1, Math.round(qualificationSeconds * input.watchThresholdPercent / 100)),
        rarity: input.rarity,
        metadata: { watchThresholdPercent: input.watchThresholdPercent },
      });
    }
    case "moment.preview": {
      await scopedMoment(actor, input);
      return previewPassportMoment(actor, { momentId: input.momentId });
    }
    case "moment.publish": {
      const moment = await scopedMoment(actor, input);
      const usesCustomCollectionPolicy = !input.accountBound || input.giftable || input.tradeable || input.craftValue > 0;
      if (actor.role !== "admin" && usesCustomCollectionPolicy) {
        throw new PassportError("forbidden", 403, "collection_policy_requires_admin");
      }
      const momentTitle = String(moment.title ?? "Official moment");
      const edition = {
        code: `${safeCode(input.channelSlug)}-${safeCode(momentTitle, "moment")}-${input.momentId.slice(0, 8)}`,
        name: momentTitle,
        description: String(moment.description ?? momentTitle),
        variant: input.variant,
        signedBy: input.signedBy ?? undefined,
        artworkUrl: input.artworkUrl ?? null,
        maxSupply: input.maxSupply ?? null,
        accountBound: actor.role === "admin" ? input.accountBound : true,
        giftable: actor.role === "admin" ? input.giftable : false,
        tradeable: actor.role === "admin" ? input.tradeable : false,
        craftValue: actor.role === "admin" ? input.craftValue : 0,
      };
      return publishPassportMoment(actor, {
        momentId: input.momentId,
        reason: "Published from the Passport control room",
        edition,
      });
    }
    case "moment.cancel":
      return cancelPassportMoment(actor, { momentId: input.momentId, reason: input.reason });
    case "edition.seal":
      return sealCardEdition(actor, { editionId: input.editionId, reason: "Edition sealed from the control room" });
    case "reward.nominate": {
      const reward: PassportReward & { label: string; rarity: string; quantity: number } = {
        type: input.rewardType,
        code: input.rewardType === "xp" || input.rewardType === "sparks" ? undefined : input.rewardKey,
        amount: input.rewardType === "xp" || input.rewardType === "sparks" ? input.quantity : undefined,
        label: input.rewardLabel,
        rarity: input.rarity,
        quantity: input.quantity,
      };
      return nominatePassportReward(actor, {
        eventId: input.eventId,
        channelSlug: input.channelSlug,
        reward,
        userIds: [input.recipientUserId],
        reason: input.reason,
      });
    }
    case "presence.correct":
      return correctPassportPresence(actor, {
        eventId: input.eventId,
        userId: input.userId,
        decision: input.decision,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
    case "reward.review":
      return reviewPassportNomination(actor, {
        nominationId: input.rewardId,
        approved: input.decision === "approve",
        reason: input.reason,
      });
    case "reward.revoke": {
      return revokePassportNomination(actor, {
        nominationId: input.rewardId,
        reason: input.reason,
        idempotencyKey: randomUUID(),
      });
    }
    case "appeal.review":
      if (actor.role !== "admin") throw new PassportError("forbidden", 403, "appeals_are_not_channel_scoped_yet");
      return reviewPassportAppeal(actor, {
        appealId: input.appealId,
        state: input.decision,
        response: input.resolution,
      });
  }
}

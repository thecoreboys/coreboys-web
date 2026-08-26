import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listWatchFeedback, setWatchFeedback } from "@/lib/watch/feedback";
import {
  listWorkspacePreferences,
  upsertWorkspacePreference,
} from "@/lib/workspace-preferences";
import {
  entitlementDecision,
  getAccountSubscriptionState,
} from "@/lib/subscriptions/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ItemId = z.string().trim().min(1).max(240);
const QueueId = z.string().trim().min(1).max(80);
const Timestamp = z.string().datetime().catch(() => new Date(0).toISOString());
const FeedbackTombstones = z.record(ItemId, Timestamp).default({});
const QueueTombstones = z.record(QueueId, Timestamp).default({});
const FeedbackEntry = z.object({
  value: z.enum(["like", "dislike", "not_interested"]),
  updatedAt: Timestamp,
});
const Queue = z.object({
  id: QueueId,
  name: z.string().trim().min(1).max(50),
  itemIds: z.array(ItemId).max(120),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
const DiscoveryState = z.object({
  version: z.literal(1).default(1),
  feedback: z.record(ItemId, FeedbackEntry).default({}),
  feedbackTombstones: FeedbackTombstones,
  queues: z.array(Queue).max(20).default([]),
  queueTombstones: QueueTombstones,
  rowOrder: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  rowOrderUpdatedAt: z.string().datetime().nullable().default(null),
});
const MergeBody = z.object({ state: DiscoveryState });

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

async function queuesAllowed(userId: string, request: Request) {
  try {
    const state = await getAccountSubscriptionState({
      userId,
      requestHostname: new URL(request.url).hostname,
    });
    return entitlementDecision(state, "queue.templates").allowed;
  } catch {
    // Subscription state is authoritative. If it cannot be resolved, fail
    // closed for the paid queue utility while leaving free discovery state
    // available below.
    return false;
  }
}

function homePayload(rows: Awaited<ReturnType<typeof listWorkspacePreferences>>) {
  return rows.find((row) => row.name === "home")?.payload as
    | {
        rowOrder?: unknown;
        rowOrderUpdatedAt?: unknown;
        feedbackTombstones?: unknown;
        queueTombstones?: unknown;
      }
    | undefined;
}

async function readState(userId: string, allowQueues: boolean) {
  const [feedbackRows, queueRows, homeRows] = await Promise.all([
    listWatchFeedback(userId),
    allowQueues ? listWorkspacePreferences(userId, "watch-queue") : Promise.resolve([]),
    listWorkspacePreferences(userId, "watch-discovery"),
  ]);
  const feedback: Record<string, { value: "like" | "dislike" | "not_interested"; updatedAt: string }> = {};
  for (const row of feedbackRows) {
    if (row.scope !== "item") continue;
    feedback[row.value] = {
      value: row.signal > 0 ? "like" : row.signal <= -2 ? "not_interested" : "dislike",
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
  const queues = allowQueues
    ? queueRows
        .map((row) => Queue.safeParse(row.payload))
        .filter((result): result is z.SafeParseSuccess<z.infer<typeof Queue>> => result.success)
        .map((result) => result.data)
    : [];
  const home = homePayload(homeRows);
  const rowOrder = z.array(z.string().trim().min(1).max(60)).max(30).catch([]).parse(home?.rowOrder);
  const rowOrderUpdatedAt = z.string().datetime().nullable().catch(null).parse(home?.rowOrderUpdatedAt);
  const feedbackTombstones = FeedbackTombstones.parse(home?.feedbackTombstones);
  const queueTombstones = allowQueues ? QueueTombstones.parse(home?.queueTombstones) : {};
  return {
    version: 1 as const,
    feedback,
    feedbackTombstones,
    queues,
    queueTombstones,
    rowOrder,
    rowOrderUpdatedAt,
  };
}

export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized", state: null }, { status: 401 });
  const allowQueues = await queuesAllowed(userId, request);
  return privateJson({
    state: await readState(userId, allowQueues),
    capabilities: { queueTemplates: allowQueues },
  });
}

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized", state: null }, { status: 401 });
  const parsed = MergeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  const incoming = parsed.data.state;
  const allowQueues = await queuesAllowed(userId, request);
  // A Free account may still synchronize ratings, dismissals, and row order.
  // Preserve any previously stored premium queue metadata without accepting
  // queue content or tombstones from an unentitled client.
  const storedQueueTombstones = allowQueues
    ? incoming.queueTombstones
    : QueueTombstones.parse(
        homePayload(await listWorkspacePreferences(userId, "watch-discovery"))?.queueTombstones,
      );
  await Promise.all([
    ...Object.entries(incoming.feedback).map(([key, entry]) =>
      setWatchFeedback(
        userId,
        "item",
        key,
        entry.value === "like" ? 1 : entry.value === "dislike" ? -1 : -2,
      ),
    ),
    ...(allowQueues
      ? incoming.queues.map((queue) =>
          upsertWorkspacePreference(userId, "watch-queue", queue.id, queue),
        )
      : []),
    upsertWorkspacePreference(userId, "watch-discovery", "home", {
      rowOrder: incoming.rowOrder,
      rowOrderUpdatedAt: incoming.rowOrderUpdatedAt,
      feedbackTombstones: incoming.feedbackTombstones,
      queueTombstones: storedQueueTombstones,
    }),
  ]);
  return privateJson({
    ok: true,
    state: await readState(userId, allowQueues),
    capabilities: { queueTemplates: allowQueues },
  });
}

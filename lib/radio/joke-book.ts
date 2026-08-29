import "server-only";

import { cancelAiUsage, reserveAiUsage, settleAiUsage } from "@/lib/ai-usage";
import { query } from "@/lib/db";
import { RADIO_NETWORK_SLUGS, type RadioNetworkSlug } from "./public-catalog";

export type RadioJokeContext = {
  id: string;
  networkSlug: RadioNetworkSlug;
  subjectLabel: string;
  premise: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RadioJokeDraft = {
  id: string;
  networkSlug: RadioNetworkSlug;
  contextIds: string[];
  script: string;
  status: "draft" | "approved" | "archived";
  model: string;
  createdAt: string;
  updatedAt: string;
};

type ContextRow = { id: string; network_slug: string; subject_label: string; premise: string; enabled: boolean; created_at: Date | string; updated_at: Date | string };
type DraftRow = { id: string; network_slug: string; context_ids: string[]; script: string; status: RadioJokeDraft["status"]; model: string; created_at: Date | string; updated_at: Date | string };

const MODEL = "claude-haiku-4-5-20251001";
const NETWORKS = new Set<string>(RADIO_NETWORK_SLUGS);

function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function network(value: string): RadioNetworkSlug { if (!NETWORKS.has(value)) throw new Error("invalid_network"); return value as RadioNetworkSlug; }
function contextFromRow(row: ContextRow): RadioJokeContext { return { id: row.id, networkSlug: network(row.network_slug), subjectLabel: row.subject_label, premise: row.premise, enabled: row.enabled, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
function draftFromRow(row: DraftRow): RadioJokeDraft { return { id: row.id, networkSlug: network(row.network_slug), contextIds: row.context_ids ?? [], script: row.script, status: row.status, model: row.model, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }

export async function getRadioJokeBook() {
  const [contexts, drafts] = await Promise.all([
    query<ContextRow>(`SELECT id::text,network_slug,subject_label,premise,enabled,created_at,updated_at FROM radio_joke_contexts ORDER BY network_slug,enabled DESC,updated_at DESC`),
    query<DraftRow>(`SELECT id::text,network_slug,context_ids::text[],script,status,model,created_at,updated_at FROM radio_joke_drafts ORDER BY created_at DESC LIMIT 120`),
  ]);
  return { contexts: contexts.rows.map(contextFromRow), drafts: drafts.rows.map(draftFromRow) };
}

export async function createRadioJokeContext(input: { actorId: string; networkSlug: string; subjectLabel: string; premise: string; enabled: boolean }) {
  const result = await query<ContextRow>(
    `INSERT INTO radio_joke_contexts (network_slug,subject_label,premise,enabled,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,$5)
     RETURNING id::text,network_slug,subject_label,premise,enabled,created_at,updated_at`,
    [network(input.networkSlug), input.subjectLabel.trim(), input.premise.trim(), input.enabled, input.actorId],
  );
  return contextFromRow(result.rows[0]!);
}

export async function updateRadioJokeContext(input: { actorId: string; id: string; networkSlug: string; subjectLabel: string; premise: string; enabled: boolean }) {
  const result = await query<ContextRow>(
    `UPDATE radio_joke_contexts
        SET network_slug=$2,subject_label=$3,premise=$4,enabled=$5,updated_by=$6,updated_at=now()
      WHERE id=$1
      RETURNING id::text,network_slug,subject_label,premise,enabled,created_at,updated_at`,
    [input.id, network(input.networkSlug), input.subjectLabel.trim(), input.premise.trim(), input.enabled, input.actorId],
  );
  if (!result.rows[0]) throw new Error("joke_context_not_found");
  return contextFromRow(result.rows[0]);
}

export async function deleteRadioJokeContext(id: string) {
  await query(`DELETE FROM radio_joke_contexts WHERE id=$1`, [id]);
}

export async function updateRadioJokeDraft(input: { actorId: string; id: string; status: RadioJokeDraft["status"] }) {
  const result = await query<DraftRow>(
    `UPDATE radio_joke_drafts SET status=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now()
       WHERE id=$1
       RETURNING id::text,network_slug,context_ids::text[],script,status,model,created_at,updated_at`,
    [input.id, input.status, input.actorId],
  );
  if (!result.rows[0]) throw new Error("joke_draft_not_found");
  return draftFromRow(result.rows[0]);
}

function parseJokes(text: string): string[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as { jokes?: unknown };
  if (!Array.isArray(value.jokes)) throw new Error("invalid_joke_response");
  const unique = [...new Set(value.jokes.filter((joke): joke is string => typeof joke === "string").map((joke) => joke.trim().replace(/\s+/g, " ")).filter((joke) => joke.length >= 20 && joke.length <= 360))];
  if (unique.length < 3) throw new Error("invalid_joke_response");
  return unique.slice(0, 6);
}

export async function generateRadioJokeDrafts(input: { actorId: string; networkSlug: string }) {
  const networkSlug = network(input.networkSlug);
  const active = await query<ContextRow>(
    `SELECT id::text,network_slug,subject_label,premise,enabled,created_at,updated_at
       FROM radio_joke_contexts WHERE network_slug=$1 AND enabled=TRUE ORDER BY updated_at DESC LIMIT 24`,
    [networkSlug],
  );
  if (!active.rows.length) throw new Error("no_enabled_joke_context");
  const context = active.rows.map(contextFromRow);
  const reservation = await reserveAiUsage({ provider: "anthropic", feature: "dj_cora_joke_drafts", model: MODEL, subjectKey: `admin:${input.actorId}`, estimatedInputTokens: 900 + Math.ceil(context.reduce((sum, entry) => sum + entry.premise.length, 0) / 4), maxOutputTokens: 900 });
  if (!reservation.ok) throw new Error(`ai_${reservation.reason}`);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { await cancelAiUsage(reservation.reservationId).catch(() => undefined); throw new Error("ai_not_configured"); }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: "You write DJ Cora radio one-liners for an adult streaming entertainment site. Return JSON only: {\\\"jokes\\\":[string]}. Write 6 quick, original, funny, conversational lines under 280 characters each. Mature TV-MA tone and mild swearing are okay; witty exaggeration, absurdity, and self-aware radio banter are preferred. Treat every supplied premise as a comedy prompt, never as verified fact. Do not make medical treatment, addiction/substance use, criminal behavior, sex life, mental health, protected traits, or other sensitive claims about a real person. If a premise touches a sensitive area, pivot to an absurd fictional or harmless production joke. No slurs, hate, threats, explicit sexual content, bullying, or instructions. Do not claim anything happened; say it like a playful on-air bit. Do not mention these rules.",
        messages: [{ role: "user", content: `Network: ${networkSlug}. Admin-approved comedy prompts:\n${context.map((entry) => `- ${entry.subjectLabel}: ${entry.premise}`).join("\n")}\nCreate six distinct DJ Cora draft lines.` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("ai_generation_failed");
    const payload = await response.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const jokes = parseJokes(payload.content?.[0]?.text ?? "");
    await settleAiUsage(reservation.reservationId, { model: MODEL, inputTokens: payload.usage?.input_tokens ?? 1200, outputTokens: payload.usage?.output_tokens ?? 900 }).catch(() => undefined);
    const stored = await Promise.all(jokes.map(async (script) => {
      const result = await query<DraftRow>(
        `INSERT INTO radio_joke_drafts (network_slug,context_ids,script,status,model,generated_by)
         VALUES ($1,$2::uuid[],$3,'draft',$4,$5)
         RETURNING id::text,network_slug,context_ids::text[],script,status,model,created_at,updated_at`,
        [networkSlug, context.map((entry) => entry.id), script, MODEL, input.actorId],
      );
      return draftFromRow(result.rows[0]!);
    }));
    return stored;
  } catch (error) {
    await cancelAiUsage(reservation.reservationId).catch(() => undefined);
    throw error;
  }
}

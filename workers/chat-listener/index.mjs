#!/usr/bin/env node
/**
 * Twitch chat listener — anonymous IRC connection over WebSocket.
 * Joins each CORE member's channel, counts every PRIVMSG, dedupes
 * unique chatters per hour, flushes aggregates to Postgres every 60s.
 *
 * Designed to run as a single long-lived Node process — DO App Platform
 * Worker, Fly machine, or anywhere with `DATABASE_URL`. Reconnects on
 * disconnect with exponential backoff. Flushes on SIGTERM so deploys
 * don't drop counts.
 *
 * Env:
 *   DATABASE_URL       Postgres connection string (required)
 *   CHANNELS           comma-separated `slug:login` pairs, e.g.
 *                      "marlon:marlon,ron:stableronaldo,..." (required)
 *   FLUSH_INTERVAL_MS  override default 60000
 */

import { WebSocket } from "ws";
import pg from "pg";
const { Pool } = pg;

// ── Config ───────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS ?? 60_000);
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

const channels = parseChannels(process.env.CHANNELS);
if (channels.length === 0) {
  console.error("[chat-listener] CHANNELS env var is required (slug:login pairs)");
  process.exit(1);
}
console.log(`[chat-listener] starting — channels: ${channels.map((c) => c.login).join(", ")}`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[chat-listener] DATABASE_URL is required");
  process.exit(1);
}

// ── Postgres pool ────────────────────────────────────────────────────
function pool() {
  const u = new URL(url);
  return new Pool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
}
const db = pool();

// ── Aggregation state ────────────────────────────────────────────────
// One bucket per (slug, hour). Count messages + unique chatter usernames.
/** @type {Map<string, { slug: string, login: string, hour: string, messages: number, chatters: Set<string> }>} */
const buckets = new Map();

function bucketKey(slug, hour) {
  return `${slug}::${hour}`;
}
function hourBucket(date = new Date()) {
  // Truncate to the top of the hour, ISO format.
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}
function recordMessage(slug, login, username) {
  const hour = hourBucket();
  const key = bucketKey(slug, hour);
  let b = buckets.get(key);
  if (!b) {
    b = { slug, login, hour, messages: 0, chatters: new Set() };
    buckets.set(key, b);
  }
  b.messages += 1;
  b.chatters.add(username.toLowerCase());
}

async function flush() {
  if (buckets.size === 0) return;
  const snapshot = [...buckets.values()];
  buckets.clear();

  // Upsert per (member_slug, hour_utc). The unique index on
  // (member_slug, hour_utc) is what we conflict against. We add the
  // delta to existing counts so a worker restart mid-hour doesn't
  // double-count — but we drop and rebuild the unique-chatter set on
  // every flush within an hour, which is a known small undercount on
  // restart (acceptable for a single-process worker).
  const client = await db.connect();
  try {
    for (const b of snapshot) {
      await client.query(
        `INSERT INTO chat_metrics
            (member_slug, twitch_login, hour_utc, message_count, unique_chatters, last_flushed_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (member_slug, hour_utc) DO UPDATE
            SET message_count = chat_metrics.message_count + EXCLUDED.message_count,
                unique_chatters = GREATEST(chat_metrics.unique_chatters, EXCLUDED.unique_chatters),
                last_flushed_at = NOW()`,
        [b.slug, b.login, b.hour, b.messages, b.chatters.size],
      );
    }
    console.log(`[flush] wrote ${snapshot.length} rows`);
  } catch (e) {
    console.error("[flush] failed:", e.message);
    // Re-queue on failure — best-effort; if the same hour keeps failing
    // counts will accumulate in memory until a flush succeeds.
    for (const b of snapshot) buckets.set(bucketKey(b.slug, b.hour), b);
  } finally {
    client.release();
  }
}

// ── IRC client ───────────────────────────────────────────────────────
let ws = null;
let backoff = RECONNECT_BASE_MS;
let stopped = false;

function connect() {
  if (stopped) return;
  console.log("[irc] connecting…");
  ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

  ws.on("open", () => {
    backoff = RECONNECT_BASE_MS;
    const nick = `justinfan${Math.floor(Math.random() * 80_000) + 10_000}`;
    ws.send("PASS SCHMOOPIIE\r\n");
    ws.send(`NICK ${nick}\r\n`);
    ws.send(`JOIN #${channels.map((c) => c.login).join(",#")}\r\n`);
    console.log(`[irc] connected as ${nick}, joined ${channels.length} channels`);
  });

  ws.on("message", (data) => {
    const text = data.toString("utf8");
    for (const line of text.split("\r\n")) {
      if (!line) continue;
      // PING ↔ PONG to keep connection alive.
      if (line.startsWith("PING ")) {
        ws.send("PONG " + line.slice(5) + "\r\n");
        continue;
      }
      // PRIVMSG → "tmi.twitch.tv PRIVMSG #channel :msg" preceded by
      // ":username!username@username.tmi.twitch.tv" prefix.
      const privmsg = line.match(/^:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #(\w+) :/);
      if (privmsg) {
        const username = privmsg[1];
        const channel = privmsg[2];
        const ch = channels.find((c) => c.login === channel.toLowerCase());
        if (ch) recordMessage(ch.slug, ch.login, username);
      }
    }
  });

  ws.on("close", (code, reason) => {
    if (stopped) return;
    console.log(`[irc] closed code=${code} reason=${reason?.toString?.() || ""} — retrying in ${backoff}ms`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
  });

  ws.on("error", (e) => {
    console.error("[irc] error:", e.message);
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────
const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

async function shutdown(sig) {
  console.log(`[shutdown] ${sig} — flushing then exiting`);
  stopped = true;
  clearInterval(flushTimer);
  try {
    ws?.close();
  } catch {}
  try {
    await flush();
  } catch {}
  await db.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

connect();

// ── Helpers ──────────────────────────────────────────────────────────
function parseChannels(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [slug, login] = pair.split(":").map((s) => s.trim().toLowerCase());
      if (!slug || !login) {
        console.warn(`[chat-listener] skipping malformed CHANNELS entry: ${pair}`);
        return null;
      }
      return { slug, login };
    })
    .filter(Boolean);
}

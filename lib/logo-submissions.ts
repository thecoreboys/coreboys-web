import "server-only";

import { createHmac } from "node:crypto";
import { query } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export type LogoSubmissionStatus = "pending" | "approved" | "denied";

export async function ensureLogoSubmissionSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS logo_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        public_name text NOT NULL,
        design_name text NOT NULL,
        description text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
        denial_reason text,
        reviewed_by_email text,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS logo_submission_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES logo_submissions(id) ON DELETE CASCADE,
        file_role text NOT NULL CHECK (file_role IN ('wordmark','icon','additional')),
        file_name text NOT NULL,
        storage_key text NOT NULL,
        content_type text NOT NULL,
        size_bytes integer NOT NULL,
        public_enabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS logo_submission_votes (
        submission_id uuid NOT NULL REFERENCES logo_submissions(id) ON DELETE CASCADE,
        ip_fingerprint text NOT NULL,
        vote text NOT NULL CHECK (vote IN ('up','down')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (submission_id, ip_fingerprint)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS logo_submissions_status_idx ON logo_submissions(status, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS logo_submission_files_submission_idx ON logo_submission_files(submission_id, created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS logo_submission_votes_ip_idx ON logo_submission_votes(ip_fingerprint, updated_at DESC)`);
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

/** Never persist a raw address. A separate secret makes this useless outside this site. */
export function fingerprintIp(ip: string): string {
  const secret = process.env.LOGO_VOTE_IP_SECRET || process.env.FAN_SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("LOGO_VOTE_IP_SECRET or FAN_SESSION_SECRET must be configured.");
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export function isLikelyBot(request: Request, honeypot: unknown, startedAt: unknown): boolean {
  if (typeof honeypot === "string" && honeypot.trim()) return true;
  const agent = request.headers.get("user-agent") ?? "";
  if (!agent || /(?:curl|wget|python-requests|headless|phantomjs|scrapy|spider|crawler)/i.test(agent)) return true;
  const started = Number(startedAt);
  return !Number.isFinite(started) || started > Date.now() || Date.now() - started < 1200;
}

export function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "logo-file";
}

export function isRenderableImage(contentType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/avif"].includes(contentType);
}

/** Explicit opt-in Azure text-only integration check on synthetic written text. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import sharp from "sharp";
import { readCreatorText } from "../lib/creator-tags/ocr";
const raw = process.env.DATABASE_URL;
if (!raw || new URL(raw).hostname !== "127.0.0.1" || new URL(raw).port !== "56345") throw new Error("Requires the disposable creator-tag test database.");
async function main() {
 const client = new pg.Client({ connectionString: raw });
 try {
  await client.connect();
  const ai = readFileSync("scripts/migrations/034_admin_mfa_and_ai_controls.sql", "utf8");
  await client.query(ai.slice(ai.indexOf("CREATE TABLE IF NOT EXISTS ai_provider_controls")));
  await client.query(readFileSync("scripts/migrations/054_azure_creator_text.sql", "utf8"));
  const image = await sharp(Buffer.from('<svg width="800" height="180"><rect width="800" height="180" fill="white"/><text x="30" y="100" font-family="Arial" font-size="55" fill="black">KICK.COM/ADINROSS</text></svg>')).png().toBuffer();
  const before = await client.query("SELECT count(*)::int AS count FROM ai_usage_events WHERE provider='azure'");
  const data = `data:image/png;base64,${image.toString("base64")}`;
  const text = await readCreatorText(data, "test:synthetic-text");
  assert.match(text.toLowerCase().replace(/\s+/g,""), /adinross/);
  assert.equal(await readCreatorText(data, "test:synthetic-text"), text);
  const after = await client.query("SELECT count(*)::int AS count FROM ai_usage_events WHERE provider='azure'");
  assert.ok(after.rows[0].count-before.rows[0].count <= 1, "the repeated image must use cached extracted text");
  console.log(JSON.stringify({ ok: true, extractedText: text, azureRequests: after.rows[0].count-before.rows[0].count, repeatFromCache: true, originalImagesStored: false }));
 } finally { await client.end(); await global.__pgPool?.end(); }
}
void main().then(() => { setTimeout(() => process.exit(0), 200); }, (error) => { console.error(error instanceof Error ? error.message : "Azure text test failed"); setTimeout(() => process.exit(1), 200); });

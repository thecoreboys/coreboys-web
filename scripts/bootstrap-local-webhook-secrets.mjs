import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const newline = "\r\n";
let source = await readFile(envPath, "utf8").catch(() => "");

function current(name) {
  return source.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function setMissing(name, value) {
  if (current(name)) return false;
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(source)) source = source.replace(pattern, line);
  else source = `${source.replace(/\s*$/, "")}${source.trim() ? newline : ""}${line}${newline}`;
  return true;
}

const generated = [];
if (setMissing("TWITCH_EVENTSUB_SECRET", randomBytes(32).toString("base64url"))) {
  generated.push("TWITCH_EVENTSUB_SECRET");
}
if (setMissing("YOUTUBE_WEBHOOK_SECRET", randomBytes(32).toString("hex"))) {
  generated.push("YOUTUBE_WEBHOOK_SECRET");
}
if (setMissing("YOUTUBE_WEBHOOK_VERIFY_TOKEN", randomBytes(24).toString("base64url"))) {
  generated.push("YOUTUBE_WEBHOOK_VERIFY_TOKEN");
}
if (setMissing("META_WEBHOOK_VERIFY_TOKEN", randomBytes(24).toString("base64url"))) {
  generated.push("META_WEBHOOK_VERIFY_TOKEN");
}

await writeFile(envPath, source.replace(/\s*$/, "") + newline, "utf8");
console.log(generated.length
  ? `Configured local signing values: ${generated.join(", ")}.`
  : "Local webhook signing values were already configured.");
console.log("No provider subscription was created or changed.");

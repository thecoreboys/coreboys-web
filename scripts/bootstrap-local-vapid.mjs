import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import webpush from "web-push";

const envPath = resolve(process.cwd(), ".env.local");
const newline = "\r\n";
let source = await readFile(envPath, "utf8").catch(() => "");

function current(name) {
  return source.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function setValue(name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(source)) source = source.replace(pattern, line);
  else source = `${source.replace(/\s*$/, "")}${source.trim() ? newline : ""}${line}${newline}`;
}

const publicKey = current("VAPID_PUBLIC_KEY");
const privateKey = current("VAPID_PRIVATE_KEY");
if (!publicKey || !privateKey) {
  const generated = webpush.generateVAPIDKeys();
  setValue("VAPID_PUBLIC_KEY", generated.publicKey);
  setValue("VAPID_PRIVATE_KEY", generated.privateKey);
}
if (!current("VAPID_SUBJECT")) {
  setValue("VAPID_SUBJECT", "mailto:notifications@thecoreboys.com");
}

// Deliberately do not enable delivery. Turning this on can contact real fan
// endpoints and must remain an explicit operator action after QA.
if (!/^SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED=/m.test(source)) {
  setValue("SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED", "false");
}

await writeFile(envPath, source.replace(/\s*$/, "") + newline, "utf8");
console.log("Configured local VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.");
console.log("SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED was left disabled.");

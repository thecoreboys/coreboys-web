/** Museum / print-edition helpers. Looks on-chain; lives in the house DB. */

export function catalogNumber(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % 10000;
  return `CORE-26-${String(n).padStart(4, "0")}`;
}

export function programFingerprint(title: string, at = new Date()): string {
  const raw = `${title}|${at.toISOString().slice(0, 13)}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 33 + raw.charCodeAt(i)) >>> 0;
  return `0x${h.toString(16).padStart(8, "0")}`;
}

export function isLikelyExpiring(kind: string, publishedAt?: string): boolean {
  if (kind !== "vod" && kind !== "live") return false;
  if (!publishedAt) return kind === "live";
  const age = Date.now() - new Date(publishedAt).getTime();
  return age > 10 * 86400000;
}

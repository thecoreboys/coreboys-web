import { NextResponse } from "next/server";
export function sameOrigin(request: Request): boolean {
  const origins = [new URL(request.url).origin];
  try { if (process.env.NEXT_PUBLIC_SITE_URL) origins.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin); } catch { /* ignore invalid configuration */ }
  return origins.includes(request.headers.get("origin") ?? "");
}
export async function boundedCreatorJson(request: Request, limit = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Request is too large."); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}
export function creatorError(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }

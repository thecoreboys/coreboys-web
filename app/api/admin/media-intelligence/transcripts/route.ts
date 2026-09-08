import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { listTranscriptImports, reviewTranscriptImport, submitTranscriptImport, transcriptImportEvidence } from "@/lib/media-intelligence/transcript-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), assetKey: z.string().trim().min(3).max(500), source: z.string().min(10).max(1_000_000),
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/), rightsReference: z.string().trim().min(8).max(1000), rightsConfirmed: z.literal(true) }),
  z.object({ action: z.enum(["approve", "reject", "revoke"]), id: z.string().regex(/^[a-f0-9]{64}$/) }),
]);

async function boundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_100_000) { await reader.cancel(); throw new Error("Request exceeds 1 MB."); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (id && !/^[a-f0-9]{64}$/.test(id)) return NextResponse.json({ error: "Invalid import ID." }, { status: 400 });
  return NextResponse.json(id ? { cues: await transcriptImportEvidence(id) } : { imports: await listTranscriptImports() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  // Cookie-authenticated mutations must originate from this admin interface.
  const origins = [new URL(request.url).origin];
  if (process.env.NEXT_PUBLIC_SITE_URL) origins.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
  if (!origins.includes(request.headers.get("origin") ?? "")) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const parsed = Input.safeParse(await boundedJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Check the asset key, captions, language and rights confirmation." }, { status: 400 });
    const input = parsed.data;
    const result = input.action === "import"
      ? await submitTranscriptImport({ ...input, actor: auth.id })
      : await reviewTranscriptImport(input.id, input.action, auth.id);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    // No raw database errors, signed artifacts or caption content in responses.
    const message = error instanceof Error && !('code' in error) ? error.message : "Transcript operation could not be completed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  }
}

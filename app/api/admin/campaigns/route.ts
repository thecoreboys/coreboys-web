import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { requestHasSameOrigin } from "@/lib/x/security";
import { getAdminCampaigns, saveCampaign } from "@/lib/campaigns/store";
import { campaignMutationSchema } from "@/lib/campaigns/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try { return json({ campaigns: await getAdminCampaigns() }); }
  catch { return json({ error: "Campaigns could not be loaded. Try again." }, 503); }
}

async function mutate(request: Request, updating: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!requestHasSameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  let payload: unknown;
  try {
    if (Number(request.headers.get("content-length")) > 20_000) return json({ error: "Campaign details are too large." }, 413);
    const body = await request.text();
    if (body.length > 20_000) return json({ error: "Campaign details are too large." }, 413);
    payload = JSON.parse(body);
  } catch { return json({ error: "Enter valid campaign details." }, 400); }
  const result = campaignMutationSchema.safeParse(payload);
  if (!result.success) return json({ error: "Check the campaign details.", issues: result.error.issues.map(({ path, message }) => ({ field: path.join("."), message })) }, 400);
  const { campaign, id, revision } = result.data;
  if (updating ? (!id || !revision) : (id !== undefined || revision !== undefined)) return json({ error: "Reload this campaign before saving." }, 400);
  try {
    const saved = await saveCampaign(campaign, auth.id, id, revision);
    if (!saved) return json({ error: "This campaign changed in another window. Reload before saving." }, 409);
    return json({ campaign: saved }, updating ? 200 : 201);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return json({ error: "This campaign link has already been added. Edit its existing card." }, 409);
    return json({ error: "The campaign could not be saved. Your changes are still in the editor." }, 503);
  }
}

export const POST = (request: Request) => mutate(request, false);
export const PATCH = (request: Request) => mutate(request, true);

import { handlePassportAction } from "@/app/api/account/passport/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePassportAction(req);
}

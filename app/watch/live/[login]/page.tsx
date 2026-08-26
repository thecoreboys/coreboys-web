import { redirect } from "next/navigation";
import { MEMBERS } from "@/lib/members";

type Params = { params: Promise<{ login: string }> };

/** Shareable tune-in URL — /watch/live/adapt */
export default async function LiveTuneInPage({ params }: Params) {
  const { login } = await params;
  const member = MEMBERS.find((m) => m.twitchLogin.toLowerCase() === login.toLowerCase());
  const slug = member?.slug ?? login.toLowerCase();
  redirect(`/theater?kind=live&login=${encodeURIComponent(login.toLowerCase())}&slug=${encodeURIComponent(slug)}`);
}

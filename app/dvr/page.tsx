import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { MyListPage } from "@/components/watch/MyListPage";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getWatchCatalog } from "@/lib/watch/catalog";
import "../watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DVR",
  description: "Your saved CORE programs with watch progress ready to resume.",
  alternates: { canonical: "/dvr" },
  robots: { index: false, follow: false },
};

export default async function DvrRoute() {
  if (!(await getCurrentFanUserId())) redirect("/login?next=/dvr");
  const catalog = await getWatchCatalog();

  return (
    <WatchChrome catalog={catalog}>
      <MyListPage catalog={catalog} />
    </WatchChrome>
  );
}

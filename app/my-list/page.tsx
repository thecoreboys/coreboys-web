import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  title: "DVR",
  description: "Your saved CORE programs with watch progress ready to resume.",
  alternates: { canonical: "/dvr" },
  robots: { index: false, follow: false },
};

export default async function MyListRoute() {
  redirect("/dvr" as never);
}

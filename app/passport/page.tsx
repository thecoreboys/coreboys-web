import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PassportDashboard } from "@/components/passport/PassportDashboard";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import "./passport.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CORE Passport",
  description: "Your CORE achievements, Moment Cards, channel identity, and digital Memory Book.",
  alternates: { canonical: "/passport" },
  robots: { index: false, follow: false },
};

export default async function PassportPage() {
  if (!(await getCurrentFanUserId())) redirect("/login?next=/passport");
  return <PassportDashboard />;
}

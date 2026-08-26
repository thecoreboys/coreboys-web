import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin-api";

/**
 * Server-side gate for /admin/* pages, plus the layout chrome shared
 * by all admin tools. Middleware already redirects unauthenticated
 * visitors to /admin/sign-in; this layout double-checks server-side so
 * a misconfigured matcher can't ever leak admin content.
 *
 * Middleware supplies a trusted pathname header so the public sign-in page
 * can share this layout while every other admin page is checked against the
 * live database role in addition to the edge JWT check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-coreboys-pathname") === "/admin/sign-in") {
    return <>{children}</>;
  }
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/sign-in?next=/admin" as never);
  if (staff.role !== "admin") redirect("/studio" as never);
  return <>{children}</>;
}

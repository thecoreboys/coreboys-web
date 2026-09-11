import { redirect } from "next/navigation";
import type { Route } from "next";

/** Preserve bookmarked links and billing return parameters. */
export default async function AccountPlanPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  redirect(`/account/settings/billing${query.size ? `?${query}` : ""}` as Route);
}

import { redirect } from "next/navigation";

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy/direct entrypoint: account creation always uses the shared modal. */
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const incoming = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(incoming)) {
    if (key === "auth" || typeof value === "undefined") continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  query.set("auth", "signup");
  redirect(`/?${query.toString()}`);
}

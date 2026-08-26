import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy/direct entrypoint: authentication always uses the shared modal. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const incoming = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(incoming)) {
    if (key === "auth" || typeof value === "undefined") continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  query.set("auth", "login");
  redirect(`/?${query.toString()}`);
}

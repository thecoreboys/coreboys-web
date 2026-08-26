import { redirect } from "next/navigation";

// Community has been merged into the Fanzone (polls now live there).
export default function Page() {
  redirect("/fanzone#polls");
}

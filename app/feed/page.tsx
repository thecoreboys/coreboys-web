import { permanentRedirect } from "next/navigation";

/** The former standalone feed now lives inside the Watch homepage. */
export default function FeedPage() {
  permanentRedirect("/#latest");
}

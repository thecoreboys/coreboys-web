import { permanentRedirect } from "next/navigation";

/** Legacy top-level Watch URL. Deep routes under /watch remain intact. */
export default function WatchPage() {
  permanentRedirect("/");
}

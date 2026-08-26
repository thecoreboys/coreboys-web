"use client";

import { Home01, SearchLg } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";

/**
 * Client island for the 404 page's button row — the Untitled UI `Button`
 * is a client component, so its icon-function props can't be passed across
 * the server/client boundary from the (server) not-found page. Keeping the
 * actions in their own client module sidesteps that serialization limit.
 */
export function NotFoundActions() {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
      <Button color="secondary" size="lg" href="/clips" iconLeading={SearchLg}>
        Browse clips
      </Button>
      <Button size="lg" href="/" iconLeading={Home01}>
        Back to home
      </Button>
    </div>
  );
}

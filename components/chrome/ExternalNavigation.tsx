"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EXTERNAL_NAVIGATION_ERROR, EXTERNAL_NAVIGATION_START, installExternalLinkPolicy } from "@/lib/external-navigation";

export function ExternalNavigation() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const removePolicy = installExternalLinkPolicy(document, window);
    const onError = () => setFailed(true);
    const onStart = () => setFailed(false);
    window.addEventListener(EXTERNAL_NAVIGATION_ERROR, onError);
    window.addEventListener(EXTERNAL_NAVIGATION_START, onStart);
    return () => {
      removePolicy();
      window.removeEventListener(EXTERNAL_NAVIGATION_ERROR, onError);
      window.removeEventListener(EXTERNAL_NAVIGATION_START, onStart);
    };
  }, []);
  if (!failed) return null;
  return (
    <div role="alert" className="fixed bottom-[calc(1rem+var(--mobile-nav-space,0px))] right-4 z-[200] flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-xl border border-secondary bg-primary p-4 text-sm text-primary shadow-xl">
      <p>We couldn&apos;t open your browser. Please try the link again.</p>
      <button type="button" aria-label="Dismiss browser message" className="flex min-h-11 min-w-11 items-center justify-center rounded p-2 focus-visible:outline focus-visible:outline-2" onClick={() => setFailed(false)}><X size={18} aria-hidden="true" /></button>
    </div>
  );
}

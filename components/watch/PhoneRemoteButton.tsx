"use client";

import { Check, Copy, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openAuthModal } from "@/lib/auth/modal";
import { MULTIVIEW_LAUNCH_PATH, MULTIVIEW_REMOTE_PATH } from "@/lib/watch/multiview-remote";

export type PhoneRemoteConnection = "signed-out" | "connecting" | "connected" | "reconnecting" | "secure-context-required";

const STATUS: Record<PhoneRemoteConnection, { label: string; tone: string }> = {
  connected: { label: "Ready for your phone", tone: "bg-emerald-400" },
  connecting: { label: "Connecting…", tone: "bg-amber-300" },
  reconnecting: { label: "Reconnecting…", tone: "bg-amber-300" },
  "signed-out": { label: "Sign in to use", tone: "bg-room-ink/30" },
  "secure-context-required": { label: "Needs HTTPS", tone: "bg-room-ink/30" },
};

const FEATURES = ["Switch the main view", "Turn sound on or off", "Mute everything", "Maximize or restore", "Switch to Theater"];

/** One compact entry point on the computer for controlling this room from a phone. */
export function PhoneRemoteButton({ connection, align = "start" }: { connection: PhoneRemoteConnection; align?: "start" | "end" }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState(MULTIVIEW_REMOTE_PATH);
  useEffect(() => { setRemoteUrl(new URL(MULTIVIEW_REMOTE_PATH, window.location.origin).href); }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const status = STATUS[connection];
  const displayUrl = remoteUrl.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(remoteUrl);
      setCopied(true);
    } catch { /* The link stays visible and selectable. */ }
  }

  return (
    <details ref={detailsRef} className="relative" onKeyDown={(event) => { if (event.key === "Escape") detailsRef.current?.removeAttribute("open"); }}>
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl bg-room-ink/[0.045] px-3 text-xs font-semibold text-room-secondary ring-1 ring-inset ring-room-ink/10 transition hover:bg-room-ink/8 hover:text-room-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink [&::-webkit-details-marker]:hidden">
        <Smartphone className="size-3.5" aria-hidden />
        Phone remote
        <span className={`size-1.5 rounded-full ${status.tone}`} aria-hidden />
        <span className="sr-only">: {status.label}</span>
      </summary>
      <div className={`absolute ${align === "end" ? "right-0" : "left-0"} top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-room-ink/12 bg-room-raised p-4 text-room-ink shadow-2xl`}>
        <p className="flex items-center gap-2 text-[11px] font-semibold text-room-muted" role="status">
          <span className={`size-2 rounded-full ${status.tone}`} aria-hidden />{status.label}
        </p>
        <h3 className="mt-2 text-sm font-semibold">Control this room from your phone</h3>
        <ol className="mt-3 space-y-2 text-xs leading-5 text-room-secondary">
          <li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-room-ink/10 text-[10px] font-bold">1</span>Open this link on your phone.</li>
          <li className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-room-ink/10 text-[10px] font-bold">2</span>Sign in with the same CORE account as this computer.</li>
        </ol>
        <div className="mt-3 flex items-center gap-1 rounded-xl bg-room-ink/[0.05] p-1 ring-1 ring-inset ring-room-ink/10">
          <input readOnly value={displayUrl} aria-label="Phone remote link" onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-room-ink outline-none" />
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-room-ink px-3 text-xs font-semibold text-room-inverse transition hover:bg-room-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-ink">
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-[11px] font-semibold text-room-muted">From your phone you can</p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {FEATURES.map((feature) => <li key={feature} className="rounded-full bg-room-ink/[0.06] px-2 py-1 text-[10px] text-room-secondary">{feature}</li>)}
        </ul>
        {connection === "signed-out" ? (
          <button type="button" onClick={() => openAuthModal({ next: MULTIVIEW_LAUNCH_PATH })} className="mt-4 min-h-10 w-full cursor-pointer rounded-xl bg-room-ink text-xs font-semibold text-room-inverse transition hover:bg-room-ink/90">Sign in on this computer</button>
        ) : null}
        {connection === "secure-context-required" ? <p className="mt-3 text-[11px] leading-4 text-room-muted">Open this site over HTTPS to connect a phone.</p> : null}
      </div>
    </details>
  );
}

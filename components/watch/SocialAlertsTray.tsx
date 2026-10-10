"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Eye, ExternalLink, LayoutGrid, X } from "lucide-react";
import { useNotificationActivation } from "@/components/notifications/useNotificationActivation";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";
import type { SocialAlert } from "@/lib/social-alert";
import { socialAlertLabel, socialAlertPrimaryAction } from "@/lib/social-alert";
import { playableFromUrl } from "@/lib/watch/playable";

export function SocialAlertsTray() {
  const [alerts, setAlerts] = useState<SocialAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [tileError, setTileError] = useState("");
  const { activate, previewDialog } = useNotificationActivation();
  const player = usePlayer();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/account/alerts?limit=20", { credentials: "same-origin" });
        if (!response.ok) return;
        const data = await response.json() as { alerts?: SocialAlert[] };
        if (active) setAlerts(data.alerts?.filter((alert) => !alert.read) ?? []);
      } catch {
        // The durable notification center remains available if this tray fails.
      }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function dismiss(id: string) {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    await fetch("/api/account/alerts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  function activateAlert(alert: SocialAlert) {
    void dismiss(alert.id);
    activate({
      href: alert.href,
      title: alert.title,
      body: alert.body,
      imageUrl: alert.artworkUrl,
      avatarUrl: alert.avatarUrl,
    });
  }

  function addToMultiview(alert: SocialAlert) {
    const parsed = playableFromUrl(alert.href);
    if (!parsed) return;
    const live = alert.contentType === "live";
    const playable = {
      ...parsed,
      kind: live ? "live" as const : parsed.kind,
      format: live ? "live" as const : alert.contentType === "short" ? "short" as const : parsed.format,
      title: alert.title || parsed.title,
      poster: alert.artworkUrl || parsed.poster,
      memberSlug: alert.memberSlug ?? parsed.memberSlug,
      memberLabel: parsed.memberLabel,
      accountLabel: parsed.accountLabel,
      orientation: alert.orientation ?? parsed.orientation,
    };
    const tileId = player.addTile(playable, { focus: true, muted: true });
    if (!tileId) {
      setTileError("Multiview is full. Remove a tile and try again.");
      return;
    }
    setTileError("");
    void dismiss(alert.id);
    router.push("/multiview");
  }

  const visible = open ? alerts : alerts.slice(0, 3);
  // Keep an active fallback preview mounted even after activating an alert
  // removes it from the tray. Otherwise the optimistic dismiss would close
  // the dialog in the same render that opens it.
  if (!visible.length) return <>{previewDialog}</>;

  return (
    <>
      <section
        aria-label="Creator alerts"
        className="fixed right-3 top-[calc(4.25rem+var(--live-ribbon-h,0px))] z-[96] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
      >
        {visible.map((alert) => (
          <article key={alert.id} className={`group overflow-hidden rounded-2xl border bg-[#151519]/95 text-white shadow-2xl backdrop-blur-xl ${alert.contentType === "live" ? "border-red-400/45 shadow-[0_0_0_1px_rgba(248,113,113,.14),0_0_28px_rgba(239,68,68,.12),0_20px_50px_rgba(0,0,0,.48)]" : "border-pink-400/30 shadow-[0_0_0_1px_rgba(244,114,182,.1),0_0_24px_rgba(219,3,104,.1),0_20px_50px_rgba(0,0,0,.48)]"}`}>
            <div className="flex gap-3 p-3">
              {alert.artworkUrl ? (
                <img src={alert.artworkUrl} alt="" className={`h-16 w-24 shrink-0 rounded-lg object-cover ${alert.orientation === "portrait" ? "w-12" : ""}`} />
              ) : alert.avatarUrl ? (
                <img src={alert.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--core)]/20 text-[color:var(--core)]"><Bell className="size-4" /></span>
              )}
              <button type="button" onClick={() => activateAlert(alert)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90">
                <span className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${alert.contentType === "live" ? "text-red-400" : "text-white/50"}`}>
                  {socialAlertLabel(alert)}
                  <BrowserRelativeTime value={alert.publishedAt} fallback="Just now" className="font-normal normal-case tracking-normal text-white/45" />
                </span>
                <strong className="mt-0.5 block break-words text-sm leading-snug [overflow-wrap:anywhere]">{alert.title}</strong>
                {alert.body ? <span className="mt-1 line-clamp-2 block break-words text-[11px] leading-relaxed text-white/55 [overflow-wrap:anywhere]">{alert.body}</span> : null}
              </button>
              <button type="button" onClick={() => void dismiss(alert.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss alert"><X className="size-3.5" /></button>
            </div>
            <div className="flex gap-2 border-t border-white/10 px-3 py-2">
              <button type="button" onClick={() => activateAlert(alert)} className="inline-flex min-h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/85">
                {socialAlertPrimaryAction(alert)}
              </button>
              {playableFromUrl(alert.href) ? (
                <button type="button" onClick={() => addToMultiview(alert)} title="Add to multiview" aria-label={`Add ${alert.title} to multiview`} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"><LayoutGrid className="size-3.5" />Add tile</button>
              ) : (
                <a href={alert.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"><ExternalLink className="size-3.5" />Open source</a>
              )}
              <button type="button" onClick={() => void dismiss(alert.id)} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"><Eye className="size-3.5" />{alert.contentType === "live" ? "Keep watching" : "Later"}</button>
            </div>
            {tileError ? <p role="status" className="px-3 pb-2 text-[11px] text-amber-200">{tileError}</p> : null}
          </article>
        ))}
        {alerts.length > 3 ? (
          <button type="button" onClick={() => setOpen((value) => !value)} className="self-end rounded-full bg-[#151519]/95 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/15">
            {open ? "Close inbox" : `${alerts.length - 3} more alerts`}
          </button>
        ) : null}
      </section>
      {previewDialog}
    </>
  );
}

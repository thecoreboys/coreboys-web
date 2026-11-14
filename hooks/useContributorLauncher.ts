"use client";
import { useEffect, useRef, useState } from "react";
import { launcherPlacement } from "@/lib/contributors/launcher-placement";

const surfaces = 'section[aria-label="Now playing"], #dj-cora-panel, button[aria-label*="DJ Cora"], .watch-together, .passport-status-toast, .mobile-bottom-nav, [data-floating-widget]';
export function useContributorLauncher(pathname: string | null) {
  const ref = useRef<HTMLButtonElement>(null);
  const lift = useRef(0);
  const [placement, setPlacement] = useState({ lift: 0, hidden: false });
  useEffect(() => {
    const button = ref.current; if (!button) return;
    let frame = 0;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => schedule());
    function measure() {
      frame = 0;
      const box = button!.getBoundingClientRect();
      const base = { left: box.left, right: box.right, top: box.top + lift.current, bottom: box.bottom + lift.current };
      const elements = [...document.querySelectorAll<HTMLElement>(surfaces)].filter(el => el !== button);
      for (const el of elements) { if (!observed.has(el)) { resize.observe(el); observed.add(el); } }
      for (const el of observed) { if (!el.isConnected) { resize.unobserve(el); observed.delete(el); } }
      const visible = elements.filter(el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      });
      const ceiling = Math.max(12, document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 12);
      const next = launcherPlacement(base, visible.map(el => el.getBoundingClientRect()), ceiling);
      if (document.fullscreenElement || visible.some(el => el.getAttribute('aria-modal') === 'true')) next.hidden = true;
      lift.current = next.lift;
      setPlacement(previous => previous.lift === next.lift && previous.hidden === next.hidden ? previous : next);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    const mutation = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || record.target === document.documentElement || record.target === document.body || (record.target instanceof Element && record.target.closest(surfaces)))) schedule();
    });
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-expanded', 'data-state', 'data-player-fullscreen'] });
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    resize.observe(button); schedule();
    window.addEventListener('resize', schedule); document.addEventListener('fullscreenchange', schedule); document.addEventListener('transitionend', schedule);
    return () => { resize.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); document.removeEventListener('fullscreenchange', schedule); document.removeEventListener('transitionend', schedule); };
  }, [pathname]);
  return { ref, placement };
}

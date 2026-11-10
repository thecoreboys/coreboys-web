"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, ChevronRight, Clapperboard, Home, Radio, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { NETWORK_CHANNELS } from "@/lib/watch/channels";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import Image from "@/components/ui/SiteImage";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/channels/core?mode=continuous", label: "24/7", icon: Radio },
  { href: "/shorts", label: "Shorts", icon: Clapperboard },
  { href: "/guide", label: "Guide", icon: CalendarDays },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number; startX: number; startY: number; lastY: number;
    lastTime: number; velocity: number; offset: number;
  } | null>(null);

  function changeOpen(next: boolean) {
    drag.current = null;
    setDragging(false);
    if (next) setDragY(0);
    setOpen(next);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest("button, a"))) return;
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, offset: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    current.offset = dy > Math.abs(event.clientX - current.startX) ? dy : 0;
    current.velocity = (event.clientY - current.lastY) / Math.max(1, event.timeStamp - current.lastTime);
    current.lastY = event.clientY;
    current.lastTime = event.timeStamp;
    setDragY(current.offset);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 480;
    const recentFlick = event.timeStamp - current.lastTime < 100 && current.velocity > 0.6 && current.offset > 40;
    if (current.offset >= Math.min(120, height * 0.25) || recentFlick) setOpen(false);
    else setDragY(0);
  }

  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDragY(0);
  }

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const closeOnDesktop = () => { if (!mobile.matches) setOpen(false); };
    mobile.addEventListener("change", closeOnDesktop);
    return () => mobile.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName));
      setKeyboardOpen(editing && window.innerHeight - viewport.height > 150);
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  if (pathname.startsWith("/admin") || pathname.startsWith("/studio")) return null;
  const membersActive = pathname.startsWith("/channels/") && !pathname.startsWith("/channels/core");

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation" data-keyboard-open={keyboardOpen ? "true" : undefined}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : href.startsWith("/channels/core") ? pathname.startsWith("/channels/core") : pathname.startsWith(href);
          return <Link key={href} href={href} prefetch={false} className="mobile-bottom-nav__item" aria-current={active ? "page" : undefined}>
            <Icon size={21} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>;
        })}
        <Dialog.Trigger asChild>
          <button type="button" className="mobile-bottom-nav__item" data-active={membersActive || open ? "true" : undefined}>
            <UsersRound size={21} strokeWidth={1.8} aria-hidden="true" /><span>Members</span>
          </button>
        </Dialog.Trigger>
      </nav>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-members-overlay" />
        <Dialog.Content className="mobile-members-sheet" aria-describedby="mobile-members-description" data-dragging={dragging ? "true" : undefined} style={{ "--members-drag-y": `${dragY}px` } as CSSProperties}>
          <div className="mobile-members-sheet__drag-area" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
            <div className="mobile-members-sheet__handle" aria-hidden="true" />
            <div className="mobile-members-sheet__header">
            <div><Dialog.Title className="mobile-members-sheet__title">Choose a member</Dialog.Title>
              <Dialog.Description id="mobile-members-description" className="mobile-members-sheet__description">Go to their channel. Drag down to close.</Dialog.Description></div>
            <Dialog.Close className="mobile-members-sheet__close" aria-label="Close members"><X size={20} aria-hidden="true" /></Dialog.Close>
            </div>
          </div>
          <div className="mobile-members-sheet__list">
            {NETWORK_CHANNELS.filter((channel) => channel.memberSlug).map((channel) => {
              const member = MEMBERS_BY_SLUG[channel.memberSlug!];
              return <Dialog.Close asChild key={channel.slug}>
                <Link href={`/channels/${channel.slug}`} prefetch={false} className="mobile-members-sheet__member" aria-current={pathname === `/channels/${channel.slug}` ? "page" : undefined}>
                  <span className="mobile-members-sheet__avatar"><Image src={channel.artwork} alt="" width={44} height={44} sizes="44px" loading="lazy" /></span>
                  <span className="mobile-members-sheet__name">{member?.stageName ?? channel.host}<small>{channel.name}</small></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </Dialog.Close>;
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

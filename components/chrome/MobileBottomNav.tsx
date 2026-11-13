"use client";

import { CalendarDays, Clapperboard, Home, Radio, UsersRound } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The member sheet (Radix dialog, focus trap, scroll lock) is only needed after
// a tap, so it stays out of the layout bundle every page loads.
const loadMembersSheet = () => import("./MobileMembersSheet").then((module) => module.MobileMembersSheet);
const MobileMembersSheet = dynamic(loadMembersSheet, { ssr: false });

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/channels/core?mode=continuous", label: "24/7", icon: Radio },
  { href: "/shorts", label: "Shorts", icon: Clapperboard },
  { href: "/guide", label: "Guide", icon: CalendarDays },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Mount the sheet once it has been wanted, then keep it mounted so the
  // close animation and later opens behave exactly like an always-mounted dialog.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  function openSheet() {
    setSheetMounted(true);
    setOpen(true);
  }

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const closeOnDesktop = () => { if (!mobile.matches) setOpen(false); };
    mobile.addEventListener("change", closeOnDesktop);
    // Fetch the sheet's code in idle time on phones so the first tap opens it
    // without waiting on the network.
    if (!mobile.matches) return () => mobile.removeEventListener("change", closeOnDesktop);
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => { void loadMembersSheet(); }, { timeout: 4_000 })
      : window.setTimeout(() => { void loadMembersSheet(); }, 2_500);
    return () => {
      mobile.removeEventListener("change", closeOnDesktop);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
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
    <>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation" data-keyboard-open={keyboardOpen ? "true" : undefined}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : href.startsWith("/channels/core") ? pathname.startsWith("/channels/core") : pathname.startsWith(href);
          return <Link key={href} href={href} prefetch={false} className="mobile-bottom-nav__item" aria-current={active ? "page" : undefined}>
            <Icon size={21} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>;
        })}
        <button
          type="button"
          className="mobile-bottom-nav__item"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          data-active={membersActive || open ? "true" : undefined}
          onPointerDown={() => { void loadMembersSheet(); }}
          onClick={openSheet}
        >
          <UsersRound size={21} strokeWidth={1.8} aria-hidden="true" /><span>Members</span>
        </button>
      </nav>
      {sheetMounted ? <MobileMembersSheet open={open} onOpenChange={setOpen} pathname={pathname} /> : null}
    </>
  );
}

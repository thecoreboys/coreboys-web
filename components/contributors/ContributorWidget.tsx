"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useContributorLauncher } from "@/hooks/useContributorLauncher";
import { useDesktopUtilities } from "@/hooks/useDesktopUtilities";
import { OPEN_CONTRIBUTOR_FORM_EVENT } from "@/lib/site-utility-events";

const loadForm = () => import("./ContributorForm").then(module => module.ContributorForm);
const ContributorForm = dynamic(loadForm, { ssr: false,
  loading: () => <div className="contribute-loading" role="status">Loading form…</div>,
});

export function ContributorWidget() {
  const pathname = usePathname();
  const desktop = useDesktopUtilities();
  const launcher = useContributorLauncher(pathname, desktop);
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const show = () => { setHasOpened(true); setOpen(true); };

  useEffect(() => {
    const showForm = () => { setHasOpened(true); setOpen(true); };
    window.addEventListener(OPEN_CONTRIBUTOR_FORM_EVENT, showForm);
    return () => window.removeEventListener(OPEN_CONTRIBUTOR_FORM_EVENT, showForm);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/studio") || pathname?.startsWith("/access")) return null;
  return <>
    {desktop ? <button ref={launcher.ref} type="button" className="contribute-launcher"
      data-occluded={launcher.placement.hidden ? "true" : undefined}
      style={{ transform: `translateY(-${launcher.placement.lift}px)` }}
      onPointerEnter={() => { void loadForm(); }} onFocus={() => { void loadForm(); }}
      onClick={show} aria-haspopup="dialog" aria-expanded={open}>
      <MessageSquare size={16} strokeWidth={1.6} aria-hidden /><span>Help & suggestions</span>
    </button> : null}
    {hasOpened ? <ContributorForm open={open} onOpenChange={setOpen} onReturnFocus={() => {
      if (launcher.ref.current?.getClientRects().length) launcher.ref.current.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>('[aria-controls="mobile-navigation"]')?.focus();
    }} /> : null}
  </>;
}
